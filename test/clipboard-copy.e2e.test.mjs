/**
 * Issue #6 回归：画布「复制修改请求」在跨源 iframe 中不得静默失效。
 *
 * 真实宿主：DSH 主面板（如 127.0.0.1:4328）用跨源 iframe 承载画布服务
 * （127.0.0.1:<其他端口>）。Chromium 对跨源 iframe 默认不委派
 * `clipboard-write`，`navigator.clipboard.writeText()` 会抛 NotAllowedError；
 * 1.1.6 用空 catch 吞掉异常，表现为按钮点了没反应。
 *
 * 本测试用 127.0.0.2 的父页承载 127.0.0.1 的画布，复现同一条件，并验证：
 *  1) 未委派 allow 时 Permissions Policy 确实拒绝 clipboard-write（复现环境）；
 *  2) 异步剪贴板成功时复制完整请求文本；
 *  3) 异步被拦截时兼容 execCommand 路径仍能复制；
 *  4) 两条路径都失败时展示只读、自动全选的手动复制文本；
 *  5) 同一选中项的 SSE 刷新不会清掉状态；
 *  6) 委派 allow 后浏览器语义上放行 clipboard-write。
 *
 * 普通本机无浏览器可跳过；CI / 正式验收缺少浏览器必须失败。
 */
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { resolveTestBrowser } from './helpers/browser.mjs'
import { loadBundle } from './helpers/dsh.mjs'

const root = resolve(import.meta.dirname, '..')
const browserPath = resolveTestBrowser()
const ENTRY = pathToFileURL(join(root, 'dist', 'index.mjs')).href
const TIMEOUT = 60_000

test('跨源 iframe：复制修改请求的三条路径与 allow 委派', {
  skip: !browserPath && '未找到浏览器',
  timeout: 180_000,
}, async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'dsh-canvas-copy-'))
  const { api, tools } = await loadBundle(ENTRY)
  let parent
  let browser
  try {
    const added = await tools.dsh_canvas_upsert_page.execute({
      input: {
        id: 'page-copy',
        title: '复制测试',
        html: '<!doctype html><html><head><meta charset="utf-8"></head><body><button id="copy-target">复制我</button></body></html>',
      },
      cwd,
    })
    assert.ok(!added.isError, added.content)
    const opened = await tools.dsh_canvas_open.execute({ input: { port: 0 }, cwd })
    const canvasUrl = opened.content.split(String.fromCharCode(10)).find((line) => line.startsWith('http://127.0.0.1:'))?.trim()
    assert.ok(canvasUrl, opened.content)
    const parsed = new URL(canvasUrl)
    const ws = parsed.searchParams.get('ws')
    const secret = parsed.hash.slice(1)
    assert.ok(ws, '画布 URL 必须带 ws')
    assert.match(secret, /^[0-9a-f]{64}$/, '画布 URL 必须带 fragment secret')

    const selection = {
      pageId: 'page-copy',
      kind: 'element',
      payload: {
        xpath: '/html[1]/body[1]/button[1]',
        tagName: 'button',
        textContent: '复制我',
        computedStyles: {
          color: 'rgb(1, 2, 3)',
          'background-color': 'rgb(255, 255, 255)',
          'font-size': '14px',
          padding: '8px',
          'border-radius': '4px',
        },
      },
    }
    const postSelection = async () => {
      const response = await fetch(`${parsed.origin}/api/selection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-DSH-Canvas': '1',
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ ws, ...selection }),
      })
      assert.equal(response.status, 200, `/api/selection 应 200：${await response.text()}`)
    }
    await postSelection()

    // 父页在另一个回环 IP 上，与画布跨源；未加 allow 时等价于 1.1.6 的主面板 iframe。
    const iframeSrc = canvasUrl.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
    parent = http.createServer((req, res) => {
      const allow = new URL(req.url ?? '/', 'http://127.0.0.2').searchParams.get('allow') === '1'
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html><html><head><meta charset="utf-8"><title>copy parent</title></head>
<body style="margin:0"><iframe id="canvas" src="${iframeSrc}"${allow ? ' allow="clipboard-write"' : ''} style="width:1400px;height:900px;border:0"></iframe></body></html>`)
    })
    await new Promise((resolveListen) => parent.listen(0, '127.0.0.2', resolveListen))
    const parentOrigin = `http://127.0.0.2:${parent.address().port}`

    browser = await (await import('puppeteer-core')).default.launch({
      executablePath: browserPath,
      headless: true,
      args: ['--disable-gpu', '--disable-dev-shm-usage'],
    })
    const page = await browser.newPage()
    page.setDefaultTimeout(TIMEOUT)
    await page.setViewport({ width: 1500, height: 1000 })
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    await page.goto(`${parentOrigin}/`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })
    const canvasFrame = await page.waitForFrame((frame) => frame.url().includes('/w/'), { timeout: TIMEOUT })
    await canvasFrame.waitForSelector('.selection-panel', { timeout: TIMEOUT })
    assert.match(await canvasFrame.$eval('.selection-panel__head', (el) => el.textContent), /选中：页面内元素/)

    const featurePolicyAllows = (frame) => frame.evaluate(() => {
      const policy = document.permissionsPolicy ?? document.featurePolicy
      return policy ? policy.allowsFeature('clipboard-write') : null
    })
    assert.equal(await featurePolicyAllows(canvasFrame), false,
      '父页未委派 clipboard-write 时，画布 iframe 必须被 Permissions Policy 拒绝')

    const expectedText = [
      '请修改以下设计：',
      '页面：复制测试（id=page-copy）',
      '元素：<button> xpath=/html[1]/body[1]/button[1]',
      '当前文本：复制我',
      '当前样式：color: rgb(1, 2, 3)；background-color: rgb(255, 255, 255)；font-size: 14px；padding: 8px；border-radius: 4px',
      '',
      '期望的修改：',
    ].join('\n')
    const label = () => canvasFrame.$eval('.selection-panel__head .btn', (el) => el.textContent.trim())
    const clickCopy = async () => {
      await canvasFrame.click('.selection-panel__head .btn')
      await new Promise((resolveWait) => setTimeout(resolveWait, 300))
    }
    const waitLabel = async (expected) => {
      await canvasFrame.waitForFunction(
        (value) => document.querySelector('.selection-panel__head .btn')?.textContent?.trim() === value,
        { timeout: 5000 },
        expected,
      )
    }

    // 1) 异步剪贴板成功：完整请求文本写入，按钮短暂显示「已复制」。
    await canvasFrame.evaluate(() => {
      window.__copiedText = null
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__copiedText = text } },
      })
    })
    await clickCopy()
    await waitLabel('已复制')
    assert.equal(await canvasFrame.evaluate(() => window.__copiedText), expectedText,
      '复制内容应包含页面/元素/文案/关键样式')
    assert.equal(await canvasFrame.$('.selection-panel__copy-fallback'), null, '成功路径不应出现手动复制区')
    await waitLabel('复制修改请求')

    // 2) 异步剪贴板被策略/权限拦截 → execCommand 兼容路径必须接管。
    await canvasFrame.evaluate(() => {
      window.__execText = null
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => { throw new DOMException('denied', 'NotAllowedError') } },
      })
      document.execCommand = (command) => {
        if (command !== 'copy') return false
        const active = document.activeElement
        window.__execText = active && 'value' in active ? active.value : null
        return true
      }
    })
    await clickCopy()
    await waitLabel('已复制')
    assert.equal(await canvasFrame.evaluate(() => window.__execText), expectedText,
      '兼容复制路径必须拿到同一份请求文本')
    assert.equal(await canvasFrame.$('.selection-panel__copy-fallback'), null)
    await waitLabel('复制修改请求')

    // 3) 两条路径都失败 → 展示只读、自动全选的手动复制文本。
    await canvasFrame.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => { throw new DOMException('denied', 'NotAllowedError') } },
      })
      document.execCommand = () => false
    })
    await clickCopy()
    await waitLabel('复制失败')
    const fallback = await canvasFrame.waitForSelector('.selection-panel__copy-fallback', { timeout: 5000 })
    assert.ok(fallback, '自动复制失败时必须出现手动复制区')
    assert.equal(await canvasFrame.$eval('.selection-panel__copy-fallback', (el) => el.getAttribute('role')), 'alert')
    const manual = await canvasFrame.$eval('.selection-panel__copy-text', (el) => ({
      value: el.value,
      readOnly: el.readOnly,
      selectedAll: el.selectionStart === 0 && el.selectionEnd === el.value.length,
    }))
    assert.equal(manual.value, expectedText, '手动复制区应展示完整请求文本')
    assert.equal(manual.readOnly, true, '手动复制区必须只读')
    assert.equal(manual.selectedAll, true, '手动复制区应自动全选，便于 Ctrl+C')
    assert.equal(await canvasFrame.evaluate(() => document.activeElement?.className), 'selection-panel__copy-text',
      '失败后焦点应落到可复制文本')

    // 4) 同一选中项的 SSE 刷新不能清掉失败状态和文本。
    await postSelection()
    await new Promise((resolveWait) => setTimeout(resolveWait, 800))
    assert.ok(await canvasFrame.$('.selection-panel__copy-fallback'), '同一选中项的刷新不应清掉手动复制区')
    assert.equal(await canvasFrame.$eval('.selection-panel__copy-text', (el) => el.value), expectedText)
    assert.equal(await label(), '复制失败')

    // 5) 宿主 iframe 委派 allow 后，浏览器语义上放行 clipboard-write。
    const allowedPage = await browser.newPage()
    await allowedPage.setViewport({ width: 1500, height: 1000 })
    allowedPage.setDefaultTimeout(TIMEOUT)
    await allowedPage.goto(`${parentOrigin}/?allow=1`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })
    const allowedFrame = await allowedPage.waitForFrame((frame) => frame.url().includes('/w/'), { timeout: TIMEOUT })
    await allowedFrame.waitForSelector('.selection-panel', { timeout: TIMEOUT })
    assert.equal(await featurePolicyAllows(allowedFrame), true, '主面板 iframe 必须委派 clipboard-write')
    await allowedPage.close()

    assert.deepEqual(pageErrors, [], '不应出现未捕获异常')
    console.log('OK Issue #6：跨源拦截下异步/兼容/手动复制路径、状态稳定与 allow 委派')
  } finally {
    if (browser) await browser.close().catch(() => {})
    if (parent) parent.close()
    await api.dispose()
    rmSync(cwd, { recursive: true, force: true })
  }
})
