/**
 * 把旧的 DSH profile 从 `dsh-canvas` 迁移到 `dsh-lan-canvas`。
 *
 * 背景：1.1.0 把 npm 包名从 `dsh-canvas` 改成 `dsh-lan-canvas`，bundle 行名随之改变；
 * 已安装的 profile 仍以 `dsh-canvas` 为依赖 key，会解析不到新的行，表现为
 * 左侧栏「画布」消失、`/design` 命令不出现（Host 行 absent）。
 *
 * 这个脚本只改 profile 的 `package.json`（依赖 key + bundles）并移除旧的
 * `node_modules/dsh-canvas` 链接，不删除仓库目录；最后提示重启 DSH。
 *
 * 用法：
 *   npm run migrate-profile -- --profile "C:\Users\You\.dsh\profiles\desktop"
 *   npm run migrate-profile -- --dry-run
 *   npm run migrate-profile -- --no-install
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, lstatSync, readFileSync, readlinkSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const OLD = 'dsh-canvas'
const NEW = 'dsh-lan-canvas'
const root = resolve(import.meta.dirname, '..')

function arg(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const dryRun = process.argv.includes('--dry-run')
const noInstall = process.argv.includes('--no-install')
const profile = resolve(arg('--profile', process.env.DSH_PROFILE_DIR ?? join(homedir(), '.dsh', 'profiles', 'desktop')))
const manifestPath = join(profile, 'package.json')
const linkPath = join(profile, 'node_modules', OLD)

if (!existsSync(manifestPath)) {
  console.error(`migrate-profile: 找不到 profile：${manifestPath}`)
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const dependencies = manifest.dependencies ?? {}
const bundles = Array.isArray(manifest.dsh?.profile?.bundles) ? manifest.dsh.profile.bundles : []
const changed = []

if (dependencies[OLD] !== undefined) {
  changed.push(`dependencies.${OLD} → ${NEW}`)
  delete dependencies[OLD]
}
const target = `link:${root}`.replaceAll('\\', '/')
if (dependencies[NEW] !== target) {
  changed.push(`dependencies.${NEW} = ${target}`)
}
dependencies[NEW] = target

const nextBundles = bundles.filter((name) => name !== OLD)
if (!nextBundles.includes(NEW)) nextBundles.push(NEW)
if (nextBundles.length !== bundles.length || nextBundles.some((name, index) => name !== bundles[index])) {
  changed.push(`dsh.profile.bundles: ${OLD} → ${NEW}`)
}
manifest.dependencies = dependencies
manifest.dsh = { ...(manifest.dsh ?? {}), profile: { ...(manifest.dsh?.profile ?? {}), bundles: nextBundles } }

if (changed.length === 0) {
  console.log(`migrate-profile: ${profile} 已是 ${NEW}，无需迁移。`)
} else {
  console.log(`migrate-profile: ${profile}`)
  for (const line of changed) console.log(`  - ${line}`)
  if (dryRun) {
    console.log('  --dry-run：未写入任何文件。')
  } else {
    copyFileSync(manifestPath, `${manifestPath}.bak-migrate-${Date.now()}`)
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    console.log('  已备份并更新 package.json')
  }
}

if (!dryRun && existsSync(linkPath)) {
  try {
    const stat = lstatSync(linkPath)
    const targetOfLink = stat.isSymbolicLink() ? readlinkSync(linkPath) : ''
    // 只删旧 key 的链接/目录本身，绝不递归删目标仓库。
    if (stat.isSymbolicLink()) {
      unlinkSync(linkPath)
      console.log(`  已移除旧链接 ${linkPath}${targetOfLink ? ` → ${targetOfLink}` : ''}`)
    } else if (stat.isDirectory()) {
      // 目录形式的旧安装（非链接）：只删这个包目录，不动仓库。
      rmSync(linkPath, { recursive: true, force: true })
      console.log(`  已移除旧目录 ${linkPath}`)
    }
  } catch (error) {
    console.warn(`  旧链接未能移除（可手动删除）：${error instanceof Error ? error.message : String(error)}`)
  }
}

if (!dryRun && !noInstall) {
  try {
    const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
    execFileSync(pnpm, ['install', '--ignore-scripts'], { cwd: profile, stdio: 'inherit' })
  } catch {
    console.warn('  pnpm install 未执行成功，请在该 profile 目录手动执行 pnpm install 后重启 DSH。')
  }
}

console.log('')
console.log('下一步：重启 DSH，让新的 bundle key 生效；左侧栏「画布」和 /design 会恢复。')
console.log(`画布数据仍在工作区 .dsh-canvas/，不需要迁移。`)
