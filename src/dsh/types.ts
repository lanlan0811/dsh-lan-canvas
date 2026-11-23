/**
 * DSH 宿主的最小结构类型。
 *
 * 插件不 import 任何 `@deepseek-ai/*`（运行期零依赖，宿主升级不改锁文件），
 * 因此这里手写用到的宿主契约子集：只描述本插件真正调用的字段与方法。
 * 真实形状由 `cordis_inspect_query` 的 Service/Event 输出核对过。
 */

/** 宿主日志（Cordis logger 的子集）。 */
export interface HostLogger {
  debug(message: string): void
  warn(message: string): void
}

export type Disposer = () => void

/** 工具调用上下文（ToolRunContext 的子集）。 */
export interface ToolRunContext {
  readonly agent?: { readonly id: string }
  readonly signal: AbortSignal
}

/** 工具输出定义：schema + 渲染成模型可见内容。 */
export interface ToolOutputDefinition {
  schema: Record<string, unknown>
  render(args: unknown, value: unknown): { type: 'text'; text: string }[]
}

/** 工具定义（ToolDefinition 的子集，字段名与宿主一致）。 */
export interface HostToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  output: ToolOutputDefinition
  execute(args: unknown, exec: ToolRunContext): Promise<unknown>
  timeoutMs?: number
  isConcurrencySafe?(args: unknown): boolean
}

/** `ctx.tools` 的子集。 */
export interface ToolsService {
  register(definition: HostToolDefinition, options?: { when?: (context: unknown) => boolean | Promise<boolean> }): Disposer
}

/** `ctx.workingDirectory` 的子集。 */
export interface WorkingDirectoryService {
  readonly defaultDirectory: string
  ensure(agent: { readonly id: string }, signal?: AbortSignal): Promise<string>
}

/** `ctx.skills` 的子集。 */
export interface SkillsService {
  register(skill: {
    name: string
    description: string
    whenToUse?: string
    content: string
    source: string
    resourceBase?: { kind: 'directory'; path: string }
    invocation?: { modelInvocable: boolean; userInvocable: boolean }
  }): Disposer
}

/** `ctx.webServer` 的子集。 */
export interface WebServerService {
  getOrigin(): string
  register(route:
    | { kind: 'exact' | 'prefix'; path: string; handler: (req: unknown, res: unknown) => void | Promise<void> }
    | { kind: 'exact' | 'prefix'; path: string; resource: (request: Request, peer?: unknown) => Promise<Response> }
  ): Disposer
}

/** `ctx.connection` 的子集：把宿主自己的 Host/Origin 检查与浏览器认证套用到插件路由。 */
export interface ConnectionService {
  requestRejection(request: { headers: Record<string, string | string[] | undefined> }): 401 | 403 | undefined
  getAdvertisedUrl?(): string
}

/** `ctx.agents` 的子集（只读活代理，用于设计模式注入）。 */
export interface AgentsService {
  get(id: string): AgentLike | undefined
}

/** 宿主 Agent 的子集。 */
export interface AgentLike {
  readonly id: string
  inject(message: UserMessageLike): void
}

/** 宿主的 user 消息（`createUserMessage` 的产物形状）。 */
export interface UserMessageLike {
  id: string
  role: 'user'
  content: { type: 'text'; text: string }[]
  source: { kind: 'user' }
}

/** `ctx.sessions` 的子集（宿主内存会话表）。 */
export interface SessionsService {
  get(id: string): { readonly header?: { readonly cwd?: string } } | undefined
}

/** `ctx.commands`（可选；仅在需要 Host 命令回退时使用）。 */
export interface CommandsService {
  register(definition: {
    name: string
    description: string
    handler: (invocation: { agent: { id: string }; rawInput: string; signal: AbortSignal }) => unknown
  }): Disposer
}

/** 插件 apply 收到的 Cordis Context 子集。 */
export interface PluginContext {
  readonly logger: HostLogger
  effect(callback: () => Disposer | void, label?: string): Disposer
  get(name: string): unknown
  on(name: string, listener: (...args: never[]) => void): Disposer
  inject(deps: string[], callback: (scope: PluginContext) => void): Disposer
  readonly tools: ToolsService
  readonly workingDirectory: WorkingDirectoryService
}
