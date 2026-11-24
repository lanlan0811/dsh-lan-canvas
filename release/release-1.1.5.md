# dsh-lan-canvas v1.1.5

实现 [Issue #4](https://github.com/lanlan0811/dsh-lan-canvas/issues/4)：设计模式不再只能通过 `/design` 进入——输入框左侧常驻「设计」入口，点开直接选设计系统，**选中即进入设计模式**。

## 变更

- **输入区常驻「设计」入口**：未进入设计模式时不再隐藏 chip，显示调色板图标 +「设计」；点开即展开设计系统菜单（自由探索 + 内置/工作区自定义风格，含色卡）。
- **选中即进入设计模式**：点选风格后直接 `POST /dsh-canvas/design-mode` 并锁定风格，chip 变为「设计 · 风格名」；不抢切画布，仍由发送需求后的 `openRequested` 自动打开画布（沿用 v1.0.1 的行为）。
- **切换与退出**：已进入时菜单提供切换风格与「退出设计模式」；退出后回到「设计」入口态，状态轮询停止。
- **`/design` 命令行为不变**：选项、不切面板、Host 状态与 chip 共用同一套。
- **工作区自定义风格**：打开菜单时带 `cwd` 请求 `/dsh-canvas/styles`，避免多工作区下列错目录。
- **无障碍**：`aria-haspopup` / `aria-expanded` / `aria-controls`；`Escape` 关闭菜单并把焦点还给 chip；请求进行中禁用菜单项，防止重复提交。
- **画布侧退出按钮**：沿用现有主面板工具条实现，本次未改动（Issue 第二点已存在，按确认不重复实现）。
- Host 路由、工具参数 schema、项目数据格式均无变化；无新增依赖、无数据迁移。

## 测试

- 更新 `test/client.bundle.test.mjs`：反转「未进入设计模式不渲染」，覆盖入口常驻、无 `sessionId` 不渲染、`/design` 选中后的激活态与风格名；`data-active` 断言先剥离插件样式表，避免被 CSS 里的同名选择器误判为绿。
- 新增 `test/client.composer-chip.e2e.test.mjs`：真实 Edge/Chrome + 真实 `dist/client.js` + 真实 React，页面内桩接管 fetch 并记录请求，覆盖：
  1. 常驻入口（文案、`aria-*`、无激活态）；
  2. 打开菜单（自由探索/风格/色卡；请求带 `sessionId` 与 `cwd`；仅打开不进入）；
  3. 选 NERV 风进入（POST body 精确断言；`selectPanel` 未被调用；菜单关闭）；
  4. 跨 1200ms（>1 个 800ms 轮询周期）状态不回退；
  5. 退出（`enabled:false`）后回到入口态且轮询停止；
  6. 自由探索分支（`styleId=free`，chip 显示「设计 · 自由探索」）；
  7. 风格加载 500 时菜单显示错误提示，`Escape` 关闭并回焦；
  8. 全程无 `pageerror`、无 `console.error`。
- 全量 `npm test`、`verify:codegen`、`check:bundle`、`check:pack`、`verify:prototypes` 与 CI 全绿。

## 验收

- 本地门禁全绿后提交并推送 `main`；同一 SHA 的 main CI 成功后打 tag `v1.1.5`。
- npm 包 `dsh-lan-canvas@1.1.5` 由本机 `npm publish --access public --ignore-scripts` 发布（发布后再推 tag）。
- `release.yml` 二次复核 CI，校验 npm 上已有该版本，创建 GitHub Release（发布说明即本文件），附可安装资产 `dsh-lan-canvas-1.1.5.tgz`。
- 回归：`/design` 命令、画布主面板、左侧栏「画布」、9 个 `dsh_canvas_*` 工具与 4 条 `/dsh-canvas/*` 路由行为不变。

## 发布流程变更

1.1.5 起 npm 包统一在发布机器上本机发布，`release.yml` 不再执行 `npm publish`，只在创建 Release 前校验该版本已存在于 npm，再上传 tarball 资产。1.1.5 的首次 release run 沿用了旧的 CI 发布步骤并停在 npm 步骤（旧步骤只设了 `NODE_AUTH_TOKEN`、缺少 `.npmrc` 鉴权，必然 ENEEDAUTH）；npm 包已由本机发布，Release 与 tarball 资产完整，后续版本不再走 CI 发布 npm。

## 升级提示

纯客户端改动：升级到 1.1.5 后重启 DSH（或在 **Plugins** 页禁用再启用 `dsh-lan-canvas`）并刷新页面，即可在输入框左侧看到常驻「设计」入口。无需迁移 profile 或项目数据。
