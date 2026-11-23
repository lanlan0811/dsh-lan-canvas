/** 共享的 SVG 图标与样式；所有颜色走宿主主题 token（--dsw-alias-*）。 */
import * as React from 'react'

/** 插件自有样式；随组件挂载，卸载即移除。 */
export const CSS = `
.dshc-wrap{position:relative;display:inline-flex}
.dshc-chip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1;cursor:pointer;white-space:nowrap}
.dshc-chip:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dshc-chip:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dshc-chip[data-active="true"]{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.dshc-menu{position:absolute;bottom:calc(100% + 6px);left:0;z-index:40;width:290px;max-height:340px;overflow:auto;padding:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:0 10px 28px rgba(0,0,0,.22);font-size:12px}
.dshc-menu__title{padding:6px 8px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dshc-item{display:flex;align-items:flex-start;gap:8px;width:100%;padding:7px 8px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.dshc-item:hover{background:var(--dsw-alias-bg-layer-2)}
.dshc-item[aria-checked="true"]{background:var(--dsw-alias-bg-layer-2)}
.dshc-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dshc-item__body{display:flex;flex-direction:column;gap:2px;min-width:0}
.dshc-item__name{font-weight:500}
.dshc-item__hint{color:var(--dsw-alias-label-secondary);font-size:11px}
.dshc-swatches{display:flex;gap:3px;margin-top:3px}
.dshc-swatch{width:10px;height:10px;border-radius:3px;border:1px solid var(--dsw-alias-border-l1)}
.dshc-sep{height:1px;margin:6px 4px;background:var(--dsw-alias-border-l1)}
.dshc-note{padding:4px 8px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dshc-panel{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base)}
.dshc-toolbar{display:flex;align-items:center;gap:8px;flex:0 0 36px;height:36px;padding:0 10px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.dshc-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dshc-badge{max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:1px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;font-size:11px;color:var(--dsw-alias-brand-primary)}
.dshc-actions{display:flex;align-items:center;gap:4px;margin-left:auto}
.dshc-btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;height:26px;min-width:26px;padding:0 6px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.dshc-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dshc-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dshc-body{position:relative;flex:1 1 auto;min-height:0}
.dshc-frame{display:block;width:100%;height:100%;border:0;background:var(--dsw-alias-bg-base)}
.dshc-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);font-size:12px;text-align:center}
.dshc-ball{position:absolute;left:14px;bottom:14px;z-index:5;display:flex;align-items:center;justify-content:center;width:40px;height:40px;border:1px solid var(--dsw-alias-border-l2);border-radius:50%;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:0 6px 16px rgba(0,0,0,.24);cursor:pointer}
.dshc-ball:hover{background:var(--dsw-alias-bg-layer-2)}
.dshc-ball:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dshc-ball__dot{position:absolute;right:1px;top:1px;width:10px;height:10px;border-radius:50%;border:2px solid var(--dsw-alias-bg-base);background:var(--dsw-alias-state-idle-primary)}
.dshc-ball__dot[data-state="running"]{background:var(--dsw-alias-state-success-primary)}
.dshc-ball__dot[data-state="pending"]{background:var(--dsw-alias-state-warn-primary)}
.dshc-ball__dot[data-state="error"]{background:var(--dsw-alias-state-error-primary)}
`

/** 注入一次样式；重复挂载只会多一个同内容 style 元素。 */
export function Styles(): React.ReactElement {
  return React.createElement('style', { 'data-dsh-canvas': 'styles' }, CSS)
}

interface IconProps {
  size?: number
}

/** 画布图标（原创 SVG：四角框 + 中心节点）。 */
export function CanvasIcon({ size = 16 }: IconProps): React.ReactElement {
  return React.createElement('svg', {
    width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': true, focusable: false,
  },
  React.createElement('path', { d: 'M2 5V2.8h2.2' }),
  React.createElement('path', { d: 'M14 5V2.8h-2.2' }),
  React.createElement('path', { d: 'M2 11v2.2h2.2' }),
  React.createElement('path', { d: 'M14 11v2.2h-2.2' }),
  React.createElement('circle', { cx: 8, cy: 8, r: 2.1 }),
  React.createElement('path', { d: 'M4.2 4.2 6.4 6.4M11.8 4.2 9.6 6.4M4.2 11.8l2.2-2.2M11.8 11.8 9.6 9.6' }))
}

/** 对话图标（回到对话）。 */
export function ChatIcon({ size = 18 }: IconProps): React.ReactElement {
  return React.createElement('svg', {
    width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': true, focusable: false,
  },
  React.createElement('path', { d: 'M2.6 3.5h10.8v7.2H7.4L4.6 13V10.7H2.6z' }),
  React.createElement('path', { d: 'M5.2 6.2h5.6M5.2 8.2h3.6' }))
}

/** 刷新图标。 */
export function RefreshIcon({ size = 15 }: IconProps): React.ReactElement {
  return React.createElement('svg', {
    width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': true, focusable: false,
  },
  React.createElement('path', { d: 'M13 8a5 5 0 1 1-1.6-3.7' }),
  React.createElement('path', { d: 'M13.2 2.4v2.9h-2.9' }))
}

/** 在浏览器打开图标。 */
export function ExternalIcon({ size = 15 }: IconProps): React.ReactElement {
  return React.createElement('svg', {
    width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': true, focusable: false,
  },
  React.createElement('path', { d: 'M9.2 2.6h4.2v4.2' }),
  React.createElement('path', { d: 'M13.4 2.6 7.6 8.4' }),
  React.createElement('path', { d: 'M12.2 9.4v3.2a.8.8 0 0 1-.8.8H3.4a.8.8 0 0 1-.8-.8V4.6a.8.8 0 0 1 .8-.8h3.2' }))
}

/** 设计（调色板）图标。 */
export function DesignIcon({ size = 14 }: IconProps): React.ReactElement {
  return React.createElement('svg', {
    width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': true, focusable: false,
  },
  React.createElement('path', { d: 'M8 1.8a6.2 6.2 0 0 0 0 12.4c1 0 1.5-.6 1.5-1.4 0-.9-.7-1.2-.7-2 0-.7.6-1.2 1.4-1.2h1.1c1.6 0 2.7-1.1 2.7-2.6C14 4 11.5 1.8 8 1.8z' }),
  React.createElement('circle', { cx: 5.4, cy: 6.4, r: 0.8, fill: 'currentColor', stroke: 'none' }),
  React.createElement('circle', { cx: 8.2, cy: 4.8, r: 0.8, fill: 'currentColor', stroke: 'none' }),
  React.createElement('circle', { cx: 4.9, cy: 9.6, r: 0.8, fill: 'currentColor', stroke: 'none' }))
}
