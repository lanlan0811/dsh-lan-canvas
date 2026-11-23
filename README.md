# dsh-canvas

无限画布设计工作台，作为 **DeepSeek Harness（DSH）bundle** 分发。

把前端原型写入一块可平移缩放的画布，锁定项目级设计风格，在 DSH 主面板里查看与迭代；
支持 `/design` 设计模式、元素批注、设计审计、PNG/ZIP 导出与生产代码生成。

- Host 半：9 个 `dsh_canvas_*` 工具、`dsh-canvas` 技能、4 条 owner-only 路由、设计模式状态；
- Client 半：左侧栏「画布」入口、主面板画布（工具条 + iframe + 悬浮球）、输入框「设计」chip 与 `/design` 命令；
- 画布 SPA：保留在独立端口的本地服务里，独立 CSP 与 puppeteer 导出链路。

## 安装

在 DSH 里安装（三选一）：

- **推荐：按仓库 URL 安装**。**Plugins** > **Add plugin** 里填
  `https://github.com/lanlan0811/dsh-lan-canvas`；或让代理执行
  `plugin_manager` 的 `install_bundle`，目标为同一个 URL。
- 下载 Release 里的 `dsh-canvas-<版本>.tgz`，用该文件路径或它的 URL 安装。
- **Plugins** > **Add plugin** 选择本仓库的绝对目录（开发时常用）。

> **不要只填 `dsh-canvas`。** npm 上存在一个同名的占位包 `dsh-canvas@0.0.1`
> （由他人保留，只有 package.json/README，没有 `cordis.patch.yml`）。按裸包名安装会装到它，
> 报 `failed to read overlay ... node_modules\dsh-canvas\cordis.patch.yml: ENOENT`。
> 一旦装错：先在 Plugins 页移除该插件，再用上面的仓库 URL / tarball 重装。

安装后在 **Plugins** 页面确认：

- 插件标题「画布」/「Canvas」与图标显示正常；
- 详情页展示 `docs/DETAIL.md` 的内容；
- 进入新会话，确认 9 个 `dsh_canvas_*` 工具与 `dsh-canvas` 技能出现。

激活失败时先看 DSH 日志与本仓库的 `npm run check:bundle`、`npm run check:pack`；
更完整的排查步骤见 [docs/INSTALL.md](docs/INSTALL.md)。

## 配置

`cordis.patch.yml` 插入一行 `dsh-canvas`：

```yaml
- insert:
    - id: dsh-canvas
      name: dsh-canvas
      config:
        port: 43117
        openBrowser: never
```

| 字段 | 含义 | 取值 |
|---|---|---|
| `port` | 画布服务优先端口 | 1024–65535，默认 43117；占用时自动递增/回退随机端口 |
| `openBrowser` | 打开画布时是否拉起系统浏览器 | `never`（默认，主面板 iframe）或 `system` |

非法配置会让插件激活失败并在 Plugins 页显示原因。

## 设计模式

1. 输入 `/design` 回车（或点输入框左侧「设计」chip），选「自由探索」或一套风格；
2. 选中后 chip 显示「设计 · 风格名」，风格锁定到工作区 `.dsh-canvas/project.json`；
3. 发送需求后画布面板自动打开；
4. 画布左下角悬浮球显示代理运行态/待处理，点击回到对话。

关闭：chip 菜单里的「退出设计模式」，或画布工具条的「退出设计模式」。

## 工具

`dsh_canvas_open`、`dsh_canvas_upsert_page`、`dsh_canvas_get_state`、`dsh_canvas_arrange`、
`dsh_canvas_style`、`dsh_canvas_check_style`、`dsh_canvas_design_system`、`dsh_canvas_audit`、
`dsh_canvas_comments`。参数与用法见 `docs/DETAIL.md` 与 `skills/SKILL.md`。

## 数据与安全

- 只读写工作区的 `.dsh-canvas/`；不读旧版 Tianshu 数据目录。
- 画布服务只绑定 `127.0.0.1`；画布 URL 的凭证只经 fragment 交付，页面用
  `Authorization: Bearer` 访问 API（同源时也写 HttpOnly cookie），页面 iframe 的
  GET `/page/*` 用 `secret` 查询参数；不依赖第三方 cookie。
- `/dsh-canvas/*` 路由经 `ctx.connection` 的 Host/Origin 检查与浏览器认证，全部 owner-only。
- 文件读写经 `src/paths.ts` 边界校验（越界、符号链接、目录联接一律拒绝）。
- 工具错误经 `reportError` 脱敏；运行期不依赖任何 `@deepseek-ai/*` 包。

## 开发

```bash
npm ci
npm run typecheck   # Host + Client + Web 类型检查
npm run build       # dist/index.mjs、dist/client.js、dist/web、dist/design
npm run notices     # 重新生成 THIRD-PARTY-NOTICES.md
npm test            # 单元 + 浏览器 E2E（需要 Chrome/Edge）
npm run verify      # typecheck + build + notices + test
npm run check:bundle
```

浏览器 E2E 用 `DSH_CANVAS_BROWSER` 指定 Chrome/Edge 路径；CI 下设置
`DSH_CANVAS_REQUIRE_BROWSER=1` 时缺少浏览器会直接失败（不允许跳过）。

`dist/` 与 `THIRD-PARTY-NOTICES.md` **入库**：DSH 安装 bundle 不执行构建脚本，
CI 用 `git status --porcelain -- dist THIRD-PARTY-NOTICES.md` 必须为空来防止过期产物。

## 发布

1. 更新 `package.json` 版本；
2. 写 `release/release-<版本>.md`（不能为空）；
3. 确保 `main` 的 CI 全绿；
4. 打 `v<版本>` 标签推送，`release.yml` 会复核版本、发布说明与同 SHA 的 main CI，然后创建 GitHub Release。

发布门禁仓库名为 `lanlan0811/dsh-lan-canvas`。

## 许可

Apache-2.0（见 `LICENSE`）。第三方组件许可见 `THIRD-PARTY-NOTICES.md`。
