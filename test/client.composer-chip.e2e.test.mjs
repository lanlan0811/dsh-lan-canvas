/**
 * 输入区「设计」chip 的真实浏览器验收（Issue #4）。
 *
 * 覆盖：常驻入口 → 选设计系统直接进入设计模式 → 跨轮询周期不回退 →
 * 退出 → 自由探索分支 → 风格加载失败 → Escape 回焦。
 * 用真实 dist/client.js + 真实 React 渲染，fetch 由页面内桩接管并记录请求。
 */
import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { build } from 'esbuild'
import { resolveTestBrowser } from './helpers/browser.mjs'

const browserPath = resolveTestBrowser()
const root = resolve(import.meta.dirname, '..')
const clientPath = join(root, 'dist', 'client.js')

/** 最小挂载脚本：DSH 模块表 + Client 上下文 + Host 桩，全部在浏览器里执行。 */
const MOUNT_SOURCE = `
import * as React from 'react'
import { createRoot } from 'react-dom/client'

const state = { active: false, styleId: null, styleName: null }
const names = { nerv: 'NERV 风', apple: 'Apple' }
window.__calls = []
window.__panelSelections = []
window.__failStyles = false

function json(body, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

window.fetch = async (input, init = {}) => {
  const url = new URL(String(input), 'http://dsh.test')
  const method = init.method ?? 'GET'
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : null
  window.__calls.push({ path: url.pathname, search: url.search, method, body })
  if (url.pathname === '/dsh-canvas/styles') {
    if (window.__failStyles) return Promise.resolve(new Response('boom', { status: 500, headers: { 'Content-Type': 'text/plain' } }))
    return json({ styles: [
      { id: 'nerv', name: 'NERV 风', tagline: '暗底、霓虹红、高技术感', swatches: ['#0f0f10', '#191b1e', '#ea343a', '#f4f9ff'], builtin: true },
      { id: 'apple', name: 'Apple', tagline: '克制、留白', swatches: ['#ffffff', '#1d1d1f', '#0071e3'], builtin: true },
    ], current: null })
  }
  if (url.pathname === '/dsh-canvas/design-state') {
    return json({ active: state.active, styleId: state.styleId, styleName: state.styleName, openRequested: false })
  }
  if (url.pathname === '/dsh-canvas/design-mode' && method === 'POST') {
    const styleId = body.styleId === 'free' ? null : body.styleId
    state.active = body.enabled === true
    state.styleId = state.active ? styleId : null
    state.styleName = state.active && styleId !== null ? (names[styleId] ?? styleId) : null
    return json({ ok: true, active: state.active, styleId: state.styleId, styleName: state.styleName, pagesUpdated: 0 })
  }
  return Promise.resolve(new Response('not found', { status: 404 }))
}

let dict = {}
const registrations = []
const warnings = []
const ctx = {
  logger: { debug() {}, warn(message) { warnings.push(String(message)) } },
  slots: {
    inject(_key, callback) { callback(); return () => {} },
    register(options, render) { registrations.push({ ...options, render }); return () => {} },
  },
  layout: { selectPanel(panelId) { window.__panelSelections.push(panelId) } },
  locale: {
    register(_ns, dicts) { dict = dicts.zh ?? dict; return () => {} },
    bind() { return (key) => dict[key] ?? key },
  },
  effect(callback) { const cleanup = callback(); return typeof cleanup === 'function' ? cleanup : () => {} },
  inject(_deps, callback) {
    callback({
      logger: ctx.logger,
      layout: ctx.layout,
      get: (name) => name === 'commandUi' ? { register() { return () => {} } } : undefined,
    })
    return () => {}
  },
  get() { return undefined },
}
window.__warnings = warnings

const loaded = window.__plugin
if (!loaded) throw new Error('dist/client.js 未注册 __ModuleLoader__ 工厂')
const plugin = loaded.factory((name) => {
  if (name === 'react') return React
  throw new Error('客户端只允许 require(react)：' + name)
})
plugin.apply(ctx)

const chip = registrations.find((entry) => entry.id === 'dsh-canvas-design')
if (!chip) throw new Error('缺少 conversation.input.left 设计 chip')
createRoot(document.getElementById('root')).render(
  React.createElement(chip.render, {
    sessionId: 's-e2e',
    useSessions: (selector) => selector({ byId: { 's-e2e': { cwd: '/tmp/dsh-canvas-chip-e2e' } } }),
    usePanelInfo: (selector) => selector({ activePanelId: null }),
  }),
)
`

/** 点菜单里文字匹配的项（真实 pointer 事件，走 React onClick）。 */
async function clickItem(page, text) {
  await page.evaluate((label) => {
    const target = [...document.querySelectorAll('.dshc-item')]
      .find((node) => node.querySelector('.dshc-item__name')?.textContent === label)
    if (!target) throw new Error(`找不到菜单项：${label}`)
    target.click()
  }, text)
}

test('设计 chip：常驻入口、选设计系统直接进入、可退出与降级', { skip: !browserPath && '未找到浏览器' }, async () => {
  assert.ok(browserPath, '正式验收必须提供浏览器（DSH_CANVAS_REQUIRE_BROWSER=1）')
  const buildResult = await build({
    stdin: { contents: MOUNT_SOURCE, resolveDir: root, sourcefile: 'client-chip-mount.js', loader: 'js' },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  })
  const mountCode = buildResult.outputFiles[0].text

  const puppeteer = (await import('puppeteer-core')).default
  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    args: ['--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox'],
  })
  const errors = []
  try {
    const page = await browser.newPage()
    page.on('pageerror', (error) => errors.push(String(error)))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.setViewport({ width: 1024, height: 760 })
    // 入口放在视口下方：菜单向上弹出也能落在可视区域内。
    await page.setContent('<style>html,body{margin:0;height:100%}#root{position:fixed;left:40px;bottom:56px}</style><div id="root"></div>')
    await page.addScriptTag({ content: 'window.__ModuleLoader__ = { load(spec) { window.__plugin = spec } }' })
    await page.addScriptTag({ path: clientPath })
    await page.addScriptTag({ content: mountCode })
    await page.waitForSelector('.dshc-chip')

    // 1) 常驻入口：未进入设计模式也显示「设计」。
    assert.equal(await page.$eval('.dshc-chip', (element) => element.textContent.trim()), '设计')
    assert.equal(await page.$eval('.dshc-chip', (element) => element.getAttribute('aria-haspopup')), 'menu')
    assert.equal(await page.$eval('.dshc-chip', (element) => element.getAttribute('aria-expanded')), 'false')
    assert.equal(await page.$eval('.dshc-chip', (element) => element.getAttribute('data-active')), null)

    // 2) 点开即选设计系统：只加载列表，不进入设计模式。
    await page.click('.dshc-chip')
    await page.waitForSelector('.dshc-menu')
    assert.equal(await page.$eval('.dshc-chip', (element) => element.getAttribute('aria-expanded')), 'true')
    assert.match(await page.$eval('.dshc-menu', (element) => element.textContent), /选择设计系统/)
    const itemNames = await page.$$eval('.dshc-item__name', (nodes) => nodes.map((node) => node.textContent ?? ''))
    assert.ok(itemNames.includes('自由探索'), '菜单必须包含「自由探索」')
    assert.ok(itemNames.includes('NERV 风'), '菜单必须包含内置设计系统')
    const stylesCall = await page.evaluate(() => window.__calls.find((call) => call.path === '/dsh-canvas/styles'))
    assert.ok(stylesCall, '打开菜单必须请求 /dsh-canvas/styles')
    assert.match(stylesCall.search, /sessionId=s-e2e/)
    assert.match(stylesCall.search, /cwd=%2Ftmp%2Fdsh-canvas-chip-e2e/)
    assert.equal(await page.evaluate(() => window.__calls.filter((call) => call.method === 'POST').length), 0, '仅打开菜单不得进入设计模式')

    // 3) 选中 NERV 风：POST design-mode，chip 变「设计 · NERV 风」，不抢切画布。
    await clickItem(page, 'NERV 风')
    await page.waitForFunction(() => document.querySelector('.dshc-chip')?.textContent.trim() === '设计 · NERV 风')
    const posts = await page.evaluate(() => window.__calls.filter((call) => call.method === 'POST'))
    assert.equal(posts.length, 1, '选中风格只允许一次 POST')
    assert.equal(posts[0].path, '/dsh-canvas/design-mode')
    assert.deepEqual(posts[0].body, {
      sessionId: 's-e2e',
      cwd: '/tmp/dsh-canvas-chip-e2e',
      enabled: true,
      styleId: 'nerv',
    })
    assert.equal(await page.$eval('.dshc-chip', (element) => element.getAttribute('data-active')), 'true')
    assert.deepEqual(await page.evaluate(() => window.__panelSelections), [], '进入设计模式不得抢占画布面板')
    assert.equal(await page.$('.dshc-menu'), null, '进入设计模式后菜单必须关闭')

    // 4) 跨轮询周期（800ms）状态不回退。
    await new Promise((done) => setTimeout(done, 1200))
    assert.equal(await page.$eval('.dshc-chip', (element) => element.textContent.trim()), '设计 · NERV 风')

    // 5) 退出设计模式：回到常驻入口，轮询停止。
    await page.click('.dshc-chip')
    await page.waitForSelector('.dshc-menu')
    await clickItem(page, '退出设计模式')
    await page.waitForFunction(() => document.querySelector('.dshc-chip')?.textContent.trim() === '设计')
    const exitPost = await page.evaluate(() => window.__calls.filter((call) => call.method === 'POST').at(-1))
    assert.equal(exitPost.body.enabled, false)
    assert.equal(exitPost.body.sessionId, 's-e2e')
    assert.equal(await page.$eval('.dshc-chip', (element) => element.getAttribute('data-active')), null)
    await new Promise((done) => setTimeout(done, 1200))
    assert.equal(await page.$eval('.dshc-chip', (element) => element.textContent.trim()), '设计', '退出后轮询必须停止')

    // 6) 自由探索分支：styleId=free，chip 显示「设计 · 自由探索」。
    await page.click('.dshc-chip')
    await page.waitForSelector('.dshc-menu')
    await clickItem(page, '自由探索')
    await page.waitForFunction(() => document.querySelector('.dshc-chip')?.textContent.trim() === '设计 · 自由探索')
    const freePost = await page.evaluate(() => window.__calls.filter((call) => call.method === 'POST').at(-1))
    assert.equal(freePost.body.styleId, 'free')
    assert.equal(freePost.body.enabled, true)
    await page.click('.dshc-chip')
    await page.waitForSelector('.dshc-menu')
    await clickItem(page, '退出设计模式')
    await page.waitForFunction(() => document.querySelector('.dshc-chip')?.textContent.trim() === '设计')

    // 7) 风格加载失败：菜单给出错误提示，仍可 Escape 关闭并回焦。
    await page.evaluate(() => { window.__failStyles = true })
    await page.click('.dshc-chip')
    await page.waitForFunction(() => document.querySelector('.dshc-menu')?.textContent.includes('设计风格加载失败'))
    assert.ok(await page.$('.dshc-menu'))
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('.dshc-menu'))
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('dshc-chip')), true, 'Escape 后焦点回到 chip')
    await page.evaluate(() => { window.__failStyles = false })

    assert.deepEqual(errors, [], '页面不得出现未捕获错误或 console.error')
  } finally {
    await browser.close()
  }
})
