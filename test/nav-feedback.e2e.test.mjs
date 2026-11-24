/**
 * 无效交互反馈 e2e：坏链提示 + 可点击元素高亮、外链提示、脚本 404 自动返回、预览内恢复。
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

const A_HTML =
  '<html><head><style>body{margin:0;padding:24px;font:16px sans-serif}a,button,.card{display:block;margin:10px 0;padding:8px;border:1px solid #999}.card{cursor:pointer}</style></head><body>' +
  '<h1 id="title">A 页</h1>' +
  '<a id="broken" href="missing.html">坏链</a>' +
  '<a id="go" href="page-b.html">去 B 页</a>' +
  '<a id="ext" href="https://example.com">外链</a>' +
  '<button id="script" type="button" onclick="location.href=\'missing.html\'">脚本坏跳转</button>' +
  '<button id="normal" type="button">普通按钮</button>' +
  '<div class="card" id="card">可点击卡片</div>' +
  '</body></html>'

test('无效交互 e2e：提示 / 高亮 / 外链 / 404 自动返回 / 预览恢复', { skip: !browserPath && '未找到浏览器' }, async () => {
  const { tools, api } = await loadBundle(pathToFileURL(join(root, 'dist', 'index.mjs')).href)
  const puppeteer = (await import('puppeteer-core')).default
  const cwd = mkdtempSync(join(tmpdir(), 'dshc-feedback-'))
  let browser
  try {
    const opened = await tools.dsh_canvas_open.execute({ input: { port: 0 }, cwd })
    const url = opened.content.match(/http:\/\/127\.0\.0\.1:\d+\/w\/[0-9a-f]{32}\/\?ws=[0-9a-f]{32}#[0-9a-f]{64}/)[0]
    const b = await tools.dsh_canvas_upsert_page.execute({
      input: { id: 'page-b', title: 'B 页', x: 900, y: 0, width: 640, height: 480, html: '<html><body><h1>B 页</h1></body></html>' },
      cwd,
    })
    assert.ok(!b.isError, b.content)
    const a = await tools.dsh_canvas_upsert_page.execute({
      input: { id: 'page-a', title: 'A 页', x: 0, y: 0, width: 640, height: 620, html: A_HTML },
      cwd,
    })
    assert.ok(!a.isError, a.content)
    const pageHtmlBefore = readFileSync(join(cwd, '.dsh-canvas', 'pages', 'page-a.html'), 'utf8')

    browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] })
    const page = await browser.newPage()
    await page.setViewport({ width: 1400, height: 900 })
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForSelector('.page-node__iframe', { timeout: 15000 })
    await sleep(1200)

    // 1) 页面间跳转派生连线：A→B 渲染为只读虚线，不写 project.json。
    await page.waitForSelector('.react-flow__edge', { timeout: 5000 })
    assert.equal(await page.$$eval('.react-flow__edge-path.nav-edge', (els) => els.length), 1, '应渲染 1 条派生跳转连线')
    assert.equal(JSON.parse(readFileSync(join(cwd, '.dsh-canvas', 'project.json'), 'utf8')).edges.length, 0, '派生连线不得写入 project.json')

    const frameOf = (id, preview = false) => page.frames().find((frame) => frame.url().includes(`/page/${id}`) && (preview ? frame.url().includes('preview=1') : !frame.url().includes('preview=1')))
    let frameA = frameOf('page-a')
    assert.ok(frameA, '未找到 A 页 iframe')
    await frameA.waitForFunction(() => window.__tianshu_probe__ === true, { timeout: 10000 })

    const dispatch = (frame, selector, type = 'click') => frame.evaluate((sel, eventType) => {
      const el = document.querySelector(sel)
      const r = el.getBoundingClientRect()
      const event = new MouseEvent(eventType, { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })
      el.dispatchEvent(event)
      return event.defaultPrevented
    }, selector, type)

    const waitToast = (text, timeout = 8000) => page.waitForFunction((wanted) => document.querySelector('.app-toast')?.textContent?.includes(wanted), { timeout }, text)

    // 2) 悬停可点击元素：iframe 内出现区别于普通 hover 的 clickable 标记。
    await dispatch(frameA, '#normal', 'mousemove')
    await sleep(250)
    assert.ok(await frameA.$$eval('[data-tianshu-clickable]', (els) => els.length).catch(() => 0) >= 1, '悬停按钮应标记为可点击')

    // 3) 坏链：阻止导航、提示、标出可点击元素，2.4s 后清除。
    assert.equal(await dispatch(frameA, '#broken'), true, '坏链必须取消默认导航')
    await waitToast('跳转目标不存在')
    assert.match(frameA.url(), /\/page\/page-a\b/, '坏链点击后 iframe 不得离开原页')
    const highlighted = await frameA.$$eval('[data-tianshu-interactive]', (els) => els.length)
    assert.ok(highlighted >= 4, `应标出多个可点击元素，实际 ${highlighted}`)
    await sleep(2800)
    assert.equal(await frameA.$$eval('[data-tianshu-interactive]', (els) => els.length), 0, '高亮应在 2.4s 后清除')

    // 4) 外链：阻止导航并提示。
    assert.equal(await dispatch(frameA, '#ext'), true, '外链必须取消默认导航')
    await waitToast('外部链接不会在画布内打开')
    assert.match(frameA.url(), /\/page\/page-a\b/, '外链点击后 iframe 不得离开原页')

    // 5) 脚本跳转不存在页：友好 404 通知父画布，自动返回原页面。
    await dispatch(frameA, '#script')
    await waitToast('已返回')
    let restored = null
    const restoreDeadline = Date.now() + 10_000
    while (Date.now() < restoreDeadline) {
      restored = frameOf('page-a')
      if (restored && await restored.evaluate(() => document.body.innerText.includes('A 页')).catch(() => false)) break
      await sleep(150)
    }
    assert.ok(restored, '脚本 404 后应恢复到 A 页 iframe')
    assert.match(restored.url(), /\/page\/page-a\b/, '恢复后的 iframe 应回到 A 页')
    assert.equal(await restored.evaluate(() => document.body.innerText.includes('A 页')), true)
    await restored.waitForFunction(() => window.__tianshu_probe__ === true, { timeout: 10000 })

    // 6) 预览层内同样恢复，且预览层保持打开。
    await page.click('.topbar__btn[aria-label="预览全部页面"]')
    await page.waitForSelector('.preview-overlay', { timeout: 5000 })
    let previewFrame = frameOf('page-a', true)
    assert.ok(previewFrame, '应打开 A 页预览')
    await previewFrame.waitForSelector('#script', { timeout: 10000 })
    await previewFrame.evaluate(() => {
      const el = document.querySelector('#script')
      const r = el.getBoundingClientRect()
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
    })
    await page.waitForFunction(() => document.querySelector('.preview-toast')?.textContent?.includes('已返回'), { timeout: 10_000 })
    const previewDeadline = Date.now() + 10_000
    let previewRestored = null
    while (Date.now() < previewDeadline) {
      previewRestored = frameOf('page-a', true)
      if (previewRestored && await previewRestored.evaluate(() => document.body.innerText.includes('A 页')).catch(() => false)) break
      await sleep(150)
    }
    assert.ok(previewRestored, '预览层内脚本 404 后应恢复 A 页')
    assert.match(previewRestored.url(), /preview=1/, '恢复后仍应是预览模式')
    assert.ok(await page.$('.preview-overlay'), '预览层不得被关闭')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.preview-overlay', { hidden: true, timeout: 5000 })

    // 7) 选择/高亮/恢复都不改原型文件；页面无未捕获异常。
    assert.equal(readFileSync(join(cwd, '.dsh-canvas', 'pages', 'page-a.html'), 'utf8'), pageHtmlBefore, '运行期提示不得写回原型')
    assert.deepEqual(pageErrors, [], '不应出现未捕获异常')
    console.log('OK 无效交互 e2e：悬停标记/坏链提示高亮/外链/脚本 404 自动返回/预览恢复，全部通过')
  } finally {
    if (browser) await browser.close().catch(() => {})
    await api.dispose().catch(() => {})
    rmSync(cwd, { recursive: true, force: true })
  }
})
