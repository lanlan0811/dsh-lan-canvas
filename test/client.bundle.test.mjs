/**
 * Client 产物契约：dist/client.js 必须按 DSH 模块表注册，`/design` 命令
 * 只进入设计模式、不抢切画布（回归 v1.0.1 的修复）。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const React = (await import('react')).default

function loadClient() {
  const source = readFileSync(join(root, 'dist', 'client.js'), 'utf8')
  const window = {}
  let id
  let factory
  window.__ModuleLoader__ = { load(spec) { id = spec.id; factory = spec.factory } }
  // eslint-disable-next-line no-new-func
  new Function('window', source)(window)
  assert.equal(id, 'dsh-canvas', '工厂 id 必须是包名 dsh-canvas')
  const plugin = factory((name) => {
    if (name === 'react') return React
    throw new Error(`客户端只允许 require('react')，实际 require(${name})`)
  })
  return plugin
}

function mount() {
  const plugin = loadClient()
  const registrations = []
  const contributions = []
  const panelSelections = []
  const warnings = []
  const ctx = {
    logger: { debug() {}, warn(message) { warnings.push(String(message)) } },
    slots: {
      inject(_key, callback) { callback(); return () => {} },
      register(options) { registrations.push(options); return () => {} },
    },
    layout: { selectPanel(panelId) { panelSelections.push(panelId) } },
    locale: {
      register() { return () => {} },
      bind() { return (key) => key },
    },
    effect(callback) { const cleanup = callback(); return typeof cleanup === 'function' ? cleanup : () => {} },
    inject(deps, callback) {
      callback({
        logger: ctx.logger,
        layout: ctx.layout,
        get: (name) => name === 'commandUi' ? { register(contribution) { contributions.push(contribution); return () => {} } } : undefined,
      })
      return () => {}
    },
    get() { return undefined },
  }
  plugin.apply(ctx)
  return { plugin, registrations, contributions, panelSelections, warnings }
}

test('dist/client.js：模块表工厂、三个槽位与 /design 命令', () => {
  const { plugin, registrations, contributions, warnings } = mount()
  assert.deepEqual(plugin.inject, ['slots', 'locale', 'layout'])
  assert.deepEqual(registrations.map((entry) => `${entry.name}:${entry.id ?? entry.key}`), [
    'sidebar.panellist:dsh-canvas',
    'main:dsh-canvas',
    'conversation.input.left:dsh-canvas-design',
  ])
  assert.equal(contributions.length, 1, '/design 应注册一个客户端命令')
  assert.equal(contributions[0].name, 'design')
  assert.equal(contributions[0].ui.kind, 'popupSelect')
  assert.deepEqual(warnings, [])
})

test('/design 选中风格只进入设计模式，不提前切换到画布面板', async () => {
  const { contributions, panelSelections, warnings } = mount()
  const contribution = contributions[0]
  const calls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body })
    return {
      ok: true,
      status: 200,
      async json() {
        if (String(url).includes('/design-mode')) {
          return { ok: true, active: true, styleId: 'apple', styleName: 'Apple', pagesUpdated: 0 }
        }
        return { styles: [], current: null }
      },
      async text() { return '' },
    }
  }
  try {
    // 选项：自由探索 + 目录风格（'free' 不重复出现）
    const options = await contribution.ui.options({ sessionId: 's1' }, new AbortController().signal)
    assert.equal(options[0].id, 'free')
    assert.ok(!options.slice(1).some((option) => option.id === 'free'))
    // 选中一个风格：POST design-mode，且不 selectPanel
    await contribution.ui.onSelect({ id: 'apple', label: 'Apple' }, { sessionId: 's1' })
  } finally {
    globalThis.fetch = originalFetch
  }
  const posted = calls.find((call) => call.method === 'POST')
  assert.ok(posted, '必须 POST /dsh-canvas/design-mode')
  const body = JSON.parse(posted.body)
  assert.equal(body.enabled, true)
  assert.equal(body.styleId, 'apple')
  assert.deepEqual(panelSelections, [], '选风格后不得抢切画布面板（否则输入框被藏起）')
  assert.deepEqual(warnings, [])
})
