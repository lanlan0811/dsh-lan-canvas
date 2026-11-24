/**
 * 选中面板：展示当前选中项，提供「复制修改请求」（粘给 AI）与元素批注。
 * 不做元素级可视化编辑：用户以批注表达修改意图，由 AI 统一修改。
 */
import { useEffect, useRef, useState } from 'react'
import { copyText } from './clipboard'
import type { ApiComment, ApiSelection } from './api'

export interface SelectionPanelProps {
  selection: ApiSelection | null
  pageTitle: string | null
  /** 该页（selection.pageId）的批注，按创建时间升序。 */
  comments?: ApiComment[]
  /** 给当前选中元素添加一条批注。 */
  onAddComment?: (input: { pageId: string; xpath: string; tagName: string; textContent?: string; note: string }) => void
  /** 标记批注已解决 / 重新打开。 */
  onToggleResolve?: (id: string, resolved: boolean) => void
  /** 删除一条批注。 */
  onRemoveComment?: (id: string) => void
}

/** idle：可复制；copied：刚复制成功；failed：自动复制失败，展示手动复制文本。 */
type CopyState = 'idle' | 'copied' | 'failed'

function buildRequestText(selection: ApiSelection, pageTitle: string | null): string {
  const lines = [`请修改以下设计：`, `页面：${pageTitle ?? selection.pageId}（id=${selection.pageId}）`]
  if (selection.kind === 'element' && selection.element) {
    const el = selection.element
    lines.push(`元素：<${el.tagName}> xpath=${el.xpath}`)
    if (el.textContent) lines.push(`当前文本：${el.textContent}`)
    if (el.computedStyles) {
      const keys = ['color', 'background-color', 'font-size', 'font-weight', 'padding', 'border-radius']
      const picked = keys.filter((k) => el.computedStyles?.[k]).map((k) => `${k}: ${el.computedStyles?.[k]}`)
      if (picked.length) lines.push(`当前样式：${picked.join('；')}`)
    }
  } else {
    lines.push(`选中：整个页面节点`)
  }
  lines.push(``, `期望的修改：`)
  return lines.join('\n')
}

export function SelectionPanel({
  selection,
  pageTitle,
  comments,
  onAddComment,
  onToggleResolve,
  onRemoveComment,
}: SelectionPanelProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const [fallbackText, setFallbackText] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [note, setNote] = useState('')
  const resetTimer = useRef<number | null>(null)
  const fallbackRef = useRef<HTMLTextAreaElement | null>(null)

  // 逻辑选中项：同一元素的 SSE 刷新（对象 identity 变化）不应清掉复制/批注状态。
  const selectionKey = selection
    ? `${selection.pageId}\u0000${selection.kind}\u0000${selection.element?.xpath ?? ''}`
    : ''
  const selectionKeyRef = useRef('')
  selectionKeyRef.current = selectionKey

  useEffect(() => {
    if (resetTimer.current !== null) {
      window.clearTimeout(resetTimer.current)
      resetTimer.current = null
    }
    setCopyState('idle')
    setFallbackText('')
    setCollapsed(false)
    setNote('')
  }, [selectionKey])

  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
  }, [])

  // 自动复制失败：聚焦并全选手动复制文本，用户可直接 Ctrl+C。
  useEffect(() => {
    if (copyState !== 'failed' || !fallbackText) return
    const area = fallbackRef.current
    if (!area) return
    area.focus()
    area.select()
  }, [copyState, fallbackText])

  if (!selection) return null
  const el = selection.element

  if (collapsed) {
    return (
      <button
        type="button"
        className="selection-panel__tab"
        title="展开选中面板"
        onClick={() => setCollapsed(false)}
      >
        选中面板
      </button>
    )
  }

  async function copyRequest(): Promise<void> {
    const current = selection
    if (!current) return
    const targetKey = selectionKeyRef.current
    let content = ''
    try {
      content = buildRequestText(current, pageTitle)
    } catch {
      content = ''
    }
    if (!content) {
      setCopyState('failed')
      setFallbackText('')
      return
    }
    let ok = false
    try {
      ok = await copyText(content)
    } catch {
      ok = false
    }
    // 等待期间用户换了选中项：旧请求的结果不能覆盖新面板状态。
    if (selectionKeyRef.current !== targetKey) return
    if (ok) {
      setCopyState('copied')
      setFallbackText('')
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
      resetTimer.current = window.setTimeout(() => {
        resetTimer.current = null
        setCopyState((state) => (state === 'copied' ? 'idle' : state))
      }, 2000)
    } else {
      setCopyState('failed')
      setFallbackText(content)
    }
  }

  return (
    <div className="selection-panel">
      <div className="selection-panel__head">
        <span className="selection-panel__title">选中：{selection.kind === 'element' ? '页面内元素' : '页面节点'}</span>
        <div className="selection-panel__actions">
          <button
            type="button"
            className="btn btn--primary"
            title={copyState === 'failed' ? '自动复制失败，请手动复制下方文本' : '复制选中项与修改期望，粘给 AI'}
            onClick={() => { void copyRequest() }}
          >
            {copyState === 'copied' ? '已复制' : copyState === 'failed' ? '复制失败' : '复制修改请求'}
          </button>
          <button
            type="button"
            className="selection-panel__collapse"
            title="收起面板"
            aria-label="收起面板"
            onClick={() => setCollapsed(true)}
          >
            ×
          </button>
        </div>
        <span className="selection-panel__status" role="status" aria-live="polite">
          {copyState === 'copied'
            ? '修改请求已复制到剪贴板'
            : copyState === 'failed'
              ? '自动复制失败，已展示可手动复制的文本'
              : ''}
        </span>
      </div>
      {copyState === 'failed' && (
        <div className="selection-panel__copy-fallback" role="alert">
          <div className="selection-panel__copy-hint">
            {fallbackText
              ? '自动复制被浏览器拦截，请按 Ctrl+C / Command+C 手动复制下面的修改请求：'
              : '生成修改请求失败，请重新选中元素或刷新画布后重试。'}
          </div>
          {fallbackText && (
            <textarea
              ref={fallbackRef}
              className="selection-panel__copy-text"
              aria-label="修改请求文本（可手动复制）"
              readOnly
              spellCheck={false}
              value={fallbackText}
              onFocus={(event) => event.currentTarget.select()}
            />
          )}
        </div>
      )}
      <div className="selection-panel__meta">
        {pageTitle ? `${pageTitle} · ` : ''}
        {el ? `<${el.tagName}>` : selection.pageId}
      </div>
      {el && (
        <div className="selection-panel__xpath" title={el.xpath}>
          {el.xpath}
        </div>
      )}
      {selection && (!!comments?.length || !!el) ? (
        <div className="selection-panel__comments">
          {el && onAddComment && (
            <div className="field field--note">
              <label>
                <span>批注这个元素</span>
                <textarea
                  className="selection-panel__note-input"
                  value={note}
                  rows={2}
                  placeholder="例如：这个按钮改成主色、字号加大"
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!note.trim()}
                onClick={() => {
                  onAddComment({
                    pageId: selection.pageId,
                    xpath: el.xpath,
                    tagName: el.tagName,
                    textContent: el.textContent,
                    note: note.trim(),
                  })
                  setNote('')
                }}
              >
                添加批注
              </button>
            </div>
          )}
          {comments && comments.length > 0 && (
            <ul className="comment-list">
              {comments.map((c, i) => (
                <li key={c.id} className={`comment-item${c.resolved ? ' comment-item--resolved' : ''}`}>
                  <span className="comment-item__seq">{i + 1}</span>
                  <div className="comment-item__body">
                    <div className="comment-item__note">{c.note}</div>
                    <div className="comment-item__xpath" title={c.xpath}>
                      {c.xpath}
                    </div>
                  </div>
                  {onToggleResolve && (
                    <button
                      type="button"
                      className="comment-item__btn"
                      title={c.resolved ? '重新打开' : '标记已解决'}
                      onClick={() => onToggleResolve(c.id, !c.resolved)}
                    >
                      {c.resolved ? '重开' : '解决'}
                    </button>
                  )}
                  {onRemoveComment && (
                    <button
                      type="button"
                      className="comment-item__btn"
                      title="删除批注"
                      aria-label="删除批注"
                      onClick={() => onRemoveComment(c.id)}
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
