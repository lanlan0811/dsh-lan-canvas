/**
 * 输入框左侧的「设计」chip：设计模式入口与状态入口。
 *
 * - 常驻显示：未进入设计模式时是「设计」入口，点开选择设计系统（或自由探索），
 *   选中即直接进入设计模式（Issue #4）；
 * - `/design` 命令仍然是等价入口，二者共用同一套 Host 状态；
 * - 已进入时 chip 显示「设计 · 风格名」，菜单可切换风格或退出；
 * - 自动开画布：设计模式期间轮询 Host 状态，收到 openRequested 后切到画布面板。
 */
import * as React from 'react'
import {
  fetchDesignState,
  fetchStyles,
  postDesignMode,
  type StyleOption,
} from './api.js'
import { designViewOf, setDesignView, subscribe, snapshot } from './store.js'
import { Styles, DesignIcon } from './ui.js'
import type { ClientContext, SlotProps, Translate } from './types.js'

interface Props extends SlotProps {
  ctx: ClientContext
  t: Translate
}

const POLL_MS = 800

export function ComposerChip({ ctx, t, sessionId, useSessions, usePanelInfo }: Props): React.ReactElement | null {
  useSync();
  const id = typeof sessionId === 'string' ? sessionId : ''
  const cwd = readCwd(useSessions, id)
  const activePanelId = usePanelInfo ? usePanelInfo((info: any) => info?.activePanelId ?? null) : null
  const view = id ? designViewOf(id) : undefined
  const active = view?.active === true
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [styles, setStyles] = React.useState<StyleOption[] | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const menuId = React.useId()
  const wrap = React.useRef<HTMLDivElement | null>(null)
  const chip = React.useRef<HTMLButtonElement | null>(null)

  // 挂载/会话切换时与 Host 同步（刷新页面后恢复设计模式）。
  React.useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    void fetchDesignState(id, false, controller.signal)
      .then((state) => {
        setDesignView({
          sessionId: id,
          cwd,
          active: state.active,
          styleId: state.styleId,
          styleName: state.styleName,
        })
      })
      .catch(() => {
        /* 同步失败不弹错：用户仍可手动开启 */
      })
    return () => {
      controller.abort()
    }
  }, [id, cwd])

  // 自动开画布：仅设计模式期间轮询；画布已可见时只消费标记，不再切面板。
  React.useEffect(() => {
    if (!id || !active) return
    let disposed = false
    const timer = window.setInterval(() => {
      if (disposed) return
      void fetchDesignState(id, false)
        .then(async (state) => {
          if (disposed) return
          setDesignView({ sessionId: id, cwd, active: state.active, styleId: state.styleId, styleName: state.styleName })
          if (!state.openRequested) return
          if (activePanelId !== 'dsh-canvas') {
            try {
              ctx.layout.selectPanel('dsh-canvas')
            } catch (err) {
              // 主面板尚未注册（插件刚加载）：保留标记，下一轮再试。
              ctx.logger.debug(`dsh-canvas: 画布面板尚未注册：${String(err)}`)
              return
            }
          }
          await fetchDesignState(id, true)
        })
        .catch(() => {
          /* 轮询失败静默重试；用户仍可从左侧栏手动打开 */
        })
    }, POLL_MS)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [id, cwd, active, activePanelId, ctx])

  // 点击外部 / Escape 关闭菜单；Escape 把焦点还给 chip。
  React.useEffect(() => {
    if (!menuOpen) return
    const onPointer = (event: PointerEvent): void => {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      chip.current?.focus()
    }
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [menuOpen])

  const openMenu = (): void => {
    const next = !menuOpen
    setMenuOpen(next)
    setError(null)
    if (!next) return
    setLoading(true)
    void fetchStyles({ sessionId: id, cwd })
      .then((response) => {
        // 'free' 由菜单里的「自由探索」固定行表达；目录里即使出现也不重复。
        setStyles(response.styles.filter((style) => style.id !== 'free'))
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(t('design.failed'))
        setLoading(false)
        ctx.logger.warn(`dsh-canvas: 读取设计风格失败：${String(err)}`)
      })
  }

  const applyStyle = (styleId: string): void => {
    if (busy) return
    setBusy(true)
    setError(null)
    void postDesignMode({ sessionId: id, cwd, enabled: true, styleId })
      .then((result) => {
        setDesignView({ sessionId: id, cwd, active: result.active, styleId: result.styleId, styleName: result.styleName })
        setMenuOpen(false)
        setBusy(false)
      })
      .catch((err: unknown) => {
        setBusy(false)
        setError(err instanceof Error ? err.message : String(err))
      })
  }

  const exitDesign = (): void => {
    if (busy) return
    setBusy(true)
    void postDesignMode({ sessionId: id, cwd, enabled: false })
      .then(() => {
        setDesignView({ sessionId: id, cwd, active: false, styleId: null, styleName: null })
        setMenuOpen(false)
        setBusy(false)
      })
      .catch((err: unknown) => {
        setBusy(false)
        setError(err instanceof Error ? err.message : String(err))
      })
  }

  // 风格名兜底：Host 返回 styleName 为空时用 id，仍为空才是自由探索。
  const styleLabel = view?.styleName ?? view?.styleId ?? t('design.free')
  const label = active ? `${t('panel.designActive')}${styleLabel}` : t('panel.designChip')
  const title = active ? label : t('design.entryHint')

  // 没有会话 id 时无法落 Host 状态，不渲染入口（DSH composer 槽位为 session 作用域）。
  if (!id) return null

  return React.createElement(React.Fragment, null,
    React.createElement(Styles),
    React.createElement('div', { className: 'dshc-wrap', ref: wrap },
      React.createElement('button', {
        type: 'button',
        ref: chip,
        className: 'dshc-chip',
        'data-active': active ? 'true' : undefined,
        'aria-haspopup': 'menu',
        'aria-expanded': menuOpen,
        'aria-controls': menuOpen ? menuId : undefined,
        title,
        onClick: openMenu,
      },
      React.createElement(DesignIcon, { size: 14 }),
      React.createElement('span', null, label)),
      menuOpen && React.createElement('div', {
        className: 'dshc-menu',
        id: menuId,
        role: 'menu',
        'aria-label': active ? t('design.menuTitle') : t('design.pickTitle'),
      },
      React.createElement('div', { className: 'dshc-menu__title' },
        active ? t('design.menuTitle') : t('design.pickTitle')),
      !active && React.createElement('div', { className: 'dshc-note' }, t('design.pickHint')),
      React.createElement('button', {
        type: 'button', role: 'menuitemradio', className: 'dshc-item',
        'aria-checked': active && view?.styleId === null,
        disabled: busy,
        onClick: () => applyStyle('free'),
      },
      React.createElement('span', { className: 'dshc-item__body' },
        React.createElement('span', { className: 'dshc-item__name' }, t('design.free')),
        React.createElement('span', { className: 'dshc-item__hint' }, t('design.freeHint')))),
      loading && React.createElement('div', { className: 'dshc-note' }, t('design.loading')),
      (styles ?? []).map((style) => React.createElement('button', {
        key: style.id,
        type: 'button', role: 'menuitemradio', className: 'dshc-item',
        'aria-checked': active && view?.styleId === style.id,
        disabled: busy,
        onClick: () => applyStyle(style.id),
      },
      React.createElement('span', { className: 'dshc-item__body' },
        React.createElement('span', { className: 'dshc-item__name' }, style.name),
        React.createElement('span', { className: 'dshc-item__hint' }, style.tagline),
        React.createElement('span', { className: 'dshc-swatches' },
          style.swatches.slice(0, 5).map((color, index) => React.createElement('span', {
            key: `${style.id}-${index}`,
            className: 'dshc-swatch',
            style: { background: color },
          })))))),
      error !== null && React.createElement('div', { className: 'dshc-note' }, error),
      active && React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'dshc-sep' }),
        React.createElement('button', {
          type: 'button', role: 'menuitem', className: 'dshc-item',
          disabled: busy,
          onClick: exitDesign,
        }, React.createElement('span', { className: 'dshc-item__name' }, t('design.exit')))))))
}

/** 订阅浏览器内的设计状态镜像。 */
function useSync(): number {
  return React.useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** 会话工作目录（`sessionId` 不在时返回 null）。 */
function readCwd(useSessions: Props['useSessions'], sessionId: string): string | null {
  if (!useSessions || !sessionId) return null
  return useSessions((state: any) => state?.byId?.[sessionId]?.cwd ?? null) ?? null
}
