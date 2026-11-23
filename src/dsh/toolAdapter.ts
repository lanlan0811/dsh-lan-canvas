/**
 * 领域工具（`src/tools.ts` 的 TpiTool）→ DSH `ToolDefinition` 的适配层。
 *
 * 领域层与宿主解耦：`execute({ args, cwd, sessionId })` 返回 `{ content, isError? }`，
 * 这是历史契约，也是 58 个测试文件的既有调用面。DSH 侧需要：
 *  - `parameters`：沿用领域层的 JSON Schema（零依赖，不引入 zod / @deepseek-ai/*）；
 *  - `output`：schema + render，把 `message` 渲染成模型可见文本；
 *  - `execute(args, exec)`：cwd 从 `ctx.workingDirectory.ensure(agent)` 取；无 agent
 *    （本地脚本/测试）用 defaultDirectory；
 *  - 路径参数：DSH 没有宿主 pathParams 守卫，这里按 cwd 解析并拒绝相对路径越界
 *    （绝对路径视为调用方显式指定的落点，仍由 src/paths.ts 做真实路径与链接校验）；
 *  - 领域层 `isError` 转成抛错（DSH 用抛错表达工具失败），消息经 reportError 脱敏。
 */
import { isAbsolute, relative, resolve } from 'node:path'
import { reportError } from '../errors.js'
import { PathBoundaryError } from '../paths.js'
import type { TpiTool } from '../tools.js'
import type { HostToolDefinition, ToolRunContext, WorkingDirectoryService } from './types.js'

/** 适配器依赖：工作目录服务 + 可选的「总是用系统浏览器打开」配置。 */
export interface ToolAdapterDeps {
  workingDirectory: WorkingDirectoryService
  openBrowser: 'never' | 'system'
}

/** 领域层已给出可公开的错误文案（`{ isError: true, content }`）。 */
class DomainToolError extends Error {}

/** 把路径参数解析成绝对路径；相对路径越出 cwd 时按边界错误拒绝。 */
function resolvePathParam(cwd: string, param: string, value: string): string {
  if (value.includes('\0')) throw new PathBoundaryError(`Path rejected: ${param} 含非法字符`)
  if (isAbsolute(value)) return resolve(value)
  const abs = resolve(cwd, value)
  const rel = relative(cwd, abs)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new PathBoundaryError(`Path rejected: ${param} 相对路径越出工作区`)
  }
  return abs
}

/** 解析 cwd：有 agent 用其会话工作区，否则用宿主默认工作区。 */
export async function resolveCwd(deps: ToolAdapterDeps, exec: ToolRunContext): Promise<string> {
  if (exec.agent) return await deps.workingDirectory.ensure(exec.agent, exec.signal)
  return deps.workingDirectory.defaultDirectory
}

/**
 * 把一个领域工具包装成 DSH 工具定义。
 * @param tool - 领域工具。
 * @param deps - 工作目录与浏览器策略。
 * @returns 可直接交给 `ctx.tools.register` 的定义。
 */
export function toHostTool(tool: TpiTool, deps: ToolAdapterDeps): HostToolDefinition {
  const name = tool.definition.name
  const definition: HostToolDefinition = {
    name,
    description: tool.definition.description,
    parameters: tool.definition.input_schema,
    output: {
      schema: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
        additionalProperties: false,
      },
      render: (_args, value) => {
        const message = value !== null && typeof value === 'object' && typeof (value as { message?: unknown }).message === 'string'
          ? (value as { message: string }).message
          : String(value ?? '')
        return [{ type: 'text', text: message }]
      },
    },
    async execute(rawArgs, exec) {
      const args: Record<string, unknown> = rawArgs !== null && typeof rawArgs === 'object' && !Array.isArray(rawArgs)
        ? { ...(rawArgs as Record<string, unknown>) }
        : {}
      let cwd: string
      try {
        cwd = await resolveCwd(deps, exec)
      } catch (error) {
        throw new Error(reportError(error, `${name} 解析工作目录失败`))
      }
      try {
        for (const [param, mode] of Object.entries(tool.pathParams ?? {})) {
          const value = args[param]
          if (typeof value !== 'string' || value.length === 0) continue
          args[param] = resolvePathParam(cwd, param, value)
          if (mode === 'write') {
            // 写入目标由领域层按 src/paths.ts 校验；这里只做路径归一化。
          }
        }
        // 配置要求「总是系统浏览器」时，dsh_canvas_open 默认拉起浏览器。
        if (name === 'dsh_canvas_open' && deps.openBrowser === 'system' && args.open === undefined) {
          args.open = true
        }
        const sessionId = exec.agent?.id ?? 'default'
        const result = await tool.execute({ args, cwd, sessionId })
        if (result.isError) throw new DomainToolError(result.content)
        return { message: result.content }
      } catch (error) {
        // 领域层已脱敏的 isError 消息与边界拒绝文案原样保留；其余异常统一走 reportError。
        const message = error instanceof DomainToolError
          ? error.message
          : error instanceof Error && error.message.startsWith('Path rejected')
            ? error.message
            : reportError(error, name)
        throw new Error(message)
      }
    },
  }
  if (tool.timeoutMs !== undefined) definition.timeoutMs = tool.timeoutMs
  if (tool.isConcurrencySafe) {
    definition.isConcurrencySafe = () => tool.isConcurrencySafe?.() === true
  }
  return definition
}
