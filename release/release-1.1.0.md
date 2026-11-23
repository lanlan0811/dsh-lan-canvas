# dsh-lan-canvas v1.1.0

把 npm 包名从 `dsh-canvas` 迁移到 **`dsh-lan-canvas`**，彻底避开 npm 上他人占位的同名包；README 完整重写，并在开头说明与 Tianshu-Canvas 的移植关系。

## 改名与迁移

- 项目 / 仓库 / npm 包名统一为 **`dsh-lan-canvas`**（无 scope）。
- `package.json`：`name` → `dsh-lan-canvas`，移除 `private`，声明 `publishConfig.access = public`。
- `cordis.patch.yml`：插入行 `name` → `dsh-lan-canvas`（`id` 仍是内部行 key `dsh-canvas`）。
- **内部稳定标识保持不变**：客户端 bundle id / 面板 key `dsh-canvas`、`/dsh-canvas/*` 路由、
  `dsh_canvas_*` 工具名、`dsh-canvas` 技能名、`.dsh-canvas/` 数据目录。它们不是项目名，
  也不随 npm 包名变化；升级时不需要改工具调用或数据。
- 旧安装需要迁移：移除旧包（`dsh-canvas`）→ 安装 `dsh-lan-canvas` → 重启 DSH。
  旧名 `dsh-canvas` 在 npm 上是他人占位包（无 `cordis.patch.yml`），不要再安装它。

## npm 发布

- v1.1.0 已发布到 npm：`npm install dsh-lan-canvas` / DSH **Plugins** > **Add plugin** 填 `dsh-lan-canvas`。
- 发布工作流新增 `npm publish`：版本已存在时跳过，可安全重跑；后续版本需要仓库 secrets
  配置 `NPM_TOKEN`（npm 自动化 token）。
- 发布包不含 `.map`：`check:pack` 明确拒绝任何 `.map` 文件，并要求包含
  `cordis.patch.yml`、`dist/index.mjs`、`dist/client.js`、`dist/web`、`locale`、`icon.svg`、
  `skills/SKILL.md`、`docs/DETAIL.md`、`docs/INSTALL.md` 等。

## 文档

- README 完整重写：开头说明 **dsh-lan-canvas 由 Tianshu-Canvas（`tianshu-canvas@0.9.5`，天枢 TPI 插件）移植**；
  增加命名对照、安装四条路径、工具/设计模式/数据/安全/开发/排障章节。
- `docs/INSTALL.md` 重写：npm、仓库 URL、Release tarball、本地目录；旧包名迁移步骤；
  命名对照表（项目名 / npm 名 / 内部 id）。
- `docs/DETAIL.md` 增加来源与命名说明。

## 验收

- `npm run check:bundle`：`dsh-lan-canvas@1.1.0`，9 工具 + 技能 + 4 路由握手通过。
- `npm run check:pack`：发行清单含 overlay 与 dist，且不含 `.map`。
- `npm publish` 后 `npm view dsh-lan-canvas@1.1.0` 可查；用 npm 包安装后
  `node_modules/dsh-lan-canvas/cordis.patch.yml` 与 `dist/index.mjs` 存在。
- 本地全量测试、CI 全绿；Release 资产 `.tgz` 与 npm 包内容一致。
