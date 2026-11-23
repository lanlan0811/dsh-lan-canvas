/**
 * Client 入口：把画布面板、左侧栏图标、输入框设计 chip 与 `/design` 命令
 * 注册进 DSH 的槽位系统。
 *
 * 工厂本身不产生副作用：所有注册都在 apply 内、由 ctx.effect 持有，
 * 插件卸载/槽位折叠时自动清理。
 */
import * as React from 'react'
import { fetchStyles, postDesignMode, type StyleOption } from './api.js'
import { CanvasPanel } from './CanvasPanel.js'
import { ComposerChip } from './ComposerChip.js'
import { PanelIcon } from './PanelIcon.js'
import { en, zh } from './locales.js'
import { resetDesignViews, setDesignView } from './store.js'
import type { ClientContext, SelectOption, SlotProps, Translate } from './types.js'

export const inject = ['slots', 'locale', 'layout']

const NS = 'dsh-canvas'
const PANEL_ID = 'dsh-canvas'

/**
 * 插件主体。
 * @param ctx - DSH 客户端根上下文。
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    const registerLocale = ctx.locale.register(NS, { zh, en })
    return () => {
      registerLocale()
      resetDesignViews()
    }
  }, 'dsh-canvas: 字典与状态镜像')

  const t = ctx.locale.bind(NS)

  // 左侧栏入口：id 与 main 的 key 一致，侧栏据此选中面板。
  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 12,
    label: () => t('panel.icon'),
  }, (props: SlotProps) => React.createElement(PanelIcon, props))), 'dsh-canvas: 左侧栏入口')

  // 主面板画布：顶部工具条 + iframe + 悬浮球。
  ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
  }, (props: SlotProps) => React.createElement(CanvasPanel, { ...props, ctx, t }))), 'dsh-canvas: 主面板')

  // 输入框左侧「设计」chip。
  ctx.effect(() => ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'dsh-canvas-design',
    order: 30,
    label: () => t('panel.designChip'),
  }, (props: SlotProps) => React.createElement(ComposerChip, { ...props, ctx, t }))), 'dsh-canvas: 设计 chip')

  // `/design` 命令：客户端自有命令（不产生模型消息），弹出风格选择器。
  ctx.effect(() => ctx.inject(['commandUi'], (scope) => {
    const commandUi = scope.get('commandUi') as { register(contribution: Record<string, unknown>): () => void } | undefined
    if (!commandUi) {
      scope.logger.warn('dsh-canvas: 没有 commandUi 服务，/design 命令未注册（chip 仍可用）')
      return
    }
    try {
      commandUi.register({
        name: 'design',
        label: () => t('design.command'),
        description: () => t('design.commandDesc'),
        available: () => true,
        ui: {
          kind: 'popupSelect',
          searchLabels: () => ({
            placeholder: t('design.command'),
            empty: t('design.failed'),
            noResults: t('design.failed'),
          }),
          options: async (session: { sessionId: string }, signal: AbortSignal): Promise<SelectOption[]> => {
            const response = await fetchStyles({ sessionId: session.sessionId }, signal)
            return [
              {
                id: 'free',
                label: t('design.free'),
                detail: t('design.freeHint'),
                active: response.current === null,
              },
              ...response.styles.filter((style: StyleOption) => style.id !== 'free').map((style: StyleOption): SelectOption => ({
                id: style.id,
                label: style.name,
                badge: style.builtin ? undefined : 'custom',
                detail: [style.tagline, style.swatches.slice(0, 5).join(' ')].filter(Boolean).join(' · '),
                active: response.current === style.id,
              })),
            ]
          },
          onSelect: async (option: SelectOption, session: { sessionId: string }): Promise<void> => {
            try {
              const result = await postDesignMode({
                sessionId: session.sessionId,
                enabled: true,
                styleId: option.id,
              })
              setDesignView({
                sessionId: session.sessionId,
                cwd: null,
                active: result.active,
                styleId: result.styleId,
                styleName: result.styleName,
              })
              try {
                scope.layout.selectPanel(PANEL_ID)
              } catch (err) {
                scope.logger.debug(`dsh-canvas: 画布面板尚未注册：${String(err)}`)
              }
            } catch (err) {
              scope.logger.warn(`dsh-canvas: 开启设计模式失败：${String(err)}`)
            }
          },
        },
      })
    } catch (err) {
      // 与宿主命令重名时 fail loud；此时 chip 仍提供等价的选择器。
      scope.logger.warn(`dsh-canvas: /design 命令注册失败：${String(err)}`)
    }
  }), 'dsh-canvas: /design 命令')
}

export type { Translate }
