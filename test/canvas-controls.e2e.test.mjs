/**
 * 画布工具条 e2e：自动排布、单页预览、总预览、空态禁用。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { loadBundle } from './helpers/dsh.mjs'
import { resolveTestBrowser } from './helpers/browser.mjs'

const root = resolve(import.meta.dirname, '..')
const browserPath = resolveTestBrowser()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function overlaps(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

test('画布工具条：自动排布 / 单页预览 / 总预览', { skip: !browserPath && '未找到浏览器' }, async () => {
  const { tools, api } = await loadBundle(pathToFileURL(join(root, 'dist', 'index.mjs')).href)
  const puppeteer = (await import('puppeteer-core')).default
  const cwd = mkdtempSync(join(tmpdir(), 'dshc-controls-'))
  let browser
  try {
    const opened = await tools.dsh_canvas_open.execute({ input: { port: 0 }, cwd })
    const url = opened.content.match(/http:\/\/127\.0\.0\.1:\d+\/w\/[0-9a-f]{32}\/\?ws=[0-9a-f]{32}#[0-9a-f]{64}/)[0]
    for (const [id, title, x, y, width, height] of [
      ['page-a', 'A 页', 0, 0, 640, 480],
      ['page-b', 'B 页', 3000, 0, 375, 812],
      ['page-c', 'C 页', 0, 2000, 900, 600],
    ]) {
      const added = await tools.dsh_canvas_upsert_page.execute({
        input: { id, title, x, y, width, height, html: `<html><body><h1>${title}</h1></body></html>` },
        cwd,
      })
      assert.ok(!added.isError, added.content)
    }
    const projectFile = join(cwd, '.dsh-canvas', 'project.json')
    const positions = () => Object.fromEntries(JSON.parse(readFileSync(projectFile, 'utf8')).nodes.map((n) => [n.id, { x: n.x, y: n.y }]))
    const before = positions()

    browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] })
    const page = await browser.newPage()
    await page.setViewport({ width: 1600, height: 1000 })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForSelector('.page-node__header', { timeout: 15000 })
    await sleep(1000)

    const toolLabels = await page.$$eval('.topbar__tools .topbar__btn', (els) => els.map((el) => el.getAttribute('aria-label')))
    assert.deepEqual(toolLabels, ['切换页面列表', '适应视图', '自动排布页面', '预览全部页面'])

    // 1) 未选中时总预览从第一页开始。
    await page.click('.topbar__btn[aria-label="预览全部页面"]')
    await page.waitForSelector('.preview-overlay', { timeout: 5000 })
    assert.equal(await page.$eval('.preview-page-btn__title', (el) => el.textContent), 'A 页')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.preview-overlay', { hidden: true, timeout: 5000 })

    // 2) 自动排布：节点位置落盘、不重叠、适应视图内可见。
    await page.click('.topbar__btn[aria-label="自动排布页面"]')
    const deadline = Date.now() + 8000
    while (Date.now() < deadline && JSON.stringify(positions()) === JSON.stringify(before)) await sleep(100)
    await sleep(1200)
    const after = positions()
    assert.notDeepEqual(after, before, '自动排布后节点位置应变化')
    const project = JSON.parse(readFileSync(projectFile, 'utf8'))
    for (let i = 0; i < project.nodes.length; i++) {
      for (let j = i + 1; j < project.nodes.length; j++) {
        assert.equal(overlaps(project.nodes[i], project.nodes[j]), false, '自动排布后节点不得重叠')
      }
    }
    const boxes = await page.$$eval('.page-node', (els) => els.map((el) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    }))
    for (const box of boxes) {
      assert.ok(box.left >= -1 && box.top >= -1 && box.right <= 1601 && box.bottom <= 1001, `排布后节点应在视口内：${JSON.stringify(box)}`)
    }

    // 3) 刷新后位置保持（已落盘，不是只改前端）。
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.page-node__header', { timeout: 15000 })
    await sleep(700)
    assert.deepEqual(positions(), after, '刷新后应恢复排布后的坐标')

    // 4) 单页预览按钮：从选中的 B 页打开。
    await page.evaluate(() => {
      const node = Array.from(document.querySelectorAll('.page-node')).find((el) => el.querySelector('.page-node__title')?.textContent === 'B 页')
      const header = node.querySelector('.page-node__header')
      const r = header.getBoundingClientRect()
      header.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
    })
    await page.waitForSelector('.node-toolbar', { timeout: 5000 })
    assert.deepEqual(await page.$$eval('.node-toolbar__btn', (els) => els.map((el) => el.getAttribute('aria-label'))), ['预览此页', '重命名', '复制', '删除'])
    await page.click('.node-toolbar__btn[aria-label="预览此页"]')
    await page.waitForSelector('.preview-overlay', { timeout: 5000 })
    assert.equal(await page.$eval('.preview-page-btn__title', (el) => el.textContent), 'B 页')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.preview-overlay', { hidden: true, timeout: 5000 })

    // 5) 总预览在已选中 B 页时从 B 页开始，且页面下拉列出全部页面。
    await page.click('.topbar__btn[aria-label="预览全部页面"]')
    await page.waitForSelector('.preview-overlay', { timeout: 5000 })
    assert.equal(await page.$eval('.preview-page-btn__title', (el) => el.textContent), 'B 页')
    await page.click('.preview-page-btn')
    await page.waitForSelector('.preview-pages', { timeout: 3000 })
    assert.equal(await page.$$eval('.preview-pages__item', (els) => els.length), 3, '总预览应列出全部页面')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.preview-overlay', { hidden: true, timeout: 5000 })

    assert.deepEqual(errors, [], '不应出现未捕获异常')
    console.log('OK 画布工具条 e2e：自动排布/持久化/单页预览/总预览，全部通过')
  } finally {
    if (browser) await browser.close().catch(() => {})
    await api.dispose().catch(() => {})
    rmSync(cwd, { recursive: true, force: true })
  }
})

test('空画布：自动排布与预览按钮禁用', { skip: !browserPath && '未找到浏览器' }, async () => {
  const { tools, api } = await loadBundle(pathToFileURL(join(root, 'dist', 'index.mjs')).href)
  const puppeteer = (await import('puppeteer-core')).default
  const cwd = mkdtempSync(join(tmpdir(), 'dshc-controls-empty-'))
  let browser
  try {
    const opened = await tools.dsh_canvas_open.execute({ input: { port: 0 }, cwd })
    const url = opened.content.match(/http:\/\/127\.0\.0\.1:\d+\/w\/[0-9a-f]{32}\/\?ws=[0-9a-f]{32}#[0-9a-f]{64}/)[0]
    browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] })
    const page = await browser.newPage()
    await page.setViewport({ width: 1400, height: 900 })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForSelector('.topbar__tools .topbar__btn', { timeout: 15000 })
    assert.equal(await page.$eval('.topbar__btn[aria-label="自动排布页面"]', (el) => el.hasAttribute('disabled')), true)
    assert.equal(await page.$eval('.topbar__btn[aria-label="预览全部页面"]', (el) => el.hasAttribute('disabled')), true)
    console.log('OK 空画布：自动排布与预览按钮禁用')
  } finally {
    if (browser) await browser.close().catch(() => {})
    await api.dispose().catch(() => {})
    rmSync(cwd, { recursive: true, force: true })
  }
})
