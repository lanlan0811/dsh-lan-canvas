/**
 * Host 入口：DSH bundle 的 `apply(ctx, config)`。
 *
 * 职责：
 *  - 自校验 config（非法值抛出，Plugins 页显示激活失败）；
 *  - 注册 9 个 `dsh_canvas_*` 工具（领域实现见 src/tools.ts，经 toolAdapter 转换）；
 *  - 注册 4 条 owner-only 路由（画布启动、风格、设计模式、设计模式状态）；
 *  - 注册 `dsh-canvas` 技能（skills/SKILL.md）；
 *  - 设计模式：监听 user/message，置 openRequested 并给活代理注入一段短上下文；
 *  - 生命周期：画布服务多实例引用计数，最后一个实例释放时关闭。
 *
 * 运行期不 import 任何 `@deepseek-ai/*`，宿主服务全部经 ctx.get() 可选获取。
 */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setHostLogger } from '../host.js'
import { reportError } from '../errors.js'
import { tools as domainTools } from '../tools.js'
import { shutdownCanvasServer, configurePort } from '../server.js'
import { resolveConfig } from './config.js'
import { designContextText, noteUserMessage, rememberCwd, stateOf } from './designMode.js'
import { registerRoutes } from './routes.js'
import { toHostTool } from './toolAdapter.js'
import type {
  AgentLike,
  AgentsService,
  Disposer,
  HostToolDefinition,
  PluginContext,
  SkillsService,
} from './types.js'

/** Host 侧的硬依赖：工具注册与工作目录解析。 */
export const inject = ['tools', 'workingDirectory']

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SKILL_FILE = resolve(PACKAGE_ROOT, 'skills/SKILL.md')
const SKILL_NAME = 'dsh-canvas'

let activeInstances = 0

interface SkillDocument {
  name: string
  description: string
  whenToUse?: string
  content: string
}

/** 解析 SKILL.md 的 frontmatter（单行 `key: value`）与正文。 */
export function parseSkillDocument(text: string, fallbackName = SKILL_NAME): SkillDocument {
  const normalized = text.replace(/\r\n/g, '\n')
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(normalized)
  if (!match) {
    throw new Error('dsh-canvas: SKILL.md 缺少 frontmatter（需要 name/description）')
  }
  const meta: Record<string, string> = {}
  for (const line of (match[1] ?? '').split('\n')) {
    const pair = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line.trim())
    if (!pair) continue
    const value = (pair[2] ?? '').trim().replace(/^['"]|['"]$/g, '')
    if (value.length > 0) meta[pair[1] as string] = value
  }
  const name = meta.name ?? fallbackName
  const description = meta.description ?? ''
  if (!name || !description) throw new Error('dsh-canvas: SKILL.md frontmatter 必须包含 name 与 description')
  const content = normalized.slice(match[0].length).trim()
  if (!content) throw new Error('dsh-canvas: SKILL.md 正文为空')
  return {
    name,
    description,
    ...(meta.whenToUse ? { whenToUse: meta.whenToUse } : {}),
    content,
  }
}

/** 读取并注册技能；文件缺失或格式错误时降级为 warn（工具照常可用）。 */
function registerSkill(ctx: PluginContext): Disposer {
  const skills = ctx.get('skills') as SkillsService | undefined
  if (!skills || typeof skills.register !== 'function') {
    ctx.logger.warn('dsh-canvas: 没有 skills 服务，技能未注册')
    return () => {}
  }
  let document: SkillDocument
  try {
    document = parseSkillDocument(readFileSync(SKILL_FILE, 'utf8'))
  } catch (error) {
    ctx.logger.warn(`dsh-canvas: 读取 skills/SKILL.md 失败，技能未注册：${error instanceof Error ? error.message : String(error)}`)
    return () => {}
  }
  return skills.register({
    name: document.name,
    description: document.description,
    ...(document.whenToUse ? { whenToUse: document.whenToUse } : {}),
    content: document.content,
    source: 'custom',
    resourceBase: { kind: 'directory', path: dirname(SKILL_FILE) },
    invocation: { modelInvocable: true, userInvocable: true },
  })
}

/** 设计模式：user/message 后置 openRequested，并给活代理注入短上下文。 */
function watchDesignSessions(ctx: PluginContext): Disposer {
  const off = ctx.on('session/event', (...args: never[]) => {
    const [session, event] = args as unknown as [
      { id: string; header?: { cwd?: string } },
      { type?: string },
    ]
    if (event?.type !== 'user/message' || typeof session?.id !== 'string') return
    const cwd = session.header?.cwd
    if (typeof cwd === 'string' && cwd.length > 0) rememberCwd(cwd)
    if (!noteUserMessage(session.id)) return
    const state = stateOf(session.id)
    if (!state) return
    const agents = ctx.get('agents') as AgentsService | undefined
    const agent = agents?.get?.(session.id) as AgentLike | undefined
    if (!agent || typeof agent.inject !== 'function') return
    try {
      agent.inject({
        id: randomUUID(),
        role: 'user',
        content: [{ type: 'text', text: designContextText(state) }],
        source: { kind: 'user' },
      })
    } catch (error) {
      ctx.logger.warn(`dsh-canvas: 注入设计模式上下文失败：${error instanceof Error ? error.message : String(error)}`)
    }
  })
  return typeof off === 'function' ? off : () => {}
}

/**
 * 插件主体。
 * @param ctx - Cordis Host 上下文。
 * @param config - Loader 行的 config（port / openBrowser）。
 */
export function apply(ctx: PluginContext, config: unknown): void {
  const resolved = resolveConfig(config)
  configurePort(resolved.port)
  setHostLogger(ctx.logger)
  activeInstances++

  ctx.effect(() => {
    const disposers: Disposer[] = []
    const track = (disposer: Disposer): void => {
      if (typeof disposer === 'function') disposers.push(disposer)
    }
    try {
      for (const tool of domainTools) {
        const definition: HostToolDefinition = toHostTool(tool, {
          workingDirectory: ctx.workingDirectory,
          openBrowser: resolved.openBrowser,
        })
        track(ctx.tools.register(definition))
      }
      track(registerSkill(ctx))
      track(watchDesignSessions(ctx))
      // webServer 可能比本插件晚就绪；直接读取会静默跳过四条路由（画布 iframe 空白、
      // /design 404）。用 ctx.inject 等它就绪后再注册，工具/技能仍可立即使用。
      track(ctx.inject(['webServer'], (scope) => {
        track(registerRoutes({
          ctx: scope,
          port: resolved.port,
          openBrowser: resolved.openBrowser,
          openExternal: openExternal,
        }))
        return () => {}
      }))
    } catch (error) {
      // 注册失败必须让激活失败可见（Plugins 页），但先把已注册资源退干净。
      for (const dispose of disposers.reverse()) {
        try {
          dispose()
        } catch {
          /* ignore */
        }
      }
      setHostLogger(null)
      activeInstances--
      throw error
    }
    return () => {
      for (const dispose of disposers.reverse()) {
        try {
          dispose()
        } catch (error) {
          ctx.logger.debug(`dsh-canvas: 释放资源失败：${error instanceof Error ? error.message : String(error)}`)
        }
      }
      setHostLogger(null)
      if (--activeInstances === 0) {
        void shutdownCanvasServer().catch((error: unknown) => {
          ctx.logger.warn(`dsh-canvas: 关闭画布服务失败：${error instanceof Error ? error.message : String(error)}`)
        })
      }
    }
  }, 'dsh-canvas: tools + skill + routes')
}

/** 在系统浏览器打开 URL（best-effort；失败只记日志）。 */
function openExternal(url: string): void {
  void (async () => {
    try {
      const { spawn } = await import('node:child_process')
      const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open'
      const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
      const child = spawn(command, args, { detached: true, stdio: 'ignore' })
      child.on('error', (error) => {
        reportError(error, '无法打开系统浏览器')
      })
      child.unref()
    } catch (error) {
      reportError(error, '无法打开系统浏览器')
    }
  })()
}

// ---------------------------------------------------------------------------
// 测试与本地脚本使用的纯函数面。
//
// 这些不是 Host 激活契约的一部分：测试用它们直接验证导航、资源内联、SSRF 防护等
// 纯函数行为，避免每次都在假 ctx 里绕一圈。保留命名导出也让旧的回归测试无需重写。
// ---------------------------------------------------------------------------
export { tools } from '../tools.js'
export { titleSlug, parseNavRef, resolveNavRef, rewriteNavLinks, mayHaveNavLinks } from '../nav.js'
export { resolveBrowser } from '../export.js'
export { assertUrlAllowed, isBlockedIp, fetchUrl } from '../netFetch.js'
export { inlineAssets, toDataUri } from '../inlineAssets.js'
export { extractTokens } from '../extract.js'
export { createNavIndex, parseNavDocument, rewriteParsedNavLinks } from '../nav.js'
export { backfillNavigation, clearNavigationCache } from '../navigation.js'
export { readNavLinks, clearNavGraphCache } from '../navGraph.js'
