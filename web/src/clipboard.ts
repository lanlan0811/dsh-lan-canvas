/**
 * 剪贴板写入：优先异步 Clipboard API，失败后退化为 execCommand。
 *
 * 画布被 DSH 主面板以跨源 iframe 承载：Chromium 的 clipboard-write
 * Permissions Policy 默认只给同源文档，宿主未委派时 writeText 会抛
 * NotAllowedError；桌面壳或系统权限也可能拒绝写入。execCommand('copy')
 * 只依赖用户点击产生的 transient activation，是跨源 iframe 里可靠的兼容路径。
 *
 * 两条路径都失败时返回 false，由调用方展示可手动复制的文本——不能像
 * 1.1.6 那样空 catch 吞掉异常，让按钮看起来「无效」。
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* Permissions Policy / 权限拒绝 / 无系统剪贴板 → 走兼容路径 */
  }
  return copyWithExecCommand(text)
}

/** 隐藏 textarea + execCommand('copy')；不依赖 Permissions Policy。 */
function copyWithExecCommand(text: string): boolean {
  if (typeof document.execCommand !== 'function') return false
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.setAttribute('aria-hidden', 'true')
  area.tabIndex = -1
  area.style.position = 'fixed'
  area.style.top = '0'
  area.style.left = '-9999px'
  area.style.opacity = '0'
  document.body.appendChild(area)
  try {
    area.focus()
    area.select()
    area.setSelectionRange(0, text.length)
    return document.execCommand('copy') === true
  } catch {
    return false
  } finally {
    area.remove()
    active?.focus()
  }
}
