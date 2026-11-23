# dsh-lan-canvas v1.1.2

修复升级到 1.1.x 后**左侧栏「画布」消失、`/design` 不出现**的问题，并提供 profile 迁移脚本。

## 根因

1.1.0 把 npm 包名从 `dsh-canvas` 改为 `dsh-lan-canvas`，`cordis.patch.yml` 的 bundle 行
`name` 也随之改为 `dsh-lan-canvas`。旧 profile 仍以 `dsh-canvas` 为依赖 key，DSH 解析不到
新行，Host 条目变为 `absent`；客户端 bundle 因此没有注册槽位，表现为：

- 左侧栏没有「画布」入口；
- 输入 `/design` 没有设计系统选择（命令未注册）。

## 修复

- 新增 `scripts/migrate-profile.mjs` 与 `npm run migrate-profile`：
  - 把 profile 的 `dsh-canvas` 依赖/ bundle 名改为 `dsh-lan-canvas`；
  - 备份原 `package.json`、移除旧 `node_modules/dsh-canvas` 链接；
  - 自动执行 `pnpm install`（可 `--no-install` / `--dry-run`）；
  - 只改 profile，不动工作区 `.dsh-canvas/`。
- 迁移脚本随 npm 包发布（`files` 已包含），并在 README / `docs/INSTALL.md` 增加升级说明。
- 新增测试覆盖：依赖 key + bundles 迁移、备份、幂等、profile 不存在时报错。

## 升级方式（已安装旧版的用户）

```bash
npm run migrate-profile -- --profile "C:\Users\<你>\.dsh\profiles\desktop"
```

然后**重启 DSH**。也可以移除旧 `dsh-canvas`、重装 `dsh-lan-canvas` 后重启。

> 1.1.2 不能热修复一个正在运行的旧 profile：bundle key 是启动时解析的，必须重启。
> 本机已把 profile 迁移为 `dsh-lan-canvas`（旧 key 与链接已移除），重启 DSH 后生效。

## 验收

- `node --test test/migrate-profile.test.mjs` 2/2 通过；
- 全量测试、CI、Release workflow 全绿；
- npm `dsh-lan-canvas@1.1.2` 可安装，包内含 `scripts/migrate-profile.mjs`；
- 迁移后的 profile 只保留 `dsh-lan-canvas` 依赖与 bundle，重启后 9 工具 + 技能 + 画布入口恢复。
