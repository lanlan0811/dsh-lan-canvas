/**
 * 插件配置（`cordis.patch.yml` 的 config）与自校验。
 *
 * DSH 没有给 Host 插件内置配置 schema（需要引入 zod 等依赖，与本插件「运行期零依赖」
 * 冲突），因此 apply 时按下面规则校验；非法值直接抛错，Plugins 页会显示激活失败。
 */
export const DEFAULT_PORT = 43117
export const MIN_PORT = 1024
export const MAX_PORT = 65535

export type OpenBrowserMode = 'never' | 'system'

export interface CanvasConfig {
  /** 优先监听端口；被占用时在 43117 起递增 20 次后随机端口。 */
  port: number
  /** 是否在打开画布时同时拉起系统浏览器。 */
  openBrowser: OpenBrowserMode
}

/**
 * 校验并归一化用户配置。
 * @param raw - Loader 行里的 config 对象（可能为空）。
 * @returns 带默认值的完整配置。
 * @throws 端口或 openBrowser 不合法时抛出可读错误。
 */
export function resolveConfig(raw: unknown): CanvasConfig {
  const input = (raw ?? {}) as Record<string, unknown>
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('dsh-canvas: config 必须是对象')
  }
  const port = input.port === undefined ? DEFAULT_PORT : input.port
  if (typeof port !== 'number' || !Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error(`dsh-canvas: config.port 必须是 ${MIN_PORT}–${MAX_PORT} 之间的整数（当前 ${String(port)}）`)
  }
  const openBrowser = input.openBrowser === undefined ? 'never' : input.openBrowser
  if (openBrowser !== 'never' && openBrowser !== 'system') {
    throw new Error(`dsh-canvas: config.openBrowser 只能是 "never" 或 "system"（当前 ${String(openBrowser)}）`)
  }
  const unknown = Object.keys(input).filter((key) => key !== 'port' && key !== 'openBrowser')
  if (unknown.length > 0) {
    throw new Error(`dsh-canvas: 未知的 config 字段 ${unknown.join('、')}；支持 port、openBrowser`)
  }
  return { port, openBrowser }
}
