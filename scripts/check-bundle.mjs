/**
 * bundle 发行前自检（替代旧的 TPI check-plugin）。
 *
 * 校验项都来自 DSH bundle 契约与本仓库的发布门禁：
 *  - package.json：name/version/exports/dsh.bundle.patch/dsh.client；
 *  - cordis.patch.yml：可解析（本仓库的最小 YAML 子集）、插入行 id/name 与包名一致、
 *    config 只含 port/openBrowser 且值合法；
 *  - locale/{zh,en}.json：meta.title / meta.description / meta.detail（文件必须存在）；
 *  - icon.svg：合法 SVG、≤256 KiB、不含 emoji；
 *  - skills/SKILL.md：frontmatter 只有 name/description/whenToUse，name 为 dsh-canvas；
 *  - 产物：dist/index.mjs、dist/client.js 存在；client 含 __ModuleLoader__ 工厂；
 *  - 假 ctx 握手：apply 恰好注册 9 个 dsh_canvas_* 工具 + 技能 + 4 条路由；
 *  - 零运行期依赖：dist/index.mjs 不残留 @deepseek-ai/* import；
 *  - `node --check dist/client.js` 语法通过。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadBundle } from '../test/helpers/dsh.mjs'

const root = resolve(import.meta.dirname, '..')
const PACKAGE_NAME = 'dsh-lan-canvas'
const errors = []
const fail = (message) => errors.push(message)

const TOOL_NAMES = [
  'dsh_canvas_open', 'dsh_canvas_upsert_page', 'dsh_canvas_get_state', 'dsh_canvas_arrange',
  'dsh_canvas_style', 'dsh_canvas_check_style', 'dsh_canvas_design_system', 'dsh_canvas_audit',
  'dsh_canvas_comments',
]
const ROUTES = ['/dsh-canvas/launch', '/dsh-canvas/styles', '/dsh-canvas/design-mode', '/dsh-canvas/design-state']

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F000}-\u{1F0FF}]/u

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`无法读取 JSON：${path}（${error instanceof Error ? error.message : String(error)}）`)
    return undefined
  }
}

// ---- 1. package.json ----
const pkgPath = join(root, 'package.json')
const pkg = readJson(pkgPath)
if (pkg) {
  if (pkg.name !== PACKAGE_NAME) fail(`package.json name 必须是 ${PACKAGE_NAME}（当前 ${String(pkg.name)}）`)
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(String(pkg.version ?? ''))) {
    fail(`package.json version 必须是稳定 SemVer（当前 ${String(pkg.version)}）`)
  }
  for (const [key, value] of Object.entries({
    '.': './dist/index.mjs',
    './client': './dist/client.js',
    './icon': './icon.svg',
    './locale/*.json': './locale/*.json',
  })) {
    if (pkg.exports?.[key] !== value) fail(`package.json exports["${key}"] 必须是 ${value}`)
  }
  if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') fail('package.json dsh.bundle.patch 必须是 ./cordis.patch.yml')
  if (pkg.dsh?.client?.platform !== 'web') fail('package.json dsh.client.platform 必须是 web')
  for (const required of ['dist', 'cordis.patch.yml', 'locale', 'icon.svg', 'docs', 'skills']) {
    if (!(pkg.files ?? []).includes(required)) fail(`package.json files 必须包含 ${required}`)
  }
}

// ---- 2. cordis.patch.yml（最小子集解析）----
const patchPath = join(root, 'cordis.patch.yml')
if (!existsSync(patchPath)) {
  fail('缺少 cordis.patch.yml')
} else {
  const text = readFileSync(patchPath, 'utf8').replace(/\r\n/g, '\n')
  if (!/^- insert:\s*$/m.test(text)) fail('cordis.patch.yml 必须包含顶层 "- insert:" 列表')
  const id = /^\s+- id:\s*(\S+)\s*$/m.exec(text)?.[1]
  // scoped 包名以 @ 开头，YAML 里必须加引号；比较前去掉引号。
  const nameMatch = /^\s+name:\s*(?:"([^"]+)"|'([^']+)'|(\S+))\s*$/m.exec(text)
  const name = nameMatch?.[1] ?? nameMatch?.[2] ?? nameMatch?.[3]
  if (!id) fail('cordis.patch.yml 插入行缺少 id')
  if (!name) fail('cordis.patch.yml 插入行缺少 name')
  if (id && id !== 'dsh-canvas') fail(`cordis.patch.yml 插入行 id 必须是 dsh-canvas（当前 ${id}）`)
  if (name && name !== pkg?.name) fail(`cordis.patch.yml name 必须与包名一致（${name} ≠ ${String(pkg?.name)}）`)
  const port = /^\s+port:\s*(\d+)\s*$/m.exec(text)?.[1]
  const openBrowser = /^\s+openBrowser:\s*(\S+)\s*$/m.exec(text)?.[1]
  if (port !== undefined && (Number(port) < 1024 || Number(port) > 65535)) fail(`cordis.patch.yml port 越界：${port}`)
  if (openBrowser !== undefined && !['never', 'system'].includes(openBrowser)) fail(`cordis.patch.yml openBrowser 非法：${openBrowser}`)
}

// ---- 3. locale + docs ----
for (const locale of ['zh', 'en']) {
  const path = join(root, 'locale', `${locale}.json`)
  const dict = readJson(path)
  if (!dict) continue
  if (typeof dict.meta?.title !== 'string' || dict.meta.title.length === 0) fail(`locale/${locale}.json 缺少 meta.title`)
  if (typeof dict.meta?.description !== 'string' || dict.meta.description.length < 20) fail(`locale/${locale}.json meta.description 过短`)
  const detail = dict.meta?.detail
  if (typeof detail !== 'string' || !existsSync(join(root, detail))) fail(`locale/${locale}.json meta.detail 指向的文件不存在：${String(detail)}`)
}
if (existsSync(join(root, 'docs/DETAIL.md')) && statSync(join(root, 'docs/DETAIL.md')).size > 1024 * 1024) {
  fail('docs/DETAIL.md 超过 1 MiB 上限')
}

// ---- 4. icon ----
const iconPath = join(root, 'icon.svg')
if (!existsSync(iconPath)) {
  fail('缺少 icon.svg')
} else {
  const bytes = readFileSync(iconPath)
  if (bytes.length > 256 * 1024) fail(`icon.svg 超过 256 KiB（${bytes.length} 字节）`)
  const text = bytes.toString('utf8')
  if (!/^\s*<svg[\s>]/i.test(text) || !/<\/svg>\s*$/i.test(text)) fail('icon.svg 不是完整的 SVG 文档')
  if (EMOJI.test(text)) fail('icon.svg 不得含 emoji')
}

// ---- 5. SKILL frontmatter ----
const skillPath = join(root, 'skills/SKILL.md')
if (!existsSync(skillPath)) {
  fail('缺少 skills/SKILL.md')
} else {
  const text = readFileSync(skillPath, 'utf8').replace(/\r\n/g, '\n')
  const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? ''
  const keys = [...front.matchAll(/^([A-Za-z][A-Za-z0-9_-]*):/gm)].map((match) => match[1])
  const allowed = new Set(['name', 'description', 'whenToUse'])
  for (const key of keys) if (!allowed.has(key)) fail(`skills/SKILL.md frontmatter 不允许字段 ${key}`)
  if (!/^name:\s*dsh-canvas\s*$/m.test(front)) fail('skills/SKILL.md 必须声明 name: dsh-canvas')
  if (!/^description:\s*\S/m.test(front)) fail('skills/SKILL.md 缺少 description')
  if (!/^whenToUse:\s*\S/m.test(front)) fail('skills/SKILL.md 缺少 whenToUse')
  if (EMOJI.test(front)) fail('skills/SKILL.md frontmatter 不得含 emoji')
}

// ---- 6. 产物 ----
for (const file of ['dist/index.mjs', 'dist/client.js', 'dist/web/index.html', 'dist/design/index.json']) {
  if (!existsSync(join(root, file))) fail(`缺少产物 ${file}（先运行 npm run build）`)
}
const clientPath = join(root, 'dist/client.js')
if (existsSync(clientPath)) {
  const text = readFileSync(clientPath, 'utf8')
  if (!text.includes('__ModuleLoader__.load')) fail('dist/client.js 必须通过 window.__ModuleLoader__.load 注册')
  if (!new RegExp(`id:\\s*['"]${String(pkg?.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`).test(text)) {
    fail(`dist/client.js 的工厂 id 必须等于 npm 包名（${String(pkg?.name)}）；DSH 客户端模块表以包名为 key`)
  }
  try {
    execFileSync(process.execPath, ['--check', clientPath], { stdio: 'pipe' })
  } catch (error) {
    fail(`dist/client.js 语法检查失败：${error instanceof Error ? error.message : String(error)}`)
  }
}
const hostPath = join(root, 'dist/index.mjs')
if (existsSync(hostPath)) {
  const text = readFileSync(hostPath, 'utf8')
  if (/from\s*['"]@deepseek-ai\//.test(text) || /require\(['"]@deepseek-ai\//.test(text)) {
    fail('dist/index.mjs 残留 @deepseek-ai/* 运行期依赖（应零依赖）')
  }
  if (text.includes('__tianshuTPI') || text.includes('defineTianshuPlugin')) fail('dist/index.mjs 残留 TPI 运行时')
}

// ---- 7. 假 ctx 握手 ----
if (existsSync(hostPath) && errors.length === 0) {
  try {
    const { api, harness } = await loadBundle(pathToFileURL(hostPath).href)
    const names = api.tools.map((tool) => tool.name).sort()
    if (names.length !== TOOL_NAMES.length || names.join(',') !== [...TOOL_NAMES].sort().join(',')) {
      fail(`工具握手失败：${names.join(', ')}`)
    }
    if (!harness.skills.some((skill) => skill.name === 'dsh-canvas')) fail('未注册 dsh-canvas 技能')
    const routes = [...harness.routes.keys()].sort()
    if (routes.join(',') !== [...ROUTES].sort().join(',')) fail(`路由握手失败：${routes.join(', ')}`)
    await api.dispose()
    if (globalThis.__dshCanvasDisposed !== undefined) fail('dispose 未清理全局状态')
  } catch (error) {
    fail(`加载入口失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

// ---- 8. 旧运行时残留 ----
for (const file of ['tianshu.plugin.json', 'src/tpi.ts', 'src/index.ts', 'scripts/pack-plugin.mjs', 'scripts/check-plugin.mjs']) {
  if (existsSync(join(root, file))) fail(`仓库不得残留 Tianshu 运行时文件：${file}`)
}

if (errors.length > 0) {
  console.error(`bundle 自检失败（${errors.length} 项）：`)
  for (const message of errors) console.error(`  - ${message}`)
  process.exitCode = 1
} else {
  console.log(`OK bundle 自检：${pkg.name}@${pkg.version} · ${TOOL_NAMES.length} 个工具 + 技能 + ${ROUTES.length} 条路由`)
  console.log('  产物：dist/index.mjs、dist/client.js、dist/web、dist/design')
  console.log('  元数据：locale/{zh,en}.json、icon.svg、docs/DETAIL.md、skills/SKILL.md')
}
