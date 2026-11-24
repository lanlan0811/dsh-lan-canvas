/** 真实画布发起变更，注入 HTTP 拒绝；核实错误可见、没有隐式重试或假成功。 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { loadBundle } from './helpers/dsh.mjs'
import { resolveTestBrowser } from './helpers/browser.mjs'

const browserPath = resolveTestBrowser()
const root = resolve(import.meta.dirname, '..')

test('变更拒绝可见且不自动重试：节点、连线、批注与视口', { skip: !browserPath && '未找到浏览器' }, async () => {
  const { api, tools } = await loadBundle(pathToFileURL(join(root, 'dist/index.mjs')).href)
  const cwd = mkdtempSync(join(tmpdir(), 'tsc-shell-errors-'))
  let browser
  try {
    const added = await tools.dsh_canvas_upsert_page.execute({ cwd, input: { id: 'page-errors', title: '原始页面', html: '<html><head></head><body><h1>原始页面</h1></body></html>', device_type: 'mobile' } })
    assert.ok(!added.isError, added.content)
    const second = await tools.dsh_canvas_upsert_page.execute({ cwd, input: { id: 'page-target', title: '目标页面', html: '<h1>目标</h1>', device_type: 'mobile' } })
    assert.ok(!second.isError, second.content)
    const opened = await tools.dsh_canvas_open.execute({ cwd, input: { port: 0 } })
    const url = opened.content.split(String.fromCharCode(10)).find(line => line.startsWith('http://127.0.0.1:'))?.trim()
    assert.ok(url)
    const parsed = new URL(url)
    const ws = parsed.searchParams.get('ws')
    const comment = await fetch(`${parsed.origin}/api/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DSH-Canvas': '1' }, body: JSON.stringify({ ws, op: 'add', pageId: 'page-errors', xpath: '/html[1]/body[1]/h1[1]', tagName: 'h1', note: '错误验收批注' }) })
    assert.equal(comment.status, 200)
    browser = await (await import('puppeteer-core')).default.launch({ executablePath: browserPath, headless: true, args: ['--disable-gpu', '--disable-dev-shm-usage'] })
    const page = await browser.newPage()
    // 全量 CI 里本用例与其他 puppeteer 用例串行共享 CPU，30s 固定等待会偶发超时。
    // 统一放宽默认等待，并让 expectAlert 明确按 100ms 轮询（不靠固定 sleep）。
    page.setDefaultTimeout(60_000)
    const unhandled = []
    page.on('pageerror', error => unhandled.push(error.message))
    await page.setViewport({ width: 1600, height: 1000 })
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.page-node__header')
    await page.click('.react-flow__node[data-id=page-errors] .page-node__header')
    await page.waitForSelector('.node-toolbar')
    await page.waitForSelector('.comment-item')
    const before = readFileSync(join(cwd, '.dsh-canvas/project.json'), 'utf8')
    const requests = []
    const reads = []
    await page.setRequestInterception(true)
    page.on('request', request => {
      const path = new URL(request.url()).pathname
      if (request.method() === 'GET' && path.endsWith('/api/project')) reads.push(path)
      if (request.method() === 'POST' && ['nodes', 'comments', 'viewport', 'edges'].some(name => path.endsWith('/api/' + name))) {
        const payload = JSON.parse(request.postData() || '{}')
        requests.push({ path, ...payload })
        void request.respond({ status: payload.op === 'duplicate' ? 413 : 409, contentType: 'application/json', body: JSON.stringify({ error: `验收拒绝 ${payload.op || 'viewport'} C:/Users/private/workspace/project.json` }) })
      } else void request.continue()
    })
    async function expectAlert(text) {
      await page.waitForFunction(
        expected => document.querySelector('[role=alert]')?.textContent?.includes(expected),
        { polling: 100, timeout: 60_000 },
        text,
      )
      const alert = await page.$eval('[role=alert]', element => element.textContent)
      assert.doesNotMatch(alert, /C:[/]Users|private[/]workspace/)
    }

    await page.click('.node-toolbar__btn[title=重命名]')
    await page.waitForSelector('.node-toolbar__input')
    await page.focus('.node-toolbar__input')
    await page.keyboard.down('Control')
    await page.keyboard.press('KeyA')
    await page.keyboard.up('Control')
    await page.type('.node-toolbar__input', '拒绝改名')
    await page.keyboard.press('Enter')
    await expectAlert('验收拒绝 rename')
    assert.equal(await page.$eval('.page-node__title', element => element.textContent), '原始页面')
    await page.click('.node-toolbar__btn[title=复制]')
    await expectAlert('验收拒绝 duplicate')
    await page.click('.node-toolbar__btn[title=删除]')
    await expectAlert('验收拒绝 remove')
    await page.click('.comment-item__btn[title=标记已解决]')
    await expectAlert('验收拒绝 resolve')
    await page.click('.comment-item__btn[title=删除批注]')
    await expectAlert('验收拒绝 remove')
    await page.click('.app-error__dismiss')
    await page.waitForFunction(() => document.querySelector('[role=alert]') === null, { polling: 100, timeout: 60_000 })

    await page.waitForSelector('.react-flow__node[data-id=page-errors] .page-node__header')
    const header = await page.$('.react-flow__node[data-id=page-errors] .page-node__header')
    const headerBox = await header.boundingBox()
    const positionBefore = await page.$eval('.react-flow__node[data-id=page-errors]', element => element.style.transform)
    await page.mouse.move(headerBox.x + 70, headerBox.y + headerBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(headerBox.x + 90, headerBox.y + headerBox.height / 2 + 12, { steps: 4 })
    await page.mouse.move(headerBox.x + 130, headerBox.y + headerBox.height / 2 + 48, { steps: 8 })
    await page.mouse.up()
    await expectAlert('验收拒绝 move')
    await page.waitForFunction(expected => document.querySelector('.react-flow__node[data-id=page-errors]')?.style.transform === expected, { polling: 100, timeout: 60_000 }, positionBefore)
    await page.click('.app-error__dismiss')

    const source = await (await page.$('.react-flow__node[data-id=page-errors] .react-flow__handle-right')).boundingBox()
    const target = await (await page.$('.react-flow__node[data-id=page-target] .react-flow__handle-left')).boundingBox()
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
    await page.mouse.down()
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 })
    await page.mouse.up()
    await expectAlert('验收拒绝 add')
    assert.equal(await page.$$eval('.react-flow__edge', elements => elements.length), 0)
    await page.click('.app-error__dismiss')

    // 前面的拖拽/连线步骤可能让 React Flow 处于连接或指针捕获状态；重新加载一次，
    // 在干净的画布上验证「滚轮平移被拒绝后恢复服务端视口」，避免测试脆弱性。
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.page-node__header')
    await new Promise((resolve) => setTimeout(resolve, 900))
    const transform = await page.$eval('.react-flow__viewport', element => element.style.transform)
    // 通过页面 iframe 内滚轮触发探针转发（这条路径会显式保存视口）；
    // 空白 pane 上的滚轮只改变本地 transform，不会产生 viewport 写入请求。
    const nodeFrame = page.frames().find((frame) => frame.url().includes('/page/page-errors'))
    assert.ok(nodeFrame, '应找到 page-errors iframe')
    await nodeFrame.waitForFunction(() => window.__tianshu_probe__ === true, { timeout: 10_000 })
    const iframeBox = await (await page.$('.react-flow__node[data-id=page-errors] .page-node__iframe')).boundingBox()
    await page.mouse.move(iframeBox.x + iframeBox.width / 2, iframeBox.y + iframeBox.height / 2)
    await page.mouse.wheel({ deltaY: 80 })
    await expectAlert('验收拒绝 viewport')
    await page.waitForFunction(value => document.querySelector('.react-flow__viewport')?.style.transform !== value, {}, transform)
    // 恢复的是已保存的服务端视口，不能把刚刚被拒绝的本地视口当作成功。
    await page.waitForFunction(() => document.querySelector('.react-flow__viewport')?.style.transform === 'translate(0px, 0px) scale(1)')
    await new Promise(resolve => setTimeout(resolve, 800))
    assert.equal(requests.filter(request => request.op === 'rename').length, 1)
    assert.equal(requests.filter(request => request.op === 'duplicate').length, 1)
    assert.equal(requests.filter(request => request.op === 'move').length, 1)
    assert.equal(requests.filter(request => request.path.endsWith('/edges')).length, 1)
    assert.equal(requests.filter(request => request.path.endsWith('/nodes') && request.op === 'remove').length, 1)
    assert.equal(requests.filter(request => request.op === 'resolve').length, 1)
    assert.equal(requests.filter(request => request.path.endsWith('/comments') && request.op === 'remove').length, 1)
    assert.equal(requests.filter(request => request.path.endsWith('/viewport')).length, 1)
    assert.ok(reads.length >= 5, '每次拒绝后重新读取服务端项目')
    assert.equal(readFileSync(join(cwd, '.dsh-canvas/project.json'), 'utf8'), before)
    assert.deepEqual(unhandled, [], '不得留下未处理的 Promise 拒绝')
  } finally {
    if (browser) await browser.close()
    await api.dispose()
    rmSync(cwd, { recursive: true, force: true })
  }
})
