# 画布（dsh-lan-canvas）

无限画布设计工作台。把前端原型写入一块可平移缩放的画布，锁定项目级设计风格，
在 DSH 主面板里查看与迭代；支持 `/design` 设计模式、元素批注、设计审计、
PNG/ZIP 导出与生产代码生成。

由 **Tianshu-Canvas**（`tianshu-canvas@0.9.5`，天枢 TPI 插件）移植为 DSH bundle。
项目/npm 包名是 `dsh-lan-canvas`（npm 同名）；客户端 bundle 的模块工厂 id 必须等于 npm 包名；面板/槽位 key、
面板 key、`/dsh-canvas/*` 路由、`dsh_canvas_*` 工具与 `dsh-canvas` 技能名是内部稳定标识。

## 安装后你会看到

- 左侧栏多一个「画布」入口，点开是主面板整页画布；
- 新会话里多出 9 个 `dsh_canvas_*` 工具与 `dsh-canvas` 技能；
- 开启设计模式后，输入框左侧出现「设计 · 风格名」chip（默认不显示）；
- `/design` 命令弹出设计风格选择器。

## 设计模式

1. 输入 `/design` 回车（或点输入框左侧「设计」），选择「自由探索」或一套内置/自定义风格。
2. 选中后进入设计模式，chip 显示「设计 · 风格名」。
3. 发送需求后，画布面板自动打开（主面板切到「画布」）。
4. 画布左下角的悬浮球显示代理运行态/待处理请求，点击回到对话继续聊。

风格会锁定到工作区的 `.dsh-canvas/project.json`；「自由探索」表示不锁定（`free`）。
设计模式本身是进程内会话状态，刷新页面或重进会话后由客户端重新同步。

## 工具

| 工具 | 用途 |
|---|---|
| `dsh_canvas_open` | 启动/复用本工作区画布服务，返回画布 URL |
| `dsh_canvas_upsert_page` | 新增或更新页面（HTML / 标题 / 位置 / 尺寸；可选资源内联） |
| `dsh_canvas_get_state` | 读取页面、连线、当前选中项、简报与画布 URL |
| `dsh_canvas_arrange` | 删除/复制页面、连线/取消连线 |
| `dsh_canvas_style` | 列出/查看/锁定/切换风格，取模板、交互骨架，或导出生产代码 |
| `dsh_canvas_check_style` | 只读检查页面是否符合当前风格 |
| `dsh_canvas_design_system` | 自定义设计系统：创建/查看/删除、反抽取、仓库主题导入、品牌包 |
| `dsh_canvas_audit` | 设计契约、可访问性、视觉回归、设计漂移与截图评审 |
| `dsh_canvas_comments` | 读取/处理画布元素批注 |

## 数据与安全

- 项目数据只写工作区的 `.dsh-canvas/`（`project.json`、`pages/*.html`、`library/`、`exports/`、`audit/`）；
  不读旧版 Tianshu 数据目录。
- 画布服务只绑定 `127.0.0.1`，优先端口 43117（占用时自动递增/回退随机端口）；
  画布 URL 的 `#secret` 只经 fragment 交付，页面保存到 `sessionStorage` 并用
  `Authorization: Bearer` 访问 API；页面 iframe 的 GET `/page/*` 支持 `secret`
  查询参数（仅此路径），响应带 `Referrer-Policy: no-referrer`。
- DSH 侧 4 条路由（`/dsh-canvas/*`）通过 `ctx.inject(['webServer'])` 等服务就绪后注册，全部经 `ctx.connection` 的 Host/Origin 检查与浏览器认证；工具/技能不依赖 webServer，先注册。
- 所有文件读写经 `src/paths.ts` 的边界校验：工作区内路径拒绝越界、符号链接与目录联接。
- 工具错误经 `reportError` 脱敏，不泄露绝对路径与 URL 凭证；插件运行期不依赖任何 `@deepseek-ai/*` 包。

## 已知边界

- 主面板画布用 iframe 承载独立 SPA，切换面板会重载 iframe；视口/选中/批注由 `project.json` 恢复。
- 设计模式状态是进程内状态，不写入会话日志；DSH 重启后需重新开启（风格仍锁定在项目文件里）。
- 若宿主阻止 iframe 嵌入，可在插件配置里设 `openBrowser: system`，改用系统浏览器打开。
