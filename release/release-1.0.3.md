# dsh-canvas v1.0.3

修复 Issue #1「安装失败」，并把「安装产物必须可校验」做成 CI/发布门禁。

## 根因

npm 公共仓库里存在一个**同名的占位包** `dsh-canvas@0.0.1`（由其他作者保留名称，
只有 `package.json` 和 `README.md`，没有 `dsh.bundle`，也没有 `cordis.patch.yml`）。
如果安装时只填裸包名 `dsh-canvas`，DSH 会从 npm 装到这个占位包，随后校验
overlay 时报：

```text
Cannot validate installed package dsh-canvas: Error: dsh: failed to read overlay
... node_modules\dsh-canvas\cordis.patch.yml: Error: ENOENT: no such file or directory
```

这不是本仓库打包缺文件：从本仓库 URL 以 git 依赖安装（pnpm/npm 均实测）时，
`cordis.patch.yml`、`dist/`、`locale/`、`skills/` 都在包内。

## 修复与改进

- **安装文档重写**：README + 新增 `docs/INSTALL.md`，写明三条受支持的安装路径
  （仓库 URL、Release `.tgz`、本地绝对目录），并明确「不要只填 `dsh-canvas`」及装错后的恢复步骤。
- **每次 Release 附带可安装 tarball**：发布工作流在创建 Release 后执行
  `npm pack` 并上传 `dsh-canvas-<version>.tgz`，可直接用该资产 URL 安装，
  绕开同名占位包。
- **新增 `npm run check:pack`**：用 `npm pack --dry-run --json` 读取真实发行清单，
  强制包含 `cordis.patch.yml`、`dist/index.mjs`、`dist/client.js`、`dist/web`、
  `locale`、`icon.svg`、`skills/SKILL.md`、`docs/DETAIL.md`、`docs/INSTALL.md`、
  `LICENSE`、`THIRD-PARTY-NOTICES.md`。CI 与 release 工作流都执行，防止
  `files` 漏项再次演变成用户侧 ENOENT。
- `release-workflow` 测试同步覆盖 `check:pack` 与 Release 资产上传顺序。

## 正确的安装方式

```text
https://github.com/lanlan0811/dsh-lan-canvas
```

或本次 Release 资产：

```text
https://github.com/lanlan0811/dsh-lan-canvas/releases/download/v1.0.3/dsh-canvas-1.0.3.tgz
```

在 DSH 的 **Plugins** > **Add plugin** 中填入上述目标；或让代理调用
`plugin_manager` 的 `install_bundle`，`target` 使用同一字符串。

## 验收

- 实测从仓库 URL 安装（`pnpm add https://github.com/lanlan0811/dsh-lan-canvas`）：
  安装为 `dsh-canvas@1.0.3`，包内 `cordis.patch.yml` 存在，`dist/index.mjs` 可加载；
  同时用 `npm install github:...` 交叉验证。
- `npm run check:pack` 通过（156 个文件，含 overlay 与 dist）。
- `node --test test/release-workflow.test.mjs` 14/14 通过。
- 全量 CI 绿后发布；Release 资产 `.tgz` 可下载并再次 `npm pack` 校验一致。
