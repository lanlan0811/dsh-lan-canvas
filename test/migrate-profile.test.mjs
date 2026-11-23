/**
 * Profile 迁移脚本：旧 `dsh-canvas` key → `dsh-lan-canvas`。
 * 覆盖依赖 key、bundle 列表、备份与幂等；不跑 pnpm（--no-install）。
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const script = join(root, 'scripts', 'migrate-profile.mjs')

function run(profile) {
  return execFileSync(process.execPath, [script, '--profile', profile, '--no-install'], { encoding: 'utf8' })
}

test('迁移 profile：依赖 key 与 bundles 从 dsh-canvas 改为 dsh-lan-canvas，并备份', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-canvas-migrate-'))
  try {
    const manifest = {
      name: 'profile',
      dependencies: { 'dsh-canvas': 'link:D:/old' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'dsh-canvas'] } },
    }
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest, null, 2))
    run(dir)
    const next = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    assert.equal(next.dependencies['dsh-canvas'], undefined)
    assert.equal(next.dependencies['dsh-lan-canvas'], `link:${root}`.replaceAll('\\', '/'))
    assert.deepEqual(next.dsh.profile.bundles, ['@deepseek-ai/dsh-base', 'dsh-lan-canvas'])
    assert.ok(readdirSync(dir).some((name) => name.startsWith('package.json.bak-migrate-')), '必须留下备份')
    // 幂等：再跑一次不应改写依赖。
    run(dir)
    assert.equal(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).dependencies['dsh-lan-canvas'], `link:${root}`.replaceAll('\\', '/'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('迁移脚本对不存在的 profile 明确失败', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-canvas-migrate-missing-'))
  rmSync(dir, { recursive: true, force: true })
  assert.throws(() => run(dir), /找不到 profile/)
})
