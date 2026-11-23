/**
 * Host 路由（挂在 DSH 自己的 webServer 上，全部 owner-only）。
 *
 * | 路由 | 行为 |
 * |---|---|
 * | GET  /dsh-canvas/launch?cwd= | 302 到画布 URL（含 #secret；fragment 不发给服务端） |
 * | GET  /dsh-canvas/styles?cwd= | 风格列表 + 当前锁定 |
 * | POST /dsh-canvas/design-mode | 开启/关闭设计模式，锁定项目风格 |
 * | GET  /dsh-canvas/design-state?sessionId= | 设计模式状态 + 消费 openRequested |
 *
 * 认证：`ctx.connection.requestRejection` 把 DSH 自己的 Host/Origin 检查与浏览器
 * 认证套到本插件的路由上；没有 connection 服务时退化为「仅回环 Host + 同源」。
 * 任何日志都不打印带 secret 的画布 URL。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync, statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import {
  designStyleExists,
  designStyleSummary,
  isBuiltinStyle,
  loadDesignCatalog,
} from '../design.js'
import { applyProjectStyle, currentStyleId } from '../designOps.js'
import { formatPublicError, reportError } from '../errors.js'
import { ensureServer } from '../server.js'
import {
  clearDesignState,
  isDesignSession,
  recentCwd,
  rememberCwd,
  setDesignState,
  stateOf,
  takeOpenRequest,
} from './designMode.js'
import type {
  ConnectionService,
  PluginContext,
  SessionsService,
  WebServerService,
} from './types.js'

/** 路由前缀（同一前缀下四个精确路径）。 */
export const ROUTE_PREFIX = '/dsh-canvas'
/** 请求体上限：设计模式请求只有几百字节。 */
const MAX_BODY = 64 * 1024

export interface RouteDeps {
  ctx: PluginContext
  /** 优先监听端口（与 config.port 一致）。 */
  port: number
  /** never：launch 用 302 让面板内 iframe 承载；system：在系统浏览器打开。 */
  openBrowser: 'never' | 'system'
  /** 在系统浏览器打开 URL（openBrowser=system 时使用）。 */
  openExternal(url: string): void
}

function send(res: ServerResponse, status: number, type: string, body: string): void {
  if (res.headersSent) return
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(body)
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(value))
}

function redirect(res: ServerResponse, location: string): void {
  if (res.headersSent) return
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' })
  res.end()
}

/** 路由的 owner-only 认证；返回 undefined 表示放行。 */
function rejectionOf(ctx: PluginContext, req: IncomingMessage): 401 | 403 | undefined {
  const connection = ctx.get('connection') as ConnectionService | undefined
  if (connection && typeof connection.requestRejection === 'function') {
    try {
      return connection.requestRejection({ headers: req.headers as Record<string, string | string[] | undefined> })
    } catch (error) {
      ctx.logger.warn(`dsh-canvas: 路由认证检查失败：${error instanceof Error ? error.message : String(error)}`)
      return 403
    }
  }
  // 降级：没有 connection 服务时只接受回环 Host 与同源请求。
  const host = req.headers.host ?? ''
  if (!/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(host)) return 403
  const origin = req.headers.origin
  if (origin !== undefined && origin !== `http://${host}` && origin !== `https://${host}`) return 403
  return undefined
}

/** 认证失败时写响应并返回 false。 */
function guarded(ctx: PluginContext, req: IncomingMessage, res: ServerResponse): boolean {
  const rejection = rejectionOf(ctx, req)
  if (rejection === undefined) return true
  send(res, rejection, 'text/plain; charset=utf-8', rejection === 401 ? 'unauthorized' : 'forbidden')
  return false
}

/** 解析请求体 JSON（带体积上限）。 */
function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolvePromise, rejectPromise) => {
    let raw = ''
    let rejected = false
    req.setEncoding('utf8')
    req.on('error', rejectPromise)
    req.on('data', (chunk: string) => {
      if (rejected) return
      raw += chunk
      if (raw.length > MAX_BODY) {
        rejected = true
        rejectPromise(new Error('body too large'))
      }
    })
    req.on('end', () => {
      if (rejected) return
      try {
        const parsed = JSON.parse(raw || '{}')
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          rejectPromise(new Error('bad json'))
          return
        }
        resolvePromise(parsed as Record<string, unknown>)
      } catch {
        rejectPromise(new Error('bad json'))
      }
    })
  })
}

/** 由 sessionId 推导会话工作目录（DSH 的会话表是进程内唯一权威来源）。 */
function sessionCwd(ctx: PluginContext, sessionId: string): string | undefined {
  const sessions = ctx.get('sessions') as SessionsService | undefined
  const cwd = sessions?.get(sessionId)?.header?.cwd
  return typeof cwd === 'string' && cwd.length > 0 ? cwd : undefined
}

/** 请求体 cwd（必须是存在目录的绝对路径）→ 会话目录；都不可用时 undefined。 */
function pickCwd(ctx: PluginContext, body: { cwd?: unknown; sessionId?: unknown }): string | undefined {
  if (typeof body.cwd === 'string' && isAbsolute(body.cwd)) {
    try {
      if (statSync(body.cwd).isDirectory()) return resolve(body.cwd)
    } catch {
      /* 不存在就当没给 */
    }
  }
  if (typeof body.sessionId === 'string' && body.sessionId.length > 0) return sessionCwd(ctx, body.sessionId)
  return undefined
}

/** 查询串里的 cwd（launch / styles）。 */
function queryCwd(value: string | null): string | undefined {
  if (value === null || value.length === 0 || !isAbsolute(value)) return undefined
  try {
    return statSync(value).isDirectory() ? resolve(value) : undefined
  } catch {
    return undefined
  }
}

/** 注册四条路由；调用方负责在 ctx.effect 内持有返回的清理函数。 */
export function registerRoutes(deps: RouteDeps): () => void {
  const { ctx } = deps
  const webServer = ctx.get('webServer') as WebServerService | undefined
  if (!webServer) {
    ctx.logger.warn('dsh-canvas: 没有 webServer 服务，画布路由未注册（面板会显示空态）')
    return () => {}
  }
  const disposers: Array<() => void> = []

  disposers.push(webServer.register({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/launch`,
    handler: (rawReq, rawRes) => {
      const req = rawReq as IncomingMessage
      const res = rawRes as ServerResponse
      if (!guarded(ctx, req, res)) return
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const cwd = queryCwd(url.searchParams.get('cwd')) ?? recentCwd() ?? defaultCwd(ctx)
      if (!cwd) {
        send(res, 400, 'text/plain; charset=utf-8', '无法确定工作区：请从会话中打开画布')
        return
      }
      return ensureServer(cwd, deps.port)
        .then(({ url: canvasUrl }) => {
          rememberCwd(cwd)
          if (deps.openBrowser === 'system') {
            deps.openExternal(canvasUrl)
            send(res, 200, 'text/html; charset=utf-8', '<!doctype html><meta charset="utf-8"><title>画布</title><p>画布已在系统浏览器打开。</p>')
            return
          }
          redirect(res, canvasUrl)
        })
        .catch((error: unknown) => {
          reportError(error, '启动画布服务失败')
          send(res, 503, 'text/plain; charset=utf-8', '画布服务启动失败；请查看 DSH 日志后重试。')
        })
    },
  }))

  disposers.push(webServer.register({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/styles`,
    handler: (rawReq, rawRes) => {
      const req = rawReq as IncomingMessage
      const res = rawRes as ServerResponse
      if (!guarded(ctx, req, res)) return
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const cwd = queryCwd(url.searchParams.get('cwd')) ?? recentCwd() ?? defaultCwd(ctx)
      try {
        const catalog = loadDesignCatalog(cwd)
        const styles = catalog.styles.map((style) => ({
          id: style.id,
          name: style.name,
          tagline: style.tagline,
          swatches: style.swatches,
          builtin: isBuiltinStyle(style.id),
        }))
        sendJson(res, 200, { styles, current: cwd ? currentStyleId(cwd) : null })
      } catch (error) {
        reportError(error, '读取设计风格失败')
        sendJson(res, 500, { error: '读取设计风格失败' })
      }
    },
  }))

  disposers.push(webServer.register({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/design-mode`,
    handler: (rawReq, rawRes) => {
      const req = rawReq as IncomingMessage
      const res = rawRes as ServerResponse
      if (!guarded(ctx, req, res)) return
      if (req.method !== 'POST') {
        send(res, 405, 'text/plain; charset=utf-8', 'method not allowed')
        return
      }
      return readJson(req)
        .then((body) => {
          const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
          if (!sessionId || sessionId.length > 200) {
            sendJson(res, 400, { error: '缺少合法的 sessionId' })
            return
          }
          const cwd = pickCwd(ctx, body)
          if (!cwd) {
            sendJson(res, 400, { error: '无法确定工作区：请带上 cwd，或在有工作目录的会话中操作' })
            return
          }
          rememberCwd(cwd)
          const enabled = body.enabled === true
          if (!enabled) {
            clearDesignState(sessionId)
            sendJson(res, 200, { ok: true, active: false, styleId: null, styleName: null })
            return
          }
          const requested = typeof body.styleId === 'string' && body.styleId.length > 0 ? body.styleId : 'free'
          const styleId = requested === 'free' ? null : requested
          if (styleId !== null && !designStyleExists(cwd, styleId)) {
            sendJson(res, 400, { error: `未知的设计风格：${styleId}` })
            return
          }
          const result = applyProjectStyle(cwd, styleId)
          const styleName = styleId === null ? null : (result.name ?? designStyleSummary(cwd, styleId)?.name ?? styleId)
          setDesignState(sessionId, cwd, true, styleId, styleName)
          sendJson(res, 200, { ok: true, active: true, styleId, styleName, pagesUpdated: result.pagesUpdated })
        })
        .catch((error: unknown) => {
          const publicError = formatPublicError(error)
          if (publicError.status === 400 || publicError.status === 403) {
            sendJson(res, publicError.status, { error: publicError.message })
            return
          }
          reportError(error, '开启/关闭设计模式失败')
          sendJson(res, publicError.status, { error: publicError.message })
        })
    },
  }))

  disposers.push(webServer.register({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/design-state`,
    handler: (rawReq, rawRes) => {
      const req = rawReq as IncomingMessage
      const res = rawRes as ServerResponse
      if (!guarded(ctx, req, res)) return
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const sessionId = url.searchParams.get('sessionId') ?? ''
      if (!sessionId) {
        sendJson(res, 400, { error: '缺少 sessionId' })
        return
      }
      const consume = url.searchParams.get('consume') === '1'
      const state = stateOf(sessionId)
      const active = isDesignSession(sessionId)
      const openRequested = active ? takeOpenRequest(sessionId, consume) : false
      sendJson(res, 200, {
        active,
        styleId: active ? (state?.styleId ?? null) : null,
        styleName: active ? (state?.styleName ?? null) : null,
        openRequested,
      })
    },
  }))

  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch (error) {
        ctx.logger.debug(`dsh-canvas: 注销路由失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
}

/** 宿主默认工作目录兜底（launch/styles 在还没有任何会话 cwd 时使用）。 */
function defaultCwd(ctx: PluginContext): string | undefined {
  const cwd = ctx.workingDirectory.defaultDirectory
  if (typeof cwd !== 'string' || cwd.length === 0) return undefined
  try {
    return existsSync(cwd) ? resolve(cwd) : undefined
  } catch {
    return undefined
  }
}
