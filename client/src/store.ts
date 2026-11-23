/**
 * 浏览器内的设计模式镜像。
 *
 * Host 是权威（进程内 Map + 项目文件），这里只是让同一页面的多个挂载点
 * （输入框 chip、主面板工具条）立即看到状态变化，避免各自轮询。
 * 刷新页面后由 chip 重新同步 Host。
 */
export interface DesignView {
  sessionId: string
  cwd: string | null
  active: boolean
  styleId: string | null
  styleName: string | null
}

const bySession = new Map<string, DesignView>()
let revision = 0
const listeners = new Set<() => void>()

function emit(): void {
  revision++
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      /* 单个订阅者异常不影响其它组件 */
    }
  }
}

/** 订阅状态变化（useSyncExternalStore 的 subscribe）。 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 单调递增的版本号（useSyncExternalStore 的 getSnapshot）。 */
export function snapshot(): number {
  return revision
}

/** 写入一个会话的设计状态。 */
export function setDesignView(view: DesignView): void {
  const previous = bySession.get(view.sessionId)
  if (previous
    && previous.cwd === view.cwd
    && previous.active === view.active
    && previous.styleId === view.styleId
    && previous.styleName === view.styleName) {
    return
  }
  bySession.set(view.sessionId, view)
  emit()
}

/** 读取一个会话的设计状态。 */
export function designViewOf(sessionId: string): DesignView | undefined {
  return bySession.get(sessionId)
}

/** 工作目录上是否有会话处于设计模式（主面板工具条不知道 sessionId）。 */
export function activeDesignForCwd(cwd: string | null): DesignView | undefined {
  for (const view of bySession.values()) {
    if (view.active && (cwd === null || view.cwd === cwd)) return view
  }
  return undefined
}

/** 任意处于设计模式的会话（cwd 未知时兜底）。 */
export function anyActiveDesign(): DesignView | undefined {
  for (const view of bySession.values()) {
    if (view.active) return view
  }
  return undefined
}

/** 清空镜像（插件卸载时调用）。 */
export function resetDesignViews(): void {
  if (bySession.size === 0) return
  bySession.clear()
  emit()
}
