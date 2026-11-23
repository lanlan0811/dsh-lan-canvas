/**
 * 画布访问凭证（fragment secret）在页面内的唯一持有者。
 *
 * 为什么需要它：画布内嵌在 DSH 主面板的 iframe 里。若 DSH 页面与画布不同源
 * （例如经 localhost / 局域网地址打开），浏览器会把画布当作第三方上下文并丢弃
 * `SameSite=Strict` cookie，导致 `/api/*` 全部 404。凭证放在 fragment 里、
 * 由页面主动作为 `Authorization: Bearer` 发送，就不依赖 cookie 策略了。
 *
 * fragment 永远不会发给服务端；页面文档/子 iframe 需要凭证时由 pageUrl() 显式
 * 追加 `secret` 查询参数（只对 GET /page/* 生效，且响应带 no-referrer）。
 */
let secret = ''

/** 记录本次页面加载的凭证；空字符串表示没有（例如手工打开无 fragment 的 URL）。 */
export function setCanvasSecret(value: string): void {
  secret = value
}

/** 当前凭证；没有时为空字符串。 */
export function canvasSecret(): string {
  return secret
}

/** 合并认证头；没有凭证时原样返回额外头。 */
export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return secret ? { ...extra, Authorization: `Bearer ${secret}` } : { ...extra }
}
