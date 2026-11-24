/**
 * 构建 Client 半：client/src/index.tsx -> dist/client.js
 *
 * DSH 的浏览器侧模块表要求产物是
 * `window.__ModuleLoader__.load({ id, factory(require) { … return plugin } })`
 * 形式的惰性工厂；React 由宿主模块表提供（external: ['react']），
 * 不打包第二份 React，也不 require 任何宿主 Client 包。
 */
import { build } from 'esbuild'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outfile = resolve(root, 'dist/client.js')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
if (typeof pkg.name !== 'string' || pkg.name.trim() === '') {
  throw new Error('build-client: package.json 缺少 name')
}

/**
 * 工厂 id 必须等于 **npm 包名**：DSH 客户端模块表以 `WebBootEntry.id == package name`
 * 作为 key，加载脚本后校验 `__ModuleLoader__.load({ id })` 注册了同名工厂。
 * 1.1.0 改名后这里仍硬编码 `dsh-canvas`，导致客户端三个槽位与 /design 全部不加载。
 */
const banner = `window.__ModuleLoader__.load({id:${JSON.stringify(pkg.name)},factory(require){var module={exports:{}};var exports=module.exports;`
const footer = `return module.exports;}});`

export async function buildClient() {
  await build({
    absWorkingDir: root,
    entryPoints: ['client/src/index.tsx'],
    outfile,
    bundle: true,
    platform: 'browser',
    format: 'cjs',
    target: ['es2020'],
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    external: ['react'],
    minify: true,
    sourcemap: false,
    legalComments: 'none',
    banner: { js: banner },
    footer: { js: footer },
    logLevel: 'info',
  })
  if (!existsSync(outfile)) throw new Error('build-client: 缺少产物 dist/client.js')
  return outfile
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildClient()
  console.log('build-client: 完成 -> dist/client.js')
}
