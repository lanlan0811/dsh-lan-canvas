# dsh-lan-canvas v1.1.1

调整输入框「设计」chip 的显示时机：**不再常驻**，只有通过 `/design` 选中设计系统（或「自由探索」）后才出现。

## 变更

- `ComposerChip` 在未进入设计模式时直接返回 `null`，不占输入框左侧空间；
  设计模式入口统一为 `/design` 命令（输入框命令菜单）。
- 选中风格后 chip 显示「设计 · 风格名」；点开可切换风格或退出设计模式。
- 刷新页面/重进会话时仍会向 Host 同步设计状态：Host 侧设计模式仍开启时 chip 自动恢复显示。
- 未注册 `commandUi` 时不再提示「chip 仍可用」，避免误导；可改用 `dsh_canvas_style` 工具锁定风格。
- 版本号 `1.1.1`；npm 包 `dsh-lan-canvas` 同步发布。

## 验收

- `test/client.bundle.test.mjs` 新增 server-render 回归：
  - 未进入设计模式时 `renderToStaticMarkup` 为空字符串；
  - 通过 `/design` 选中风格后，chip 出现并包含设计状态文案。
- `npm run build` 后 client 产物包含新的条件渲染；`npm run check:bundle`、`npm run check:pack` 通过
  （发行包仍不含 `.map`）。
- 全量 `npm run verify`、CI、Release workflow 全绿；npm `dsh-lan-canvas@1.1.1` 可安装。
