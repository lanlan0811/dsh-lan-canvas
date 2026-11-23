/**
 * 构建 Client 半：client/src/index.tsx -> dist/client.js
 *
 * DSH 的浏览器侧模块表要求产物是
 * `window.__ModuleLoader__.load({ id, factory(require) { … return plugin } })`
 * 形式的惰性工厂；React 由宿主模块表提供（external: ['react']），
 * 不打包第二份 React，也不 require 任何宿主 Client 包。
 */
import { build } from 'esbuild'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outfile = resolve(root, 'dist/client.js')

/** 惰性工厂包装：banner 定义模块表，footer 返回插件对象。 */
const banner = `window.__ModuleLoader__.load({id:'dsh-canvas',factory(require){var module={exports:{}};var exports=module.exports;`
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
