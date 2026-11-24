/**
 * 自动排布 HTTP 端到端（不启浏览器）：网格、幂等、保留项目其他字段、鉴权。
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { loadBundle } from './helpers/dsh.mjs'

const root = resolve(import.meta.dirname, '..')
const { tools, api } = await loadBundle(pathToFileURL(join(root, 'dist', 'index.mjs')).href)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function overlaps(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

async function openWorkspace(prefix) {
  const cwd = mkdtempSync(join(tmpdir(), prefix))
  const opened = await tools.dsh_canvas_open.execute({ input: { port: 0 }, cwd })
  assert.ok(!opened.isError, opened.content)
  const url = new URL(opened.content.match(/http:\/\/127\.0\.0\.1:\d+\/w\/[0-9a-f]{32}\/\?ws=[0-9a-f]{32}#[0-9a-f]{64}/)[0])
  return { cwd, url, ws: url.searchParams.get('ws') }
}

function readProject(cwd) {
  return JSON.parse(readFileSync(join(cwd, '.dsh-canvas', 'project.json'), 'utf8'))
}

async function postJson(url, ws, path, body, header = true) {
  return fetch(url.origin + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(header ? { 'X-DSH-Canvas': '1' } : {}),
    },
    body: JSON.stringify({ ws, ...body }),
  })
}

const main = await openWorkspace('dshc-layout-')
const empty = await openWorkspace('dshc-layout-empty-')
try {
  const specs = [
    ['page-a', 'A', 0, 0, 640, 480],
    ['page-b', 'B', 700, 0, 375, 812],
    ['page-c', 'C', 1400, 0, 900, 600],
    ['page-d', 'D', 0, 600, 320, 240],
    ['page-e', 'E', 700, 600, 1440, 900],
  ]
  for (const [id, title, x, y, width, height] of specs) {
    const added = await tools.dsh_canvas_upsert_page.execute({
      input: { id, title, x, y, width, height, html: `<html><body><p>${title}</p></body></html>` },
      cwd: main.cwd,
    })
    assert.ok(!added.isError, added.content)
  }
  const linked = await tools.dsh_canvas_arrange.execute({ input: { action: 'link', source: 'page-a', target: 'page-b' }, cwd: main.cwd })
  assert.ok(!linked.isError, linked.content)
  const comment = await postJson(main.url, main.ws, '/api/comments', {
    op: 'add',
    pageId: 'page-a',
    xpath: '/html[1]/body[1]/p[1]',
    tagName: 'p',
    note: '排布后保留',
  })
  assert.equal(comment.status, 200)

  const before = readProject(main.cwd)
  const viewport = before.viewport
  const first = await postJson(main.url, main.ws, '/api/nodes', { op: 'layout' })
  assert.equal(first.status, 200)
  const firstBody = await first.json()
  assert.equal(firstBody.ok, true)
  assert.equal(firstBody.moved, 4, '除已在 0,0 的 A 外，5 个节点中 4 个应被移动')
  assert.equal(firstBody.positions.length, 5)

  const after = readProject(main.cwd)
  assert.deepEqual(after.viewport, viewport, '排布不应改视口')
  assert.equal(after.edges.length, 1, '排布不应改手动连线')
  assert.equal(after.comments.length, 1, '排布不应丢批注')
  assert.equal(after.comments[0].note, '排布后保留')
  assert.deepEqual(after.nodes.map((n) => n.id).sort(), specs.map((s) => s[0]).sort())

  for (const node of after.nodes) {
    const position = firstBody.positions.find((p) => p.id === node.id)
    assert.ok(position, `响应缺少 ${node.id}`)
    assert.equal(node.x, position.x)
    assert.equal(node.y, position.y)
    assert.ok(node.x >= 0 && node.y >= 0, `${node.id} 坐标应为非负`)
  }
  for (let i = 0; i < after.nodes.length; i++) {
    for (let j = i + 1; j < after.nodes.length; j++) {
      assert.equal(overlaps(after.nodes[i], after.nodes[j]), false, `排布后不应重叠：${after.nodes[i].id} / ${after.nodes[j].id}`)
    }
  }
  assert.equal(new Set(after.nodes.map((n) => n.x)).size, 3, '5 个页面应排成 3 列')

  const beforeBytes = readFileSync(join(main.cwd, '.dsh-canvas', 'project.json'))
  await sleep(20)
  const second = await postJson(main.url, main.ws, '/api/nodes', { op: 'layout' })
  assert.equal(second.status, 200)
  const secondBody = await second.json()
  assert.equal(secondBody.moved, 0, '第二次排布应幂等')
  assert.deepEqual(readFileSync(join(main.cwd, '.dsh-canvas', 'project.json')), beforeBytes, '幂等时不应写盘')

  const noHeader = await postJson(main.url, main.ws, '/api/nodes', { op: 'layout' }, false)
  assert.equal(noHeader.status, 403, '缺少 X-DSH-Canvas 必须拒绝')
  const badOp = await postJson(main.url, main.ws, '/api/nodes', { op: 'not-a-real-op' })
  assert.equal(badOp.status, 400, '未知 op 应 400')

  // 空项目：不写 project.json。
  const emptyBefore = existsSync(join(empty.cwd, '.dsh-canvas', 'project.json'))
  const emptyLayout = await postJson(empty.url, empty.ws, '/api/nodes', { op: 'layout' })
  assert.equal(emptyLayout.status, 200)
  const emptyBody = await emptyLayout.json()
  assert.deepEqual(emptyBody.positions, [])
  assert.equal(emptyBody.moved, 0)
  assert.equal(existsSync(join(empty.cwd, '.dsh-canvas', 'project.json')), emptyBefore, '空项目排布不应创建/改写项目文件')

  console.log('OK layout: 3 列不重叠 / 幂等 / 保留连线批注视口 / 空项目 / 鉴权与未知 op，全部通过')
} finally {
  await api.dispose().catch(() => {})
  rmSync(main.cwd, { recursive: true, force: true })
  rmSync(empty.cwd, { recursive: true, force: true })
}
