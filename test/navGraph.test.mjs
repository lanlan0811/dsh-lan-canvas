/**
 * 页面跳转派生连线：解析、去重、缓存失效与读取失败隔离。
 * 不启动浏览器/服务；直接验证 dist 暴露的纯函数面。
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const { readNavLinks, clearNavGraphCache } = await import(pathToFileURL(join(root, 'dist/index.mjs')).href)

const cwd = mkdtempSync(join(tmpdir(), 'dshc-navgraph-'))
const pages = join(cwd, '.dsh-canvas', 'pages')
mkdirSync(pages, { recursive: true })

let rev = 0
function node(id, title, htmlRev) {
  rev += 1
  return {
    id,
    type: 'page',
    title,
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    deviceType: 'desktop',
    htmlPath: `.dsh-canvas/pages/${id}.html`,
    ...(htmlRev === undefined ? {} : { htmlRev }),
    createdAt: 1,
    updatedAt: rev,
  }
}

function project(nodes) {
  return { version: 1, viewport: { x: 0, y: 0, zoom: 1 }, nodes, edges: [] }
}

function pair(link) {
  return `${link.source}->${link.target}`
}

function sorted(links) {
  return links.map(pair).sort()
}

function write(id, html) {
  writeFileSync(join(pages, `${id}.html`), html)
}

try {
  write('page-a', '<html><body><a href="page-b.html">B</a><a href="page-b.html">再次 B</a><a href="详情.html">slug</a><a href="missing.html">missing</a><a href="#top">anchor</a><a href="https://example.com">ext</a><a href="page-a.html">self</a></body></html>')
  write('page-b', '<html><body><a data-nav="page-a">回首页</a><a href="https://example.com">ext</a></body></html>')
  write('page-c', '<html><body><p>孤立页</p></body></html>')
  const a = node('page-a', '首页', 1)
  const b = node('page-b', '详情', 1)
  const c = node('page-c', '孤立页', 1)

  const first = readNavLinks(cwd, project([a, b, c]))
  assert.deepEqual(sorted(first), ['page-a->page-b', 'page-b->page-a'], '只应保留已存在页面之间的去重跳转')

  const again = readNavLinks(cwd, project([a, b, c]))
  assert.deepEqual(sorted(again), sorted(first), '未变化时应命中缓存得到相同结果')

  // 改 A 的 HTML + htmlRev：缓存必须失效，A 新增到 C 的边。
  write('page-a', '<html><body><a href="page-c.html">C</a><a href="详情.html">slug</a></body></html>')
  const a2 = node('page-a', '首页', 2)
  const second = readNavLinks(cwd, project([a2, b, c]))
  assert.deepEqual(sorted(second), ['page-a->page-b', 'page-a->page-c', 'page-b->page-a'], 'HTML 变化后应更新；slug 与 B 的 data-nav 仍在')

  // 标题变化影响 slug 解析：A 的「详情.html」不再解析到 B。
  const b2 = node('page-b', '目标', 1)
  const third = readNavLinks(cwd, project([a2, b2, c]))
  assert.deepEqual(sorted(third), ['page-a->page-c', 'page-b->page-a'], '标题变化后 slug 链接应失效')

  // 删除页面：悬空端点不得返回。
  const fourth = readNavLinks(cwd, project([a2, b2]))
  assert.deepEqual(sorted(fourth), ['page-b->page-a'], '删除目标页后应移除 A→C')

  // 目录占用页面文件：读取失败只跳过该页，不抛错。
  mkdirSync(join(pages, 'page-bad.html'))
  const bad = node('page-bad', '坏页', 1)
  const fifth = readNavLinks(cwd, project([a2, b2, bad]))
  assert.deepEqual(sorted(fifth), ['page-b->page-a'], '页面读取失败不应影响其他页面')

  // 无 htmlRev 的旧项目用 updatedAt 作为缓存版本。
  const oldA = node('page-old', '旧页', undefined)
  write('page-old', '<html><body><a href="page-b.html">B</a></body></html>')
  const oldFirst = readNavLinks(cwd, project([oldA, b2]))
  assert.deepEqual(sorted(oldFirst), ['page-old->page-b'], 'B 的 data-nav 指向未纳入项目的 A，不应产生边')
  const oldA2 = { ...oldA, updatedAt: oldA.updatedAt + 100 }
  write('page-old', '<html><body><a data-nav="page-a">A</a></body></html>')
  const oldSecond = readNavLinks(cwd, project([oldA2, a2, b2]))
  assert.deepEqual(sorted(oldSecond), ['page-b->page-a', 'page-old->page-a'], '旧项目 updatedAt 变化后应重读页面')

  console.log('OK navGraph: 解析/去重/缓存失效/标题变化/删除/读取失败/旧项目版本，全部通过')
} finally {
  clearNavGraphCache(cwd)
  rmSync(cwd, { recursive: true, force: true })
}
