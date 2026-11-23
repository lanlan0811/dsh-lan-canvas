# dsh-lan-canvas · DeepSeek Harness 无限画布设计工作台

**项目名：dsh-lan-canvas** ｜ **npm 包名：`dsh-lan-canvas`**

这是一个把「无限画布 + 前端原型 + 设计风格 + 审计」搬进 DeepSeek Harness 主面板的 bundle：代理用 9 个 `dsh_canvas_*` 工具往画布上写页面，人在画布里浏览、批注、预览、导出，用 `/design` 锁定一套设计风格后再让代理生成。

> 命名说明：项目/仓库/npm 包名统一使用 **dsh-lan-canvas**（npm 为 `dsh-lan-canvas`）。客户端 bundle id、面板 key、`/dsh-canvas/*` 路由、`dsh_canvas_*` 工具名、`dsh-canvas` 技能名与 `.dsh-canvas/` 数据目录是**内部稳定标识**，沿用旧名以便升级；它们不是项目名，也不是 npm 包名。

## 与 Tianshu-Canvas 的关系

**dsh-lan-canvas 由 Tianshu-Canvas 移植而来。**

- 原项目：`tianshu-canvas@0.9.5`，天枢 TPI 插件；无限画布、设计风格、原型、审计、导出等设计工作台能力在那边已经成型。
- 本项目：保留同一套设计域（画布/页面/风格/设计系统/审计/导出），把**宿主从 Tianshu TPI 换成 DeepSeek Harness（DSH）bundle**。
- 移植后的形态：
  - Host 侧 9 个 `dsh_canvas_*` 工具 + 一个 `dsh-canvas` 技能；
  - Client 侧主面板 iframe 画布、左侧栏「画布」入口、设计模式状态 chip、画布悬浮球；
  - `/design` 设计模式流水线（选风格 → 锁定工作区 → 发需求 → 自动打开画布）；
  - 删除 TPI 运行时与旧入口，不再依赖 Tianshu 的插件 API。
- **数据不迁移**：只读写当前工作区的 `.dsh-canvas/`，不读取旧版 Tianshu 数据目录。
- 仓库名与 npm 包名用 `dsh-lan-canvas`，与 npm 上被他人占位的旧名 `dsh-canvas` 区分，避免装错包。

## 功能

- **无限画布**：React Flow 平移/缩放、页面节点、设备尺寸（desktop/tablet/mobile/free）、页面间连线。
- **原型渲染**：每个节点内嵌 `sandbox` iframe 渲染 HTML 原型；支持元素选中、批注图钉、预览覆盖层。
- **9 个 Host 工具**：打开/写入/读取/编排/风格/检查/设计系统/审计/批注，全部经 DSH 工具系统调用。
- **`/design` 设计模式**：输入框 chip 或命令选择风格（内置 + 工作区自定义）；风格锁定后代理生成的内容自动套用 token 与组件样式。
- **设计系统**：内置风格、从 HTML/CSS/URL 反抽取、从 shadcn/AntD 主题导入、导出/导入品牌包。
- **审计**：设计契约、可访问性、视觉回归、设计漂移、多尺寸截图评审。
- **导出与代码生成**：PNG/ZIP 导出，React/CSS/Tailwind/shadcn/AntD 及 iOS/Android/小程序规格导出。
- **主面板与悬浮球**：画布内嵌在 DSH 主面板，不抢输入框；悬浮球显示代理运行态/待处理，一键回对话。

## 环境要求

- DeepSeek Harness（Desktop 或 Web），需要 Host 工具与 Web 客户端能力。
- Node.js `>=24.22.1 <27`（见 `package.json` 的 `engines`）。
- 导出 PNG、审计截图、原型验证需要本机 Chrome/Edge；可用 `DSH_CANVAS_BROWSER` 指定浏览器路径。

## 安装

### 推荐：npm

在 DSH 的 **Plugins** > **Add plugin** 中填：

```text
dsh-lan-canvas
```

或让代理调用 `plugin_manager` 的 `install_bundle`，`target` 为同一包名。安装的是 npm 上的 `dsh-lan-canvas`，不会再撞旧名 `dsh-canvas` 的占位包。

### 仓库 URL（开发/未发布时）

```text
https://github.com/lanlan0811/dsh-lan-canvas
```

DSH 会以 git 依赖安装仓库里的 `package.json`、`cordis.patch.yml` 和已提交的 `dist/`。

### Release tarball

每次发布都会在 GitHub Release 附 `dsh-lan-canvas-<版本>.tgz`，可直接用资产 URL 或本地文件安装。

### 本地目录（开发）

**Plugins** > **Add plugin** 选择本仓库绝对目录，或 `install_bundle` 的目标填目录路径。目录安装是 link，改完代码需重启 DSH 生效。

### 不要安装旧的裸包名

npm 公共仓库里的 `dsh-canvas@0.0.1` 是**他人保留的占位包**（只有 `package.json`/`README.md`，没有 `cordis.patch.yml`）。本项目已迁移到 `dsh-lan-canvas`；如果只填旧名 `dsh-canvas`，DSH 会装到占位包并报：

```text
failed to read overlay ... node_modules\dsh-canvas\cordis.patch.yml: ENOENT
```

装错了先移除，再按上面的 npm 名 / 仓库 URL / tarball 重装；详细步骤见 [docs/INSTALL.md](docs/INSTALL.md)。

### 从旧包名 `dsh-canvas` 升级

1.1.0 把包名改为 `dsh-lan-canvas` 后，bundle 行名也随之变化。已有安装如果仍以
`dsh-canvas` 为依赖 key，DSH 会解析不到新行，表现为**左侧栏「画布」消失、`/design`
不出现**。升级时执行一次迁移，然后重启 DSH：

```bash
npm run migrate-profile -- --profile "C:\Users\<你>\.dsh\profiles\desktop"
```

或重新安装 `dsh-lan-canvas` 并移除旧的 `dsh-canvas`。迁移只改 profile 的依赖 key /
bundle 列表，不动工作区 `.dsh-canvas/` 数据。详见 [docs/INSTALL.md](docs/INSTALL.md)。

安装后在 **Plugins** 页面确认：

- 插件标题「画布」/「Canvas」与图标显示正常；
- 详情页展示 [docs/DETAIL.md](docs/DETAIL.md) 的内容；
- 新会话中出现 9 个 `dsh_canvas_*` 工具与 `dsh-canvas` 技能。

## 配置

`cordis.patch.yml` 插入一行；`id` 是内部行 key，`name` 是 npm 包名：

```yaml
- insert:
    - id: dsh-canvas
      name: dsh-lan-canvas
      config:
        port: 43117
        openBrowser: never
```

| 字段 | 含义 | 取值 |
|---|---|---|
| `port` | 画布服务优先端口 | 1024–65535，默认 43117；被占用时自动递增/回退随机端口 |
| `openBrowser` | 打开画布时是否拉起系统浏览器 | `never`（默认，主面板 iframe）或 `system` |

非法配置会让插件激活失败并在 Plugins 页显示原因。

## 工具

| 工具 | 作用 |
|---|---|
| `dsh_canvas_open` | 启动/复用画布服务，返回带凭证的 URL（主面板已内嵌，提示用户点左侧栏「画布」） |
| `dsh_canvas_upsert_page` | 新增/更新页面节点与 HTML 原型 |
| `dsh_canvas_get_state` | 读取项目、节点、连线、风格、选中项与画布 URL |
| `dsh_canvas_arrange` | 删除/复制页面节点、添加/取消页面连线 |
| `dsh_canvas_style` | 列出/读取/锁定设计风格；`free` 表示不锁定 |
| `dsh_canvas_check_style` | 只读检查页面是否符合当前风格 |
| `dsh_canvas_design_system` | 设计系统创建/反抽取/导入/导出/删除 |
| `dsh_canvas_audit` | 设计契约、可访问性、视觉基线/回归/漂移、多尺寸截图评审 |
| `dsh_canvas_comments` | 画布批注：列出/解决/重开/删除 |

工具名是 API 稳定标识，不随 npm 包名变化；参数/返回结构以 Host 注册的 schema 为准。所有路径参数受工作区边界约束。

## `/design` 设计模式

1. 输入 `/design` 回车（设计模式开启后，输入框左侧才会出现「设计 · 风格名」chip）；
2. 选「自由探索」或一套风格（内置或工作区自定义）；
3. 风格锁定到 `.dsh-canvas/project.json`，chip 显示「设计 · 风格名」；
4. 发送需求，画布面板自动打开，代理生成的页面自动套用该风格；
5. 画布左下角悬浮球显示代理运行态/待处理，点击回对话；
6. 退出：chip 菜单「退出设计模式」，或画布工具条「退出设计模式」。

## 数据与目录

只读写当前工作区：

```text
.dsh-canvas/
├── project.json        # 节点/连线/视口/风格
├── pages/*.html        # 页面原型
├── selection.json      # 当前选中
├── url.txt             # 最近一次画布地址
├── library/            # 工作区自定义设计系统/品牌包
├── exports/            # PNG/ZIP/代码生成/审计截图产物
└── audit/              # 视觉基线、漂移快照、评审报告
```

不读取旧 Tianshu 数据目录；卸载插件不会删除工作区数据。

## 安全与隐私

- 画布服务只绑定 `127.0.0.1`，优先端口 43117；非本机请求拒绝。
- URL 凭证只经 fragment 交付，页面存入 `sessionStorage`，API 请求用 `Authorization: Bearer`；同源时也写 HttpOnly cookie。
- 页面 iframe 的 `GET /page/*` 支持 `secret` 查询参数（仅此路径），响应带 `Referrer-Policy: no-referrer`；页面在 `sandbox` 中渲染，CSP 限制外链。
- 所有工作区写入经过路径边界检查（拒绝符号链接/目录联接逃逸）。
- 不发送遥测；不访问工作区外文件。

## 开发

```bash
npm ci
npm run typecheck      # Host + Web 类型检查
npm run build          # dist/index.mjs、dist/client.js、dist/web、dist/design
npm test               # 全量测试（含真实浏览器 E2E）
npm run verify         # typecheck + build + notices + test
npm run check:bundle   # 清单/patch/locale/icon/SKILL/9 工具 + 技能 + 4 路由
npm run check:pack     # npm pack 真实发行清单（含 cordis.patch.yml，不得含 .map）
npm run verify:codegen # 代码生成快照
npm run verify:prototypes  # 38 个原型真实浏览器评审
```

要求：CI 全绿；只在 `main` 分支提交；中文提交信息；发布前更新 `release/release-<版本>.md`。发布 workflow 在 GitHub Release 创建后附带 `.tgz`，并执行 `npm publish`（需要仓库 secrets 的 `NPM_TOKEN`；版本已存在则跳过）。

## 目录结构

```text
src/
├── dsh/            # Host bundle：apply、9 工具桥、技能、/dsh-canvas/* 路由
├── server.ts       # 本地画布服务、认证、SSE、静态资源
├── tools.ts        # 领域工具实现
├── project.ts      # 项目/页面/节点/连线/选区/批注
├── design*.ts      # 风格、设计系统、代码生成
├── audit/          # 契约/可访问性/视觉/评审
└── export.ts       # PNG/ZIP 导出
client/src/         # DSH Web 客户端：主面板、侧栏入口、chip、悬浮球
web/src/            # 画布 SPA（React Flow）
skills/SKILL.md     # dsh-canvas 技能
design-systems/     # 内置原型/方向/组件/图标
scripts/            # 构建、校验、发布门禁
test/               # 单元/契约/E2E
```

## 故障排查

- **安装报 `cordis.patch.yml: ENOENT`**：装到了 npm 旧名占位包。移除后改装 `dsh-lan-canvas`（或仓库 URL/tarball），见 [docs/INSTALL.md](docs/INSTALL.md)。
- **画布显示授权错误 / `project 404`**：先刷新画布（工具条刷新或 Ctrl+F5）；仍不行重启 DSH。1.0.2+ 已支持 Bearer 与凭证失效自愈。
- **导出/审计提示找不到浏览器**：设置 `DSH_CANVAS_BROWSER` 指向 Chrome/Edge，或安装浏览器后重试。
- **端口被占用**：服务会自动递增/回退随机端口；也可在 `cordis.patch.yml` 改 `port`。
- **插件激活失败**：看 DSH 日志与 `npm run check:bundle`、`npm run check:pack`。

## 相关文档

- [docs/INSTALL.md](docs/INSTALL.md) — 安装、恢复、自检
- [docs/DETAIL.md](docs/DETAIL.md) — 架构、数据、安全、工具细节
- [skills/SKILL.md](skills/SKILL.md) — 代理使用画布的技能说明
- [release/](release/) — 版本发布说明
- [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) — 第三方组件清单

## 许可

Apache-2.0，见 [LICENSE](LICENSE)。第三方组件许可见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
