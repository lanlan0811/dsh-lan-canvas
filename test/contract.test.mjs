/**
 * 契约测试：DSH bundle 的激活契约。
 *
 * 断言的是**构建产物** dist/index.mjs（CI 先 build），而非源码：
 *  - 导出 `apply(ctx, config)` 与 `inject`（tools / workingDirectory 为硬依赖）；
 *  - 恰好注册 9 个 `dsh_canvas_*` 工具，参数 schema 原样保留、output 可渲染；
 *  - 注册 `dsh-canvas` 技能与 4 条 owner-only 路由；
 *  - config 非法时激活失败（Plugins 页可见）。
 */
import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadBundle } from './helpers/dsh.mjs'

const root = resolve(import.meta.dirname, '..')
const entry = pathToFileURL(join(root, 'dist', 'index.mjs')).href

const TOOL_NAMES = [
  'dsh_canvas_open',
  'dsh_canvas_upsert_page',
  'dsh_canvas_get_state',
  'dsh_canvas_arrange',
  'dsh_canvas_style',
  'dsh_canvas_check_style',
  'dsh_canvas_design_system',
  'dsh_canvas_audit',
  'dsh_canvas_comments',
]

const ROUTES = [
  '/dsh-canvas/launch',
  '/dsh-canvas/styles',
  '/dsh-canvas/design-mode',
  '/dsh-canvas/design-state',
]

const { def, api, harness } = await loadBundle(entry)

// ---- 导出形状 ----
assert.equal(typeof def.apply, 'function', '入口必须导出 apply(ctx, config)')
assert.ok(Array.isArray(def.inject), '入口必须导出 inject 数组')
assert.ok(def.inject.includes('tools'), 'inject 必须声明 tools')
assert.ok(def.inject.includes('workingDirectory'), 'inject 必须声明 workingDirectory')

// ---- 9 个工具 ----
const activated = api.tools.map((tool) => tool.name).sort()
assert.deepEqual(activated, [...TOOL_NAMES].sort(), `工具集合不一致: ${activated.join(', ')}`)
for (const tool of api.tools) {
  assert.ok(typeof tool.description === 'string' && tool.description.length > 0, `工具缺少 description: ${tool.name}`)
  assert.ok([...tool.description].length <= 400, `工具描述过长: ${tool.name}`)
  assert.equal(tool.inputSchema?.type, 'object', `工具参数必须是 object schema: ${tool.name}`)
  assert.equal(tool.inputSchema?.additionalProperties, false, `工具参数应拒绝额外字段: ${tool.name}`)
  assert.ok(Number.isInteger(tool.timeoutMs) && tool.timeoutMs > 0, `工具必须有正整数 timeoutMs: ${tool.name}`)
}
// 参数 schema 保留枚举/oneOf 等关键字（不做有损转换）
const arrange = api.tools.find((tool) => tool.name === 'dsh_canvas_arrange')
assert.deepEqual(arrange.inputSchema.properties.action.enum, ['remove', 'duplicate', 'link', 'unlink'])

// ---- 技能 ----
const skill = harness.skills.find((item) => item.name === 'dsh-canvas')
assert.ok(skill, '必须注册 dsh-canvas 技能')
assert.ok(skill.description.length > 0, '技能必须有 description')
assert.ok(skill.content.length > 0, '技能必须有正文')
assert.doesNotMatch(skill.content, /^---/m, '技能正文不应包含 frontmatter')
assert.equal(skill.resourceBase?.kind, 'directory', '技能应声明资源目录')

// ---- 路由 ----
assert.deepEqual([...harness.routes.keys()].sort(), [...ROUTES].sort(), '必须注册 4 条路由')

// ---- config 校验 ----
for (const [config, pattern] of [
  [{ port: 80 }, /port/],
  [{ port: 70000 }, /port/],
  [{ openBrowser: 'always' }, /openBrowser/],
  [{ unexpected: true }, /未知的 config 字段/],
]) {
  await assert.rejects(() => loadBundle(entry, { config }), pattern, `config 非法值必须激活失败: ${JSON.stringify(config)}`)
}

// 合法配置可激活
const { api: second } = await loadBundle(entry, { config: { port: 43217, openBrowser: 'never' } })
assert.equal(second.tools.length, 9)
await second.dispose()
await api.dispose()

console.log(`OK 契约: ${activated.length} 个工具 + 技能 + ${ROUTES.length} 条路由`)
