# 画布 dsh-canvas v1.0.1

修复 v1.0.0 验收中发现的一处交互缺陷，其余能力与 v1.0.0 一致。

## 修复

- **`/design` 选择风格后不再立即切走对话**：v1.0.0 在弹窗里选中风格后会立刻切到画布面板，
  把输入框藏起来，用户必须先点悬浮球回到对话才能发需求，与「选择 → 发送需求 → 自动打开画布」
  的流程冲突。现在选中后只进入设计模式并显示「设计 · 风格名」chip，画布仍由后续的
  `user/message` 触发自动打开（或用户点左侧栏「画布」）。
- 输入框 chip 的选择与退出行为保持不变；`dsh_canvas_*` 工具、技能、路由、数据格式均无变化。

## 验收

- Host：9 个 `dsh_canvas_*` 工具 + `dsh-canvas` 技能 + 4 条 owner-only 路由握手；
  `dsh_canvas_open/upsert_page/get_state/check_style` 在真实 DSH 中写入/读取 `.dsh-canvas/` 通过。
- Client：左侧栏「画布」、主面板画布（工具条 + iframe + 悬浮球）、输入框「设计」chip
  在运行中的 DSH 客户端槽位里均为 active；组件用真实 `dist/client.js` 渲染并截图核对。
- `npm run verify` 全绿（302 个测试，浏览器 E2E 使用真实 Edge，0 skip）；
  `npm run verify:prototypes` 38/38 通过；`npm run check:bundle` 通过。
- CI main 全绿后发布本版本。

## 安装

在 DSH 的 **Plugins** > **Add plugin** 选择仓库目录，或用 `plugin_manager` 的
`install_bundle`。安装后新建会话可见 9 个工具与 `dsh-canvas` 技能。
