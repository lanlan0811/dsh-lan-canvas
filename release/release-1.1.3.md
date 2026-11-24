# dsh-lan-canvas v1.1.3

修复 1.1.0–1.1.2 中**左侧栏「画布」与 `/design` 一直没有加载**的根本原因：客户端 bundle 的模块工厂 id 与 npm 包名不一致。

## 根因

DSH 客户端模块表以 **npm 包名**作为 bundle 的模块 key（`WebBootEntry.id == package name`），加载脚本后校验：

```text
bundle <url> loaded without registering "<package-name>" via __ModuleLoader__.load
```

而 `scripts/build-client.mjs` 一直把工厂 id 硬编码为旧名：

```js
window.__ModuleLoader__.load({ id: 'dsh-canvas', factory(require) { … } })
```

1.1.0 起包名是 `dsh-lan-canvas`，但产物仍只注册 `dsh-canvas`。结果：

- Host 侧 9 工具 + 技能正常（按 patch 行 `name: dsh-lan-canvas` 解析）；
- Client 侧 bundle 被判为「未注册」→ 左侧栏画布、主面板画布、设计 chip、`/design` 全部不加载；
- 迁移 profile、重装、重启都无法修复，因为 1.1.0–1.1.2 的 `dist/client.js` 都带错误的 id。

## 修复

- `scripts/build-client.mjs`：从 `package.json.name` 读取并校验，banner 使用包名作为工厂 id；
  不再硬编码 `dsh-canvas`。
- `scripts/check-bundle.mjs`：产物工厂 id 必须等于 `pkg.name`。
- `test/client.bundle.test.mjs`：断言 `load()` 的 id === 包名；保留三个槽位与 chip 回归。
- README / DETAIL 补充：模块工厂 id 必须等于 npm 包名；面板/槽位/路由/工具/技能/数据目录仍用
  `dsh-canvas` 作为内部稳定标识。

## 验收

- `dist/client.js` 首行 id 为 `dsh-lan-canvas`；`check:bundle`、`check:pack`、`client.bundle` 测试通过；
- 全量测试、CI、Release workflow 全绿；
- **真实 DSH 验收**（已在本机执行）：
  - `sidebar.panellist` 出现 `dsh-canvas`（order 12，active）；
  - `conversation.input.left` 出现 `dsh-canvas-design`（order 30，active）；
  - `main` 出现 key `dsh-canvas`（active）；
  - 画布入口与 `/design` 恢复，无需再次迁移数据。
- npm `dsh-lan-canvas@1.1.3` 可安装，包内 `dist/client.js` 工厂 id 正确。
