/**
 * 宿主桥：插件内任何模块都能用到 apply(ctx) 拿到的宿主日志通道。
 *
 * 日志必须脱敏（省略令牌、原始会话文本与敏感参数）；本模块只负责转发，
 * 脱敏由调用方（errors/reportError）完成。宿主之外（单测/本地脚本）没有宿主日志，
 * 回落到 stderr。
 */
export interface HostLog {
  debug(message: string): void
  warn(message: string): void
}

const fallback: HostLog = {
  debug() {},
  warn: (message) => console.error(message),
}

let services: { log: HostLog } | null = null

/** 注入宿主日志；传 null 恢复默认（标准输出到 stderr）。 */
export function setHostLogger(next: HostLog | null): void {
  services = next ? { log: next } : null
}

/** 非致命问题：有宿主日志通道时走宿主 warn，否则打到 stderr。 */
export function warnUser(message: string): void {
  const line = `[dsh-canvas] ${message}`
  try {
    const log = services?.log ?? fallback
    log.warn(line)
  } catch {
    /* 日志失败不能影响功能 */
  }
}
