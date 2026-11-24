/**
 * 页面跳转连线（派生数据）。
 *
 * 为什么不写进 project.json：
 *  - 连线来自页面 HTML 里的 <a href> / <a data-nav>，HTML 一变就必须跟着变；
 *  - 写进项目模型会出现「已删除页面的悬空边」「手动连线与派生连线重复」两类脏数据；
 *  - 画布只需要读：`GET /api/project` 带上派生 `navLinks`，前端渲染成只读虚线。
 *
 * 性能：按工作区缓存每页解析后的 anchors；页面 HTML 未变（htmlRev 未变）时不重读。
 * 标题变化会影响 slug 解析，但不需要重读页面——每次调用都用最新标题索引重新 resolve。
 *
 * 安全：只读 pages 目录；页面读取失败、越界或目录等情况只跳过该页，不影响项目读取。
 * 上限：单次冷构建最多读取 32 MiB、返回 500 条边，避免超大项目阻塞本地服务。
 */
import { mayHaveNavLinks, createNavIndex, parseNavDocument, resolveNavRef, type ParsedNavAnchor } from './nav.js'
import { readPageHtml, type PageNode, type Project } from './project.js'

export interface NavLink {
  source: string
  target: string
}

interface PageAnchors {
  /** htmlRev（旧项目缺失时用 updatedAt）。 */
  version: number
  anchors: readonly ParsedNavAnchor[]
}

interface WorkspaceGraph {
  pages: Map<string, PageAnchors>
}

const workspaces = new Map<string, WorkspaceGraph>()

/** 单次读取上限，防止超大工作区在 GET /api/project 上阻塞太久。 */
const MAX_READ_BYTES = 32 * 1024 * 1024
const MAX_LINKS = 500

function workspaceKey(cwd: string): string {
  const path = String(cwd)
  return process.platform === 'win32' ? path.toLowerCase() : path
}

function pageVersion(node: PageNode): number {
  return typeof node.htmlRev === 'number' && node.htmlRev > 0 ? node.htmlRev : node.updatedAt
}

/** 关闭画布服务时一起清掉；测试也可显式清理单个工作区。 */
export function clearNavGraphCache(cwd?: string): void {
  if (cwd === undefined) workspaces.clear()
  else workspaces.delete(workspaceKey(cwd))
}

/**
 * 读取页面间的可解析跳转关系。
 * 返回值不含悬空端点、自环、外链、纯锚点和歧义链接；按 source→target 去重。
 */
export function readNavLinks(cwd: string, project: Project): NavLink[] {
  const key = workspaceKey(cwd)
  let graph = workspaces.get(key)
  if (!graph) {
    graph = { pages: new Map() }
    workspaces.set(key, graph)
  }

  const index = createNavIndex(project.nodes)
  const links: NavLink[] = []
  const seen = new Set<string>()
  let readBytes = 0

  for (const node of project.nodes) {
    if (links.length >= MAX_LINKS) break
    const version = pageVersion(node)
    let entry = graph.pages.get(node.id)
    if (!entry || entry.version !== version) {
      let html: string | null
      try {
        html = readPageHtml(cwd, node.id)
      } catch {
        // 暂时读不到（占用/权限/目录等）不要缓存空结果；修复后下一次调用应重试。
        continue
      }
      if (html === null) {
        graph.pages.set(node.id, { version, anchors: [] })
        continue
      }
      readBytes += Buffer.byteLength(html, 'utf8')
      if (readBytes > MAX_READ_BYTES) break
      const anchors = mayHaveNavLinks(html) ? parseNavDocument(html).anchors : []
      entry = { version, anchors }
      graph.pages.set(node.id, entry)
    }

    for (const anchor of entry.anchors) {
      const target = resolveNavRef(anchor.ref, index).target
      if (!target || target === node.id) continue
      const pair = `${node.id}\u0000${target}`
      if (seen.has(pair)) continue
      seen.add(pair)
      links.push({ source: node.id, target })
      if (links.length >= MAX_LINKS) break
    }
  }

  // 页面删除后同步回收缓存，避免长期运行的画布服务积累无效条目。
  const live = new Set(project.nodes.map((node) => node.id))
  for (const id of graph.pages.keys()) {
    if (!live.has(id)) graph.pages.delete(id)
  }
  return links
}
