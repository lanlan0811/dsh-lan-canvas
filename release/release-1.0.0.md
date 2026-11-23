# 画布 dsh-canvas v1.0.0

首个 DeepSeek Harness（DSH）正式版。仓库从 Tianshu TPI 插件完整改造成 DSH **Host + Client bundle**，
并新增 `/design` 设计模式流水线。旧版 Tianshu 运行时（`tianshu.plugin.json`、`src/tpi.ts`、TPI 握手）
已全部移除，数据目录改为 `.dsh-canvas/`，不读取也不迁移旧目录。

## 新能力

### Host（9 个 `dsh_canvas_*` 工具 + 技能）

- 工具：`open`、`upsert_page`、`get_state`、`arrange`、`style`、`check_style`、`design_system`、`audit`、`comments`；
  参数名与枚举与旧版一致，`parameters` 沿用原 JSON Schema（保留 `enum`/`oneOf`/`additionalProperties`）。
- `dsh-canvas` 技能：安装后在 DSH 会话中可被模型调用；正文与 `whenToUse` 已按 DSH 流程更新
  （画布内嵌在左侧栏/主面板，先 `dsh_canvas_open` 再提示用户点开画布）。
- Host 路由（全部 owner-only，经 `ctx.connection` 的 Host/Origin 检查与浏览器认证）：
  - `GET /dsh-canvas/launch` → 302 到画布 URL；
  - `GET /dsh-canvas/styles` → 风格列表与当前锁定；
  - `POST /dsh-canvas/design-mode` → 开启/关闭设计模式并锁定项目风格；
  - `GET /dsh-canvas/design-state` → 设计模式状态与「自动开画布」标记。
- config：`port`（默认 43117，1024–65535）、`openBrowser`（`never` / `system`）；非法值激活失败并在 Plugins 页可见。

### Client

- 左侧栏「画布」入口（16/18px `currentColor` SVG，无 emoji）。
- 主面板画布：36px 工具条（标题、刷新、在浏览器打开、退出设计模式）+ 全高 iframe；
  左下角悬浮球显示代理运行中/待处理状态，点击回到对话。
- 输入框「设计」chip：选择「自由探索」或内置/自定义风格（含色板），已开启时显示「设计 · 风格名」，
  菜单支持切换与退出。
- `/design` 客户端命令：popupSelect 选择器，不产生模型消息；选中即锁定风格并切到画布面板。
- 设计模式开启后，用户发送需求 → 客户端轮询（800ms，仅本地回环）到 `openRequested` 后自动打开画布；
  同时 Host 在 `user/message` 后给活代理注入一段短上下文，引导模型按设计模式流程调用画布工具。
- 全部注册由 `ctx.effect` 持有，卸载后不留定时器/监听；文案走 `ctx.locale`，颜色只用 `--dsw-alias-*` 主题 token。

### 包与发布

- `package.json` 声明 `dsh.bundle.patch`、`dsh.client`、`exports` 与 `files`；`cordis.patch.yml` 插入一行 Host 插件。
- 新增 `locale/{zh,en}.json`、`icon.svg`（原创 SVG）、`docs/DETAIL.md`、`README.md`。
- `scripts/check-bundle.mjs` 取代 `check-plugin.mjs`：校验清单/patch/locale/icon/SKILL/产物/假 ctx 握手，
  并用 `node --check` 验证 `dist/client.js`。

## 安全

- 画布服务仍只绑定 `127.0.0.1`，独立端口与严格 CSP；URL 凭证只存在于字符片段与 HttpOnly cookie。
- 新增路由一律 owner-only，不再暴露裸 `/dsh-canvas/*`。
- 文件读写继续经 `src/paths.ts` 的边界校验（越界、符号链接、目录联接一律拒绝）；
  工具错误经 `reportError` 脱敏。
- 运行期零 `@deepseek-ai/*` 依赖，`dist/index.mjs` 不残留 TPI 运行时。

## 破坏性变更

- 仅支持 DSH；不再支持 Tianshu TPI，旧 `tianshu.plugin.json`、`src/tpi.ts`、TPI 握手全部删除。
- 数据目录 `.tianshu-canvas/` → `.dsh-canvas/`，不读旧目录、不做迁移。
- 工具名前缀 `canvas_*` → `dsh_canvas_*`；变更头 `X-Tianshu-Canvas` → `X-DSH-Canvas`。
- 浏览器 E2E 环境变量 `TIANSHU_CANVAS_*` → `DSH_CANVAS_*`。

## 门禁与验收

- `npm run verify`：typecheck（Host + Client + Web）+ build + notices + 245 个单元/集成测试全绿。
- 浏览器 E2E 使用真实 Chrome/Edge，`DSH_CANVAS_REQUIRE_BROWSER=1` 时缺少浏览器直接失败（不允许 skip）。
- `npm run check:bundle`：9 个工具 + 技能 + 4 条路由握手通过，`dist/client.js` 语法通过。
- `dist/` 与 `THIRD-PARTY-NOTICES.md` 入库；CI/Release 用 `git status --porcelain -- dist THIRD-PARTY-NOTICES.md`
  必须为空，修掉旧版「未跟踪 dist 也算通过」的假绿。
- 发布门禁仓库名更新为 `lanlan0811/dsh-lan-canvas`。

## 已知边界

- 主面板画布用 iframe 承载独立 SPA，切换面板会重载 iframe；视口/选中/批注由 `project.json` 恢复。
- 设计模式状态是进程内状态，不写入会话日志；DSH 重启后需重新开启（风格仍锁定在项目文件里）。
- 若宿主阻止 iframe 嵌入，可设 `openBrowser: system` 改用系统浏览器打开。
- 画布内的内部数据标记（`tianshu-ds`、`data-tianshu-*`、`__tianshu_probe__`、`tianshu-design-tokens/1`、
  风格 id `tianshu-*`）按计划保留，避免破坏既有设计系统数据与生成产物。
