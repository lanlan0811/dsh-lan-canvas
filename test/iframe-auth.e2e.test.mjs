/**
 * 跨站 iframe 认证回归：画布内嵌在 DSH 主面板时，如果 DSH 页面不是同站
 * （localhost / 另一个回环 IP / 远端访问），浏览器会丢弃 SameSite cookie。
 * 画布必须靠 fragment secret 的 Bearer + page iframe 的 secret 查询参数继续工作，
 * 并在旧 token 失效时请求父页面重新 launch。
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

const browserPath = resolveTestBrowser()
const root = resolve(import.meta.dirname, '..')
const ENTRY = pathToFileURL(join(root, 'dist', 'index.mjs')).href
const RESPONSE_TIMEOUT = 30_000

test('跨站 iframe：Bearer 取项目、page secret 取页面、失效 token 请求 relaunch', {
  skip: !browserPath && '未找到浏览器',
  timeout: 180_000,
}, async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'dsh-canvas-cross-'))
  const { tools, api } = await loadBundle(ENTRY)
  let parent
  let browser
  try {
    const added = await tools.dsh_canvas_upsert_page.execute({
      input: { id: 'page-cross', title: '跨站', html: '<h1 id="probe">CROSS_SITE_PAGE_OK</h1>' },
      cwd,
    })
    assert.ok(!added.isError, added.content)
    const opened = await tools.dsh_canvas_open.execute({ input: { port: 0 }, cwd })
    const canvasUrl = opened.content.split('\n').find((line) => line.startsWith('http://127.0.0.1:'))?.trim()
    assert.ok(canvasUrl, opened.content)

    // 父页面用另一个回环 IP 打开（站点与画布 127.0.0.1 不同），模拟跨站 iframe。
    parent = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html><meta charset="utf-8">
        <script>window.__messages = []; addEventListener('message', (event) => window.__messages.push(event.data))</script>
        <iframe id="canvas" src="${canvasUrl}" style="width:1400px;height:900px;border:0"></iframe>`)
    })
    await new Promise((resolveListen) => parent.listen(0, '127.0.0.2', resolveListen))
    const parentUrl = `http://127.0.0.2:${parent.address().port}/`

    browser = await (await import('puppeteer-core')).default.launch({
      executablePath: browserPath,
      headless: true,
      args: ['--disable-gpu', '--disable-dev-shm-usage'],
    })
    const page = await browser.newPage()
    page.setDefaultTimeout(RESPONSE_TIMEOUT)

    // 首次加载：等项目与页面 iframe 的响应，而不是固定 sleep。
    const projectInitial = page.waitForResponse(
      (response) => new URL(response.url()).pathname.endsWith('/api/project'),
      { timeout: RESPONSE_TIMEOUT },
    )
    const pageInitial = page.waitForResponse(
      (response) => new URL(response.url()).pathname.includes('/page/'),
      { timeout: RESPONSE_TIMEOUT },
    )
    await page.goto(parentUrl, { waitUntil: 'domcontentloaded' })
    const [projectResponse, pageResponse] = await Promise.all([projectInitial, pageInitial])
    assert.equal(projectResponse.status(), 200, `/api/project 应 200：${projectResponse.url()}`)
    assert.equal(pageResponse.status(), 200, `page iframe 应 200：${pageResponse.url()}`)
    assert.equal(new URL(pageResponse.url()).searchParams.has('secret'), true, 'page iframe 必须带 secret 查询参数')

    const canvasFrame = page.frames().find((frame) => frame.url().includes('/w/'))
    assert.ok(canvasFrame, '画布 iframe 应已加载')
    await canvasFrame.waitForFunction(() => !/project 404|unknown workspace/.test(document.body.innerText), { timeout: RESPONSE_TIMEOUT })
    const pageFrame = page.frames().find((frame) => frame.url().includes('/page/'))
    assert.ok(pageFrame, '页面 iframe 应已加载')
    await pageFrame.waitForFunction(() => document.body.innerText.includes('CROSS_SITE_PAGE_OK'), { timeout: RESPONSE_TIMEOUT })

    // 刷新时 fragment 已移除，靠 sessionStorage 恢复 Bearer。
    const projectReloaded = page.waitForResponse(
      (response) => new URL(response.url()).pathname.endsWith('/api/project'),
      { timeout: RESPONSE_TIMEOUT },
    )
    await page.evaluate((src) => { document.getElementById('canvas').src = src }, canvasUrl.replace(/#.*/, ''))
    assert.equal((await projectReloaded).status(), 200, 'fragment-less 刷新后仍应授权')
    const reloaded = page.frames().find((frame) => frame.url().includes('/w/'))
    assert.ok(reloaded, '刷新后画布 iframe 应仍存在')
    await reloaded.waitForFunction(() => !/project 404|unknown workspace|授权失败/.test(document.body.innerText), { timeout: RESPONSE_TIMEOUT })

    // 失效 token：页面应请求父页面重新 launch（凭证明文不重试）。
    await page.evaluate((src) => { document.getElementById('canvas').src = src }, canvasUrl.replace(/ws=[0-9a-f]{32}/, 'ws=' + '0'.repeat(32)))
    await page.waitForFunction(() => Array.isArray(window.__messages) && window.__messages.some((message) => message?.type === 'dsh-canvas:relaunch'), { timeout: RESPONSE_TIMEOUT })
    console.log('OK 跨站 iframe：Bearer 项目 / page secret / fragment-less 刷新 / 失效 token relaunch')
  } finally {
    if (browser) await browser.close().catch(() => {})
    if (parent) parent.close()
    await api.dispose()
    rmSync(cwd, { recursive: true, force: true })
  }
})
