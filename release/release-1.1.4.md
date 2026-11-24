# dsh-lan-canvas v1.1.4

修复画布 iframe 空白与 `/design` **HTTP 404**：Host 的 `/dsh-canvas/*` 路由在 `webServer` 就绪前被静默跳过。

## 根因

1.1.3 已修复客户端 bundle 工厂 id（槽位恢复），但 Host 侧路由仍有注册时机 bug：

```ts
// routes.ts
const webServer = ctx.get('webServer')
if (!webServer) {
  ctx.logger.warn('dsh-canvas: 没有 webServer 服务，画布路由未注册（面板会显示空态）')
  return () => {}
}
```

`src/dsh/index.ts` 的插件 `inject` 只有 `['tools', 'workingDirectory']`，没有等待 `webServer`；
`apply()` 里同步调用 `registerRoutes()`。如果插件在 `webServer` 就绪前激活：

- 4 条路由（launch/styles/design-mode/design-state）全部不注册；
- 画布 iframe 请求 `/dsh-canvas/launch` → 404 → 空白；
- `/design` 请求 `/dsh-canvas/design-state` → 404（截图中的 HTTP 404）；
- 工具/技能不依赖 webServer，仍正常，掩盖了问题。

## 修复

- `src/dsh/index.ts`：把 `registerRoutes()` 包进 `ctx.inject(['webServer'], (scope) => …)`；
  - 工具、技能、设计模式监听仍然立即注册；
  - webServer 晚到时，服务注入后再注册路由；
  - 插件销毁时由 `track` 注销路由。
- 新增 `test/bundle.routes-late-webserver.test.mjs`：模拟 webServer 晚到，断言
  「工具/技能先可用、路由在注入后注册、design-state 返回 200」。
- `test/helpers/dsh.mjs` 支持 `deferWebServer` 与 `provideService`，用于晚注入服务测试。
- `docs/DETAIL.md` 补充路由注册时机。

## 验收

- 新增晚到测试通过；`bundle.routes`、`contract`、客户端槽位测试保持通过；
- 全量测试、CI、Release workflow 全绿；
- 真实 DSH 重新加载 Host 后：
  - `/dsh-canvas/launch` 返回 302，画布 iframe 正常；
  - `/dsh-canvas/design-state` 返回 200，`/design` 选择器正常；
  - 左侧栏「画布」与主面板保持可用（1.1.3 的客户端修复）。

## 升级提示

1.1.4 是 **Host 侧**修复；仅刷新页面不够，需要让 Host 重新加载一次：

- 重启 DSH；或
- 在 **Plugins** 页禁用再启用 `dsh-lan-canvas`（bundle toggle）。

不用再次迁移 profile/数据。
