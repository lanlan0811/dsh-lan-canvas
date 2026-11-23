/** 与 Host 路由通信的唯一入口（同源 fetch，带 DSH 自己的浏览器凭证 cookie）。 */
export interface StyleOption {
  id: string
  name: string
  tagline: string
  swatches: string[]
  builtin: boolean
}

export interface StylesResponse {
  styles: StyleOption[]
  current: string | null
}

export interface DesignInfo {
  active: boolean
  styleId: string | null
  styleName: string | null
}

export interface DesignStateResponse extends DesignInfo {
  openRequested: boolean
}

type Query = { sessionId?: string | null; cwd?: string | null }

function queryOf(query: Query): string {
  const params = new URLSearchParams()
  if (query.sessionId) params.set('sessionId', query.sessionId)
  if (query.cwd) params.set('cwd', query.cwd)
  const text = params.toString()
  return text ? `?${text}` : ''
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `HTTP ${response.status}`)
  }
  return await response.json() as T
}

/** 读取可选风格与当前锁定。 */
export async function fetchStyles(query: Query, signal?: AbortSignal): Promise<StylesResponse> {
  return await readJson<StylesResponse>(await fetch(`/dsh-canvas/styles${queryOf(query)}`, {
    credentials: 'same-origin',
    signal,
  }))
}

/** 读取设计模式状态（consume=1 时 Host 会清掉「自动打开画布」标记）。 */
export async function fetchDesignState(
  sessionId: string,
  consume: boolean,
  signal?: AbortSignal,
): Promise<DesignStateResponse> {
  const params = new URLSearchParams({ sessionId })
  if (consume) params.set('consume', '1')
  return await readJson<DesignStateResponse>(await fetch(`/dsh-canvas/design-state?${params.toString()}`, {
    credentials: 'same-origin',
    signal,
  }))
}

/** 开启/关闭设计模式，并锁定项目风格。 */
export async function postDesignMode(body: {
  sessionId?: string | null
  cwd?: string | null
  enabled: boolean
  styleId?: string
}): Promise<DesignInfo & { pagesUpdated?: number }> {
  const response = await fetch('/dsh-canvas/design-mode', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return await readJson<DesignInfo & { pagesUpdated?: number }>(response)
}

/** 面板 iframe 地址：Host 302 到真实画布（URL 里的 secret 只存在于 Location）。 */
export function canvasLaunchUrl(cwd: string | null, revision: number): string {
  const params = new URLSearchParams()
  if (cwd) params.set('cwd', cwd)
  if (revision > 0) params.set('reload', String(revision))
  const text = params.toString()
  return `/dsh-canvas/launch${text ? `?${text}` : ''}`
}
