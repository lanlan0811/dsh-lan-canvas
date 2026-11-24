# dsh-lan-canvas v1.1.7

修复 [Issue #6](https://github.com/lanlan0811/dsh-lan-canvas/issues/6)：画布选中面板的「复制修改请求」在 DSH 主面板里点击无反应。

## 问题与根因

- 现象：1.1.6 / Windows 下选中元素后点击「复制修改请求」，按钮无任何反馈，剪贴板也没有内容。
- 主面板画布是**跨源 iframe**：DSH 页面在 `http://127.0.0.1:4328`，`/dsh-canvas/launch` 302 到画布服务 `http://127.0.0.1:<其他端口>/w/...`。1.1.6 的 `CanvasPanel` 没有给 iframe 委派 `clipboard-write`。
- Chromium 的 `clipboard-write` Permissions Policy 默认白名单是 `self`，因此画布 iframe 内 `navigator.clipboard.writeText()` 会抛：
  `NotAllowedError: The Clipboard API has been blocked because of a permissions policy applied to the current document`。
- 1.1.6 的 `copyRequest()` 用空 `catch {}` 吞掉异常，没有提示、没有替代路径，于是按钮表现为「无效」。
- 基线复现（真实 Edge、跨源父页承载画布）：
  - `document.featurePolicy.allowsFeature('clipboard-write') === false`；
  - 真实点击后按钮仍为「复制修改请求」，没有手动复制区，也没有 pageerror；
  - 同一环境里 `document.execCommand('copy')` 返回 `true`，说明兼容复制路径可用。

## 修复

### 宿主 iframe 委派写入权限

- 主面板 iframe 增加 `allow="clipboard-write"`，只委派写入，不申请 `clipboard-read`。
- 不修改原型页/预览页的 `sandbox="allow-scripts"`：原型仍是 opaque origin，不会因为画布获得剪贴板能力而获得额外权限。

### 复制链路不再单点失败

- 新增 `web/src/clipboard.ts` 的 `copyText(text)`：
  1. 优先 `navigator.clipboard.writeText`；
  2. 被 Permissions Policy、桌面壳或系统权限拒绝时，退化为隐藏 `textarea` + `document.execCommand('copy')`；
  3. 两者都失败返回 `false`，由界面给出可手动复制的文本，不再静默吞错。
- 选中面板新增三态反馈：
  - 成功：按钮显示「已复制」，2 秒后复位；屏幕阅读器通过 `role="status"` 播报。
  - 失败：按钮显示「复制失败」，自动展开只读的完整请求文本并全选，用户按 `Ctrl+C` / `Command+C` 即可复制；提示区带 `role="alert"`。
- 复制/失败状态、批注草稿与折叠状态改为按「逻辑选中项」重置：同一元素的 SSE 刷新不会再清掉刚复制成功的状态或手动复制文本；等待期间切换选中项时，旧复制结果不会覆盖新面板。
- 新增样式均为普通 CSS 与现有设计 token，不使用 emoji 图标；不改变「复制只生成文本、不修改项目数据」的只读语义。

## 接口与数据兼容

- 不改 9 个 `dsh_canvas_*` 工具、4 条 `/dsh-canvas/*` 路由、SSE 事件与 `.dsh-canvas/` 数据格式。
- 不新增运行期依赖、不新增网络请求、不改 CSP；发行包仍不含 `.map`。
- 旧项目、旧页面、旧选中与批注数据直接可用，无需迁移。
- 唯一对外变化是主面板 iframe 的 `allow="clipboard-write"` 与选中面板的新 DOM 状态类名。

## 测试

- 新增 `test/clipboard-copy.e2e.test.mjs`：真实浏览器中由 `127.0.0.2` 父页承载 `127.0.0.1` 画布，覆盖：
  - 未委派 `allow` 时 feature policy 为 false（复现真实拦截环境）；
  - 异步剪贴板成功路径与完整请求文本；
  - 异步被拒后 `execCommand` 兼容路径与同一文本；
  - 两条路径都失败时的手动复制区（只读、全选、`role="alert"`）；
  - 同一选中项 SSE 刷新后状态不丢；
  - 委派 `allow` 后 feature policy 为 true；
  - 全程无 pageerror。
- 更新 `test/client.bundle.test.mjs`：服务端渲染主面板，锁定 iframe 必须带 `allow="clipboard-write"`，且不申请 `clipboard-read`。
- 全量 `npm test`：**316 项全部通过（0 fail / 0 skipped）**，含新增 2 项。
- 本地门禁：`npm run typecheck`、`npm run build`、`npm run notices`、`npm run verify:codegen`、`npm run check:bundle`、`npm run check:pack`、`npm run verify:prototypes` 全部通过。
- 真实浏览器：本机 Edge 144；CI 使用 Ubuntu Chrome/Chromium，浏览器 E2E 不允许跳过。

## 验收

| 场景 | 1.1.6 基线 | 1.1.7 |
|---|---|---|
| 跨源 iframe 未委派 `allow`，点击复制 | 无反馈、剪贴板为空、无 fallback | 异步被拦截时自动走兼容复制，按钮显示「已复制」 |
| 异步与兼容复制都失败 | 无反馈 | 展示只读全文并自动全选，按钮显示「复制失败」 |
| 宿主委派 `allow="clipboard-write"` | feature policy = false | feature policy = true，优先异步 Clipboard API |
| 同一选中项被 SSE 刷新 | 选中对象 identity 变化会清空面板状态 | 复制/失败/批注草稿/折叠状态保留 |
| 请求文本内容 | 页面、元素、xpath、文案、关键样式、「期望的修改：」 | 一致，三条复制路径拿到同一份文本 |

- 防假绿：先把新测试跑在 1.1.6 的 `dist/` 上，两项均按预期失败（无 `allow`、点击无状态变化）；重建后才通过。
- 不把「按钮文字变化」当作唯一证据：兼容路径验证了 `execCommand` 收到的文本，手动路径验证了 textarea 的只读、全选与完整内容。

## 发布

- npm：本机执行 `npm publish --access public --ignore-scripts`，发布 `dsh-lan-canvas@1.1.7`。
- GitHub：推送附注 tag `v1.1.7`，`release.yml` 复核同一 SHA 的 main CI 与 npm 版本后创建 Release，并附 `dsh-lan-canvas-1.1.7.tgz`。
- 发布后核实 npm 版本、tarball 内容（含 `cordis.patch.yml`、`dist/client.js` 的 `allow="clipboard-write"`、`dist/web/canvas.js` 的复制回退逻辑），且无 `.map`。

## 升级提示

1.1.7 同时修改 Host 与 Web 画布：

- 重启 DSH；或在 **Plugins** 页禁用再启用 `dsh-lan-canvas`，然后刷新页面。
- 不需要迁移 profile；`.dsh-canvas/` 项目数据格式不变。
- 已打开的画布页面不会热更新到新 bundle，需要按上述步骤重新加载。

## 已知边界

- `document.execCommand('copy')` 已被浏览器标记为废弃，但当前 Chromium/Electron 仍可用；未来若被移除，界面会自动落到手动复制文本，功能仍有出口。
- 某些宿主会同时拒绝异步剪贴板与 `execCommand`；此时需要用户手动按 `Ctrl+C` / `Command+C`，这是浏览器/桌面壳的安全边界，不用权限弹窗强行绕过。
- 不申请 `clipboard-read`，画布不会读取用户剪贴板。
