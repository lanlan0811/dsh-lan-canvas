/**
 * 主面板「画布」：顶部工具条 + 全高 iframe + 左下角悬浮球。
 *
 * iframe 承载既有的画布 SPA（独立端口、独立 CSP），状态由服务端
 * `.dsh-canvas/project.json` 恢复；切换回对话时 iframe 卸载。
 */
import * as React from 'react'
import { canvasLaunchUrl, postDesignMode } from './api.js'
import { activeDesignForCwd, anyActiveDesign, setDesignView, subscribe, snapshot } from './store.js'
import { Styles, ChatIcon, ExternalIcon, RefreshIcon } from './ui.js'
import type { ClientContext, SelectorHook, SlotProps, Translate } from './types.js'

interface Props extends SlotProps {
  ctx: ClientContext
  t: Translate
}

/** 首帧慢于该时间就给出「可能被拦截」的提示（不阻塞使用）。 */
const SLOW_MS = 12_000

export function CanvasPanel({ ctx, t, useSessions, useSessionStatus }: Props): React.ReactElement {
  useSync()
  const currentSessionId = readCurrentSessionId(useSessions)
  const cwd = readCurrentCwd(useSessions)
  const status = useSessionStatus && currentSessionId
    ? useSessionStatus((map: any) => map?.get?.(currentSessionId))
    : undefined
  const design = activeDesignForCwd(cwd) ?? (cwd === null ? anyActiveDesign() : undefined) ?? null
  const [revision, setRevision] = React.useState(0)
  const [slow, setSlow] = React.useState(false)
  const [loaded, setLoaded] = React.useState(false)
  const [exiting, setExiting] = React.useState(false)
  const frameRef = React.useRef<HTMLIFrameElement | null>(null)
  const lastRelaunch = React.useRef(0)
  const relaunches = React.useRef(0)
  const src = canvasLaunchUrl(cwd, revision)

  React.useEffect(() => {
    setSlow(false)
    if (loaded) return
    const timer = window.setTimeout(() => { setSlow(true) }, SLOW_MS)
    return () => { window.clearTimeout(timer) }
  }, [src, loaded])

  // iframe 的旧 token 失效（例如插件重载后服务重启）时，页面会请求父页面重新 launch。
  // 只接受来自本 iframe 的消息，并限速/限次，避免死循环。
  React.useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== frameRef.current?.contentWindow) return
      const data = event.data as { type?: unknown } | null
      if (data?.type !== 'dsh-canvas:relaunch') return
      const now = Date.now()
      if (now - lastRelaunch.current < 3000 || relaunches.current >= 3) return
      lastRelaunch.current = now
      relaunches.current += 1
      setLoaded(false)
      setSlow(false)
      setRevision((value) => value + 1)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const refresh = (): void => {
    setLoaded(false)
    setSlow(false)
    setRevision((value) => value + 1)
  }

  const openExternal = (): void => {
    window.open(src, '_blank', 'noopener,noreferrer')
  }

  const exitDesign = (): void => {
    if (!design || exiting) return
    setExiting(true)
    void postDesignMode({
      sessionId: design.sessionId,
      cwd: design.cwd ?? cwd,
      enabled: false,
    })
      .then(() => {
        setDesignView({ sessionId: design.sessionId, cwd: design.cwd ?? cwd, active: false, styleId: null, styleName: null })
        setExiting(false)
      })
      .catch((err: unknown) => {
        setExiting(false)
        ctx.logger.warn(`dsh-canvas: 退出设计模式失败：${String(err)}`)
      })
  }

  const backToChat = (): void => {
    try {
      ctx.layout.selectPanel(null)
    } catch (err) {
      ctx.logger.warn(`dsh-canvas: 切回对话失败：${String(err)}`)
    }
  }

  const state = status?.pendingInteraction !== undefined
    ? 'pending'
    : status?.running === true
      ? 'running'
      : 'idle'
  const statusTitle = state === 'pending'
    ? t('status.pending')
    : state === 'running'
      ? t('status.running')
      : t('status.idle')

  return React.createElement(React.Fragment, null,
    React.createElement(Styles),
    React.createElement('div', { className: 'dshc-panel' },
      React.createElement('header', { className: 'dshc-toolbar' },
        React.createElement('span', { className: 'dshc-title' }, t('panel.title')),
        design && React.createElement('span', { className: 'dshc-badge' },
          `${t('panel.designActive')}${design.styleName ?? t('design.free')}`),
        React.createElement('div', { className: 'dshc-actions' },
          React.createElement('button', {
            type: 'button', className: 'dshc-btn', title: t('panel.refresh'), 'aria-label': t('panel.refresh'), onClick: refresh,
          }, React.createElement(RefreshIcon)),
          React.createElement('button', {
            type: 'button', className: 'dshc-btn', title: t('panel.openExternal'), 'aria-label': t('panel.openExternal'), onClick: openExternal,
          }, React.createElement(ExternalIcon)),
          design && React.createElement('button', {
            type: 'button', className: 'dshc-btn', onClick: exitDesign, disabled: exiting,
          }, t('panel.exitDesign')))),
      React.createElement('div', { className: 'dshc-body' },
        React.createElement('iframe', {
          key: src,
          ref: frameRef,
          className: 'dshc-frame',
          title: t('panel.title'),
          src,
          onLoad: () => { setLoaded(true); setSlow(false) },
        }),
        !loaded && !slow && React.createElement('div', { className: 'dshc-overlay' }, t('panel.loading')),
        slow && React.createElement('div', { className: 'dshc-overlay' },
          React.createElement('div', null, t('panel.slow')),
          React.createElement('div', { style: { display: 'flex', gap: 8 } },
            React.createElement('button', { type: 'button', className: 'dshc-btn', onClick: refresh }, t('panel.retry')),
            React.createElement('button', { type: 'button', className: 'dshc-btn', onClick: openExternal }, t('panel.openExternal')))),
        React.createElement('button', {
          type: 'button',
          className: 'dshc-ball',
          title: `${t('panel.backToChat')} · ${statusTitle}`,
          'aria-label': `${t('panel.backToChat')} · ${statusTitle}`,
          onClick: backToChat,
        },
        React.createElement(ChatIcon, { size: 19 }),
        React.createElement('span', { className: 'dshc-ball__dot', 'data-state': state, 'aria-hidden': true })))))
}

/** 订阅浏览器内的设计状态镜像。 */
function useSync(): number {
  return React.useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** 当前主视图保留的会话 id（主面板没有 Session 绑定）。 */
function readCurrentSessionId(useSessions: SelectorHook | undefined): string | null {
  if (!useSessions) return null
  return useSessions((state: any) => {
    const values = Object.values(state?.byId ?? {}) as any[]
    const retained = values.find((entry) => (entry?.retainedBy?.mainView ?? 0) > 0)
    return retained?.id ?? null
  }) ?? null
}

/** 当前主视图会话的工作目录。 */
function readCurrentCwd(useSessions: SelectorHook | undefined): string | null {
  if (!useSessions) return null
  return useSessions((state: any) => {
    const values = Object.values(state?.byId ?? {}) as any[]
    const retained = values.find((entry) => (entry?.retainedBy?.mainView ?? 0) > 0)
    return retained?.cwd ?? null
  }) ?? null
}
