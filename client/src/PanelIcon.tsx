/** 左侧栏「画布」图标：主面板 key 与本条目 id 必须一致（dsh-canvas）。 */
import * as React from 'react'
import { CanvasIcon, Styles } from './ui.js'
import type { SlotProps } from './types.js'

interface Props extends SlotProps {
  size?: number
  active?: boolean
}

export function PanelIcon({ size = 16, active = false }: Props): React.ReactElement {
  return React.createElement(React.Fragment, null,
    React.createElement(Styles),
    React.createElement('span', {
      style: {
        display: 'inline-flex',
        color: active ? 'var(--dsw-alias-brand-primary)' : 'currentColor',
      },
    }, React.createElement(CanvasIcon, { size })))
}
