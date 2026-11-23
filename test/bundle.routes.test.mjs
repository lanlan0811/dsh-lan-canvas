/**
 * Host 路由与设计模式状态机（假 ctx，真 dist 产物）。
 *
 * 覆盖：4 条路由注册、owner-only 认证拒绝、styles 列表、design-mode 锁定项目风格、
 * design-state 的 openRequested 消费，以及 launch 的 302/400 分支。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadBundle } from './helpers/dsh.mjs'

const root = resolve(import.meta.dirname, '..')
const entry = pathToFileURL(join(root, 'dist', 'index.mjs')).href

let rejectNext = undefined
const connection = {
  requestRejection: () => rejectNext,
}

const cwd = mkdtempSync(join(tmpdir(), 'dsh-canvas-routes-'))
const sessionId = 'session-routes'
const { api, harness } = await loadBundle(entry, {
  connection,
  sessions: [[sessionId, { id: sessionId, header: { cwd } }]],
})

const designMode = `${cwd}/.dsh-canvas/project.json`

try {
  // ---- 认证 ----
  rejectNext = 403
  const forbidden = await harness.callRoute('GET', '/dsh-canvas/styles', { query: `?cwd=${encodeURIComponent(cwd)}` })
  assert.equal(forbidden.status, 403, '认证失败必须 403')
  rejectNext = 401
  const unauthorized = await harness.callRoute('GET', '/dsh-canvas/design-state', { query: `?sessionId=${sessionId}` })
  assert.equal(unauthorized.status, 401)
  rejectNext = undefined

  // ---- styles ----
  const styles = await harness.callRoute('GET', '/dsh-canvas/styles', { query: `?cwd=${encodeURIComponent(cwd)}` })
  assert.equal(styles.status, 200)
  const styleBody = JSON.parse(styles.body)
  assert.ok(Array.isArray(styleBody.styles) && styleBody.styles.length > 0, '应返回内置风格列表')
  assert.equal(styleBody.current, null, '未锁定时应为 null')
  for (const style of styleBody.styles) {
    assert.equal(typeof style.id, 'string')
    assert.equal(typeof style.name, 'string')
    assert.ok(Array.isArray(style.swatches))
    assert.equal(typeof style.builtin, 'boolean')
  }
  // sessionId 也能推导 cwd
  const viaSession = await harness.callRoute('GET', '/dsh-canvas/styles', { query: `?sessionId=${sessionId}` })
  assert.equal(viaSession.status, 200)
  assert.ok(JSON.parse(viaSession.body).styles.length > 0)

  // ---- design-mode：开启并锁定风格 ----
  const enabled = await harness.callRoute('POST', '/dsh-canvas/design-mode', {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, enabled: true, styleId: 'tianshu-original' }),
  })
  assert.equal(enabled.status, 200, enabled.body)
  const enabledBody = JSON.parse(enabled.body)
  assert.equal(enabledBody.active, true)
  assert.equal(enabledBody.styleId, 'tianshu-original')
  assert.ok(enabledBody.styleName)
  const project = JSON.parse(readFileSync(designMode, 'utf8'))
  assert.equal(project.design?.styleId, 'tianshu-original', '风格必须锁定到 project.json')

  // 未知风格必须 400，且不改变已有锁定
  const unknown = await harness.callRoute('POST', '/dsh-canvas/design-mode', {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, enabled: true, styleId: 'no-such-style' }),
  })
  assert.equal(unknown.status, 400, unknown.body)
  assert.equal(JSON.parse(readFileSync(designMode, 'utf8')).design.styleId, 'tianshu-original')

  // 无法确定工作区必须 400
  const noCwd = await harness.callRoute('POST', '/dsh-canvas/design-mode', {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'session-unknown', enabled: true, styleId: 'free' }),
  })
  assert.equal(noCwd.status, 400)

  // ---- design-state：user/message 后 openRequested 置位并被消费 ----
  const before = JSON.parse((await harness.callRoute('GET', '/dsh-canvas/design-state', { query: `?sessionId=${sessionId}` })).body)
  assert.equal(before.active, true)
  assert.equal(before.openRequested, false, '仅开启设计模式不应自动开画布')

  harness.emitEvent('session/event', { id: sessionId, header: { cwd } }, { type: 'user/message' })
  const pending = JSON.parse((await harness.callRoute('GET', '/dsh-canvas/design-state', { query: `?sessionId=${sessionId}` })).body)
  assert.equal(pending.openRequested, true, '用户发送需求后应请求自动打开画布')
  const consumed = JSON.parse((await harness.callRoute('GET', '/dsh-canvas/design-state', { query: `?sessionId=${sessionId}&consume=1` })).body)
  assert.equal(consumed.openRequested, true)
  const afterConsume = JSON.parse((await harness.callRoute('GET', '/dsh-canvas/design-state', { query: `?sessionId=${sessionId}` })).body)
  assert.equal(afterConsume.openRequested, false, 'consume=1 后标记必须清除')

  // ---- free 解除锁定 ----
  const free = await harness.callRoute('POST', '/dsh-canvas/design-mode', {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, enabled: true, styleId: 'free' }),
  })
  assert.equal(free.status, 200)
  assert.equal(JSON.parse(free.body).styleId, null)
  assert.equal(JSON.parse(readFileSync(designMode, 'utf8')).design, undefined, '自由探索必须解除项目风格')

  // ---- 退出设计模式 ----
  const disabled = await harness.callRoute('POST', '/dsh-canvas/design-mode', {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, enabled: false }),
  })
  assert.equal(disabled.status, 200)
  const state = JSON.parse((await harness.callRoute('GET', '/dsh-canvas/design-state', { query: `?sessionId=${sessionId}` })).body)
  assert.equal(state.active, false)

  // ---- launch ----
  const launched = await harness.callRoute('GET', '/dsh-canvas/launch', { query: `?cwd=${encodeURIComponent(cwd)}` })
  assert.equal(launched.status, 302, launched.body)
  const location = launched.headers.location
  assert.match(location, /^http:\/\/127\.0\.0\.1:\d+\/w\/[0-9a-f]{32}\/\?ws=[0-9a-f]{32}#[0-9a-f]{64}$/)
  assert.doesNotMatch(launched.body, /ws=/, '302 响应体不得包含凭证')

  const noWorkspace = await harness.callRoute('GET', '/dsh-canvas/launch')
  assert.ok([400, 302].includes(noWorkspace.status), `没有工作区时应 400 或回退默认目录（实际 ${noWorkspace.status}）`)
  if (noWorkspace.status === 302) assert.match(noWorkspace.headers.location, /^http:\/\/127\.0\.0\.1:/)

  console.log('OK 路由与设计模式: 认证 / styles / 锁定 / openRequested / launch')
} finally {
  await api.dispose()
  rmSync(cwd, { recursive: true, force: true })
}
