/**
 * Host 路由注册时机：webServer 晚于插件就绪时，/dsh-canvas/* 不能静默丢失。
 *
 * 回归：1.1.3 客户端已正常，但 Host 在 webServer 就绪前 apply，registerRoutes 同步
 * `ctx.get('webServer')` 得到 undefined，四条路由全部未注册，表现为画布 iframe 空白、
 * `/design` HTTP 404。修复为 ctx.inject(['webServer']) 后，工具仍立即可用，路由在服务
 * 注入后注册。
 */
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { loadBundle } from './helpers/dsh.mjs'

const root = resolve(import.meta.dirname, '..')
const ENTRY = pathToFileURL(resolve(root, 'dist', 'index.mjs')).href

test('webServer 晚到：工具先可用，路由在注入后才注册，且可正常响应', async () => {
  const { harness } = await loadBundle(ENTRY, { deferWebServer: true })
  try {
    assert.equal(harness.routes.size, 0, 'webServer 未就绪前不得注册任何 /dsh-canvas 路由')
    assert.ok(harness.tools.dsh_canvas_get_state, '工具不依赖 webServer，应立即可用')
    assert.ok(harness.skills.some((skill) => skill.name === 'dsh-canvas'), '技能应立即可用')

    harness.provideService('webServer', harness.webServer)
    assert.ok(harness.routes.has('/dsh-canvas/design-state'), 'webServer 注入后 design-state 路由必须注册')
    assert.ok(harness.routes.has('/dsh-canvas/launch'), 'webServer 注入后 launch 路由必须注册')

    const response = await harness.callRoute('GET', '/dsh-canvas/design-state', { query: '?sessionId=sess-1' })
    assert.equal(response.status, 200, response.body)
    assert.doesNotThrow(() => JSON.parse(response.body))
  } finally {
    await harness.dispose()
  }
})
