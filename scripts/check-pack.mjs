/**
 * 发行包内容自检：用 `npm pack --dry-run --json` 读取真实打包清单。
 *
 * 为什么需要：Issue #1 的安装失败是「装到了 npm 上的同名占位包」——它没有
 * `cordis.patch.yml`，DSH 校验时报 ENOENT。仓库侧能守的是：任何一次发布/CI
 * 都必须证明 `npm pack` 的产物真的带上了 DSH bundle 必需的文件；`files` 字段
 * 写错或漏掉 dotfile 时，这里会先失败，而不是等用户安装后才看到 overlay 缺失。
 */
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

/** 缺一个就会让 DSH 安装/激活失败（或详情页缺失）的文件。 */
const REQUIRED = [
  'package.json',
  'cordis.patch.yml',
  'dist/index.mjs',
  'dist/client.js',
  'dist/web/index.html',
  'dist/web/canvas.js',
  'dist/design/index.json',
  'locale/zh.json',
  'locale/en.json',
  'icon.svg',
  'skills/SKILL.md',
  'docs/DETAIL.md',
  'docs/INSTALL.md',
  'README.md',
  'LICENSE',
  'THIRD-PARTY-NOTICES.md',
]

let packed
try {
  // --dry-run：只计算清单，不落盘；--json 输出可解析的数组。
  const output = execSync('npm pack --dry-run --json --ignore-scripts', {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
  })
  packed = JSON.parse(output)
} catch (error) {
  console.error(`check-pack: npm pack 失败：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}

if (Array.isArray(packed) && packed.length > 0) {
  const entry = packed[0]
  const files = new Set((entry.files ?? []).map((file) => String(file.path).replaceAll('\\', '/')))
  const missing = REQUIRED.filter((file) => !files.has(file))
  if (missing.length > 0) {
    console.error(`check-pack: 发行包缺少必需文件（${missing.length} 个）：`)
    for (const file of missing) console.error(`  - ${file}`)
    console.error('  检查 package.json 的 files 字段，或确认 dist/ 已构建并提交。')
    process.exitCode = 1
  } else {
    console.log(`OK check-pack: ${entry.name}@${entry.version} · ${files.size} 个文件（含 cordis.patch.yml 与 dist/）`)
    console.log(`  tarball 体积：${(Number(entry.size ?? 0) / 1024).toFixed(1)} KiB`)
  }
}
