/** Client 侧用到的最小声明的 DSH 客户端契约（不 import 任何 @deepseek-ai/*）。 */
import type * as React from 'react'

/** 组件收到的标准 props（各 slot 的子集；本插件只读自己用到的）。 */
export interface SlotProps {
  sessionId?: string
  useSessions?: SelectorHook
  usePanelInfo?: SelectorHook
  useSessionStatus?: SelectorHook
  useWorkspaces?: SelectorHook
  t?: Translate
  [key: string]: unknown
}

/** 选择器 hook：`useX(s => ...)`。 */
export interface SelectorHook {
  <T>(selector: (state: any) => T): T
}

/** 绑定到命名空间的翻译函数。 */
export interface Translate {
  (key: string, params?: Record<string, string | number>): string
}

export interface ClientLogger {
  debug(message: string): void
  warn(message: string): void
}

export interface ClientSlots {
  inject(key: string, callback: () => () => void): () => void
  register(options: Record<string, unknown>, component: (props: SlotProps) => React.ReactNode): () => void
}

export interface ClientLayout {
  selectPanel(panelId: string | null): void
}

export interface ClientLocale {
  register(ns: string, dicts: Record<string, Record<string, string>>): () => void
  bind(ns: string): Translate
}

export interface SelectOption {
  id: string
  label: string
  badge?: string
  detail?: string
  active?: boolean
}

export interface CommandUi {
  register(contribution: Record<string, unknown>): () => void
}

/** 客户端 Cordis Context 的子集。 */
export interface ClientContext {
  readonly logger: ClientLogger
  readonly slots: ClientSlots
  readonly layout: ClientLayout
  readonly locale: ClientLocale
  effect(callback: () => void | (() => void), label?: string): void
  inject(deps: string[], callback: (scope: ClientContext) => void): () => void
  get(name: string): unknown
}
