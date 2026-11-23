/**
 * 设计模式的进程内会话状态。
 *
 * 状态只活在 Host 进程里：客户端在会话挂载时用 `/dsh-canvas/design-mode` 重新同步，
 * 因此重启 DSH 后仍能恢复。风格本身写在项目的 `.dsh-canvas/project.json`（设计模式只是
 * 「这次会话正在做设计」的开关），所以画布工具链读到的永远是落盘后的锁定风格。
 */
export interface DesignState {
  /** 是否处于设计模式。 */
  enabled: boolean
  /** 锁定的风格 id；null = 自由探索。 */
  styleId: string | null
  /** 锁定风格的显示名（注入上下文用，避免每次读盘）。 */
  styleName: string | null
  /** 本次设计模式开启后是否已经有用户消息（客户端据此自动开画布）。 */
  openRequested: boolean
  /** 该会话最近一次已知的工作目录（启动画布与风格路由的兜底）。 */
  cwd: string | null
}

const states = new Map<string, DesignState>()
/** 进程内最近一次出现的工作目录：主面板取不到会话时兜底。 */
let lastCwd: string | null = null

/** 记录一个已知的工作目录（工具调用、路由请求都会刷新）。 */
export function rememberCwd(cwd: string): void {
  if (cwd) lastCwd = cwd
}

/** 最近一次已知工作目录；没有则 null。 */
export function recentCwd(): string | null {
  return lastCwd
}

/** 读取（不创建）会话设计状态。 */
export function stateOf(sessionId: string): DesignState | undefined {
  return states.get(sessionId)
}

/** 会话是否处于设计模式。 */
export function isDesignSession(sessionId: string): boolean {
  return states.get(sessionId)?.enabled === true
}

/**
 * 写入设计模式状态。
 * @param sessionId - 会话 id。
 * @param cwd - 该会话工作目录（画布打开与风格查询用）。
 * @param enabled - 开启或关闭设计模式。
 * @param styleId - 锁定风格；null 表示自由探索。
 * @param styleName - 锁定风格显示名；自由探索时为 null。
 */
export function setDesignState(
  sessionId: string,
  cwd: string,
  enabled: boolean,
  styleId: string | null,
  styleName: string | null,
): DesignState {
  const previous = states.get(sessionId)
  const next: DesignState = {
    enabled,
    styleId: enabled ? styleId : null,
    styleName: enabled ? styleName : null,
    // 关闭再开启视为新的一轮：允许下一次用户消息再次自动打开画布。
    openRequested: previous?.enabled === enabled ? previous.openRequested : false,
    cwd,
  }
  states.set(sessionId, next)
  rememberCwd(cwd)
  return next
}

/** 关闭并清理一个会话的设计状态（退出设计模式）。 */
export function clearDesignState(sessionId: string, options: { keepCwd?: boolean } = {}): void {
  const previous = states.get(sessionId)
  if (!previous) return
  if (options.keepCwd === true) {
    states.set(sessionId, { ...previous, enabled: false, styleId: null, styleName: null, openRequested: false })
    return
  }
  states.delete(sessionId)
}

/** 关闭所有工作目录匹配的会话（主面板「退出设计模式」不知道 sessionId 时使用）。 */
export function clearDesignForCwd(cwd: string): void {
  for (const [sessionId, state] of states) {
    if (state.cwd === cwd) clearDesignState(sessionId)
  }
}

/** 设计模式期间的会话：记录「用户已发需求」，客户端会消费它自动打开画布。 */
export function noteUserMessage(sessionId: string): boolean {
  const state = states.get(sessionId)
  if (!state?.enabled) return false
  state.openRequested = true
  return true
}

/**
 * 读取并可选清除「自动打开画布」请求。
 * @param sessionId - 会话 id。
 * @param consume - true 时清除标记（客户端确认打开后调用）。
 */
export function takeOpenRequest(sessionId: string, consume: boolean): boolean {
  const state = states.get(sessionId)
  if (!state?.enabled) return false
  const requested = state.openRequested
  if (consume && requested) state.openRequested = false
  return requested
}

/** 测试用：清空全部状态。 */
export function resetDesignStates(): void {
  states.clear()
  lastCwd = null
}

/** 设计模式注入给模型的上下文（短，避免每轮占用大量 token）。 */
export function designContextText(state: DesignState): string {
  const style = state.styleId === null
    ? '自由探索（未锁定风格，可用 dsh_canvas_style action=set 锁定，或直接按内容原创）'
    : `${state.styleName ?? state.styleId}（${state.styleId}，已锁定到 .dsh-canvas/project.json）`
  return [
    '设计模式已开启。',
    `- 当前风格：${style}。`,
    '- 先调用 dsh_canvas_get_state 读取页面、选中项与批注，再写页面；新页面用 dsh_canvas_upsert_page。',
    '- 画布已内嵌在 DSH 主面板：需要用户查看时提示他点击左侧栏「画布」，不要另开网页；dsh_canvas_open 返回的链接只用于必要时刻。',
    '- 写完页面后按技能要求做一轮 dsh_canvas_check_style（或 audit review），再交付。',
  ].join('\n')
}
