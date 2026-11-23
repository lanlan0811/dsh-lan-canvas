# 画布 dsh-canvas v1.0.2

修复画布内嵌到 DSH 主面板后偶发「project 404」的认证问题，并补上凭证失效时的自愈。

## 修复

- **不再依赖 SameSite cookie 访问画布 API**：画布被 iframe 承载时，若 DSH 页面与
  画布不同站（如经 `localhost`/远端地址打开）或浏览器丢弃第三方 cookie，
  `/api/project` 会返回 404。现在 fragment 里的 secret 写入 `sessionStorage` 后
  作为 `Authorization: Bearer` 随每个 API 请求发送；cookie 仅作同源兼容。
- **页面 iframe 同样可用**：`/page/:id` 文档导航无法带请求头，改为在页面 URL 上
  携带 `secret` 查询参数（仅 GET `/page/*` 接受），响应加 `Referrer-Policy: no-referrer`。
- **SSE 改为 fetch 流**：`EventSource` 不能设置 Authorization 头；改用带 Bearer 的
  fetch 流并保留断线重连，跨站 iframe 里画布仍能自动刷新。
- **导出下载改为 Bearer + blob**：下载链接无法带请求头，先 fetch 认证再触发下载。
- **凭证失效自愈**：旧 token 失效时，画布文档壳不再 404，页面会通过
  `postMessage({type:'dsh-canvas:relaunch'})` 请主面板重新走 `/dsh-canvas/launch`
  换新凭证（限速、每次加载最多 3 次）。
- 刷新文档时 fragment 已移除，改从 `sessionStorage` 恢复凭证。
- 画布外壳与静态资源加 `Cache-Control: no-store`：升级 bundle 后不会继续运行浏览器缓存的旧前端。

## 验收

- 新增跨站 iframe 回归测试：`localhost` 父页面 + `127.0.0.1` 画布 iframe，
  验证 Bearer 取项目、page secret 取页面、fragment-less 刷新、失效 token 触发 relaunch。
- 全量 `npm run verify`（含浏览器 E2E）、`npm run verify:prototypes`、`npm run check:bundle` 全绿。
- CI main 全绿后发布本版本。

## 升级提示

- 已安装的本地目录安装（`install_bundle` 链接目录）刷新 DSH 页面即可加载新的画布前端；
  要让 Host 侧 `/page/*` 的 `secret` 校验生效，需**重启 DSH**。
