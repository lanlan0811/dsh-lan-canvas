/**
 * 设计模式注入：只在开启设计模式的会话、收到 user/message 后注入一段短上下文。
 * 未开启、或事件不是 user/message 时不注入。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadBundle } from './helpers/dsh.mjs'

const root = resolve(import.meta.dirname, '..')
const entry = pathToFileURL(join(root, 'dist', 'index.mjs')).href

const cwd = mkdtempSync(join(tmpdir(), 'dsh-canvas-inject-'))
const sessionId = 'session-inject'
const injected = []
const agent = { id: sessionId, inject(message) { injected.push(message) } }

const { api, harness } = await loadBundle(entry, {
  sessions: [[sessionId, { id: sessionId, header: { cwd } }]],
  agents: [[sessionId, agent]],
})

try {
  // 未开启设计模式：不注入
  harness.emitEvent('session/event', { id: sessionId, header: { cwd } }, { type: 'user/message' })
  assert.equal(injected.length, 0, '未开启设计模式不得注入上下文')

  // 非 user/message 事件：不注入
  const enabled = await harness.callRoute('POST', '/dsh-canvas/design-mode', {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, enabled: true, styleId: 'free' }),
  })
  assert.equal(enabled.status, 200, enabled.body)
  harness.emitEvent('session/event', { id: sessionId, header: { cwd } }, { type: 'tool/result' })
  assert.equal(injected.length, 0, '只有 user/message 才注入')

  // 开启后 user/message：注入一次短上下文
  harness.emitEvent('session/event', { id: sessionId, header: { cwd } }, { type: 'user/message' })
  assert.equal(injected.length, 1, '设计模式会话应在用户消息后注入上下文')
  const message = injected[0]
  assert.equal(message.role, 'user')
  assert.equal(typeof message.id, 'string')
  assert.deepEqual(message.source, { kind: 'user' })
  const text = message.content.map((block) => block.text).join('')
  assert.match(text, /设计模式已开启/)
  assert.match(text, /dsh_canvas_get_state/)
  assert.ok(text.length < 800, `注入上下文应短（实际 ${text.length} 字）`)

  // 关闭后不再注入
  const disabled = await harness.callRoute('POST', '/dsh-canvas/design-mode', {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, enabled: false }),
  })
  assert.equal(disabled.status, 200)
  harness.emitEvent('session/event', { id: sessionId, header: { cwd } }, { type: 'user/message' })
  assert.equal(injected.length, 1, '退出设计模式后不得继续注入')

  console.log('OK 设计模式注入: 仅设计模式会话 + 仅 user/message + 短上下文')
} finally {
  await api.dispose()
  rmSync(cwd, { recursive: true, force: true })
}
