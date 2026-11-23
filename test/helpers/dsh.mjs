/**
 * DSH 宿主替身：用最小 ctx 加载 dist/index.mjs，并把 9 个工具包装回测试一直使用的
 * 调用面。
 *
 * 复刻点（取自本机 DSH 的 Service/Event 契约）：
 *  - `apply(ctx, config)` + `inject` 的激活方式；
 *  - `ctx.tools.register({ name, description, parameters, output, execute })`：
 *    这里把 `parameters` 暴露成旧测试熟悉的 `inputSchema`，`execute({ args, cwd, sessionId })`
 *    转成 DSH 的 `execute(args, exec)`；
 *  - `ctx.effect` 的清理顺序（与插件真实卸载一致）；
 *  - `ctx.webServer.register` 直接登记路由，测试用 `harness.callRoute` 调用；
 *  - `ctx.skills.register` 登记技能；`ctx.sessions.get` / `ctx.agents.get` 提供
 *    设计模式测试所需的会话与活代理；
 *  - 画布 HTTP 客户端的 Bearer 注入垫片（旧测试用它访问 `/api/*`）。
 */
import { isAbsolute, relative, resolve } from 'node:path'

/** 旧接口测试用模拟客户端显式持有工具返回的凭证；安全专项可用 rawFetch 测试无凭证请求。 */
const credentials = new Map()
export const rawFetch = globalThis.fetch.bind(globalThis)
export function testCredential(ws) { return credentials.get(ws) }
let fetchInstalled = false
function installTestClient() {
  if (fetchInstalled) return
  fetchInstalled = true
  globalThis.fetch = (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    let ws = url.searchParams.get('ws')
    if (!ws && typeof init.body === 'string') {
      try { ws = JSON.parse(init.body)?.ws } catch {}
    }
    const secret = credentials.get(ws)
    if (secret && url.hostname === '127.0.0.1') {
      const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined))
      if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${secret}`)
      return rawFetch(input, { ...init, headers })
    }
    return rawFetch(input, init)
  }
}

/** 兼容旧测试的导出：DSH 不需要安装全局 SDK。 */
export function installFakeSdk() {
  return undefined
}

// 简化版路径守卫：仅根限定（旧测试直接断言 /Path rejected/）。
export function validatePathSafe(root, candidate) {
  const realRoot = resolve(root)
  const target = resolve(realRoot, candidate)
  const rel = relative(realRoot, target)
  if (rel.startsWith('..') || isAbsolute(rel)) return { ok: false, error: 'Path rejected: ' + candidate }
  return { ok: true, path: target }
}

function captureCredentials(content) {
  for (const match of content.matchAll(/http:\/\/127\.0\.0\.1:\d+\/w\/[0-9a-f]{32}\/\?ws=([0-9a-f]{32})#([0-9a-f]{64})/g)) {
    credentials.set(match[1], match[2])
  }
}

/** 极简 req/res：够插件路由读 method/url/headers/body 并写响应。 */
function fakeExchange({ method = 'GET', url = '/', headers = {}, body = '' } = {}) {
  const listeners = new Map()
  const req = {
    method,
    url,
    headers,
    setEncoding() {},
    on(event, listener) {
      const list = listeners.get(event) ?? []
      list.push(listener)
      listeners.set(event, list)
      return req
    },
    destroy() {},
  }
  const response = {
    status: 200,
    headers: {},
    body: '',
    headersSent: false,
    writableEnded: false,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value },
    writeHead(status, extra = {}) {
      this.status = status
      this.headersSent = true
      for (const [name, value] of Object.entries(extra)) this.headers[String(name).toLowerCase()] = value
      return this
    },
    end(chunk = '') {
      if (chunk) this.body += String(chunk)
      this.writableEnded = true
    },
  }
  if (typeof body === 'string' && body.length > 0) req.__body = body
  return { req, response, emit: (chunk) => {
    for (const listener of listeners.get('data') ?? []) listener(chunk)
    for (const listener of listeners.get('end') ?? []) listener()
  } }
}

/**
 * 创建一个假 Host。
 * @param {object} options - 可选服务覆盖：`sessions` / `agents` / `connection` / `config`。
 */
export function createHarness(options = {}) {
  const toolDefinitions = new Map()
  const routes = new Map()
  const skills = []
  const disposers = []
  const warnings = []
  const sessions = new Map(options.sessions ?? [])
  const agents = new Map(options.agents ?? [])
  const listeners = new Map()
  let disposed = false

  function track(disposer) {
    if (typeof disposer === 'function') disposers.push(disposer)
    return disposer ?? (() => {})
  }

  const services = {
    tools: {
      register(definition) {
        if (toolDefinitions.has(definition.name)) throw new Error(`duplicate tool ${definition.name}`)
        toolDefinitions.set(definition.name, definition)
        return track(() => { toolDefinitions.delete(definition.name) })
      },
    },
    skills: {
      register(skill) {
        skills.push(skill)
        return track(() => {
          const index = skills.indexOf(skill)
          if (index >= 0) skills.splice(index, 1)
        })
      },
    },
    webServer: {
      getOrigin: () => 'http://127.0.0.1:3080',
      register(route) {
        routes.set(route.path, route)
        return track(() => { routes.delete(route.path) })
      },
    },
    connection: options.connection ?? {
      requestRejection: () => undefined,
    },
    sessions: {
      get: (id) => sessions.get(id),
    },
    agents: {
      get: (id) => agents.get(id),
    },
    commands: {
      register: (definition) => track(() => {}),
    },
    workingDirectory: {
      defaultDirectory: options.defaultDirectory ?? process.cwd(),
      async ensure(agent) {
        return agent?.cwd ?? options.defaultDirectory ?? process.cwd()
      },
    },
  }

  const ctx = {
    logger: {
      debug() {},
      warn(message) { warnings.push(String(message)) },
    },
    effect(callback, label) {
      const cleanup = callback()
      return track(typeof cleanup === 'function' ? cleanup : () => {
        void label
      })
    },
    get(name) { return services[name] },
    on(name, listener) {
      const list = listeners.get(name) ?? []
      list.push(listener)
      listeners.set(name, list)
      return track(() => {
        const index = list.indexOf(listener)
        if (index >= 0) list.splice(index, 1)
      })
    },
    inject(deps, callback) {
      if (deps.every((dep) => services[dep] !== undefined)) callback(ctx)
      return () => {}
    },
    tools: services.tools,
    workingDirectory: services.workingDirectory,
  }

  async function runDefinition(definition, args, cwd, sessionIdId = 'sess-1') {
    const controller = new AbortController()
    try {
      const value = await definition.execute(args, {
        agent: { id: sessionIdId, cwd },
        signal: controller.signal,
      })
      const blocks = definition.output.render(args, value)
      const content = blocks.map((block) => block.text ?? '').join('')
      captureCredentials(content)
      return { content }
    } catch (error) {
      return { content: error instanceof Error ? error.message : String(error), isError: true }
    }
  }

  const api = {
    tools: [],
    skills,
    routes,
    warnings,
    async dispose() {
      if (disposed) return
      disposed = true
      for (const disposer of disposers.reverse()) {
        try {
          disposer()
        } catch {
          /* ignore */
        }
      }
    },
    /** 旧测试别名：dispose 同样会关闭画布服务（引用计数归零）。 */
    async shutdownForTests() {
      await api.dispose()
    },
  }

  const wrappedTools = {}
  function materialize() {
    api.tools = [...toolDefinitions.values()].map((definition) => ({
      name: definition.name,
      description: definition.description,
      inputSchema: definition.parameters,
      timeoutMs: definition.timeoutMs,
      concurrencySafe: definition.isConcurrencySafe?.(undefined) ?? undefined,
      async execute({ args, cwd, sessionId = 'sess-1' }) {
        return await runDefinition(definition, args, cwd, sessionId)
      },
    }))
    for (const [name, definition] of toolDefinitions) {
      wrappedTools[name] = {
        name,
        definition: { name, description: definition.description, input_schema: definition.parameters },
        async execute({ input, args, cwd, sessionId = 'sess-1' }) {
          return await runDefinition(definition, input ?? args ?? {}, cwd, sessionId)
        },
      }
    }
  }

  /** 触发一个已注册的 Host 事件监听器（session/event 等）。 */
  function emitEvent(name, ...args) {
    for (const listener of listeners.get(name) ?? []) listener(...args)
  }

  /** 调用一条已注册路由。 */
  async function callRoute(method, path, { headers = {}, query = '', body = '' } = {}) {
    const route = routes.get(path)
    if (!route) throw new Error(`route not registered: ${path}`)
    const { req, response, emit } = fakeExchange({ method, url: path + query, headers })
    const pending = route.handler(req, response)
    if (typeof body === 'string' && body.length > 0) emit(body)
    await pending
    return response
  }

  return {
    ctx,
    services,
    sessions,
    agents,
    skills,
    routes,
    warnings,
    api,
    tools: wrappedTools,
    materialize,
    emitEvent,
    callRoute,
    dispose: api.dispose,
  }
}

/**
 * 用假宿主加载构建产物。
 * @param {string} entryUrl - dist/index.mjs 的 file URL。
 * @param {object} options - harness 选项，另加 `config`（Loader 行的 config）。
 * @returns {Promise<{ def, ctx, api, tools, harness }>}
 */
export async function loadBundle(entryUrl, options = {}) {
  installTestClient()
  const harness = createHarness(options)
  const mod = await import(entryUrl)
  if (typeof mod.apply !== 'function') throw new Error('入口没有导出 apply(ctx, config)')
  await mod.apply(harness.ctx, options.config ?? {})
  harness.materialize()
  return { def: mod, ctx: harness.ctx, api: harness.api, tools: harness.tools, harness }
}

/** 兼容旧名字（测试历史上叫 loadPlugin）。 */
export { loadBundle as loadPlugin }