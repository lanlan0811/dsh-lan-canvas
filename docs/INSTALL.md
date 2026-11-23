# 安装与故障排查（dsh-canvas）

## 支持的三条安装路径

| 方式 | 目标（填给 DSH） | 说明 |
|---|---|---|
| 仓库 URL（推荐） | `https://github.com/lanlan0811/dsh-lan-canvas` | pnpm 以 git 依赖安装，读取仓库里的 `package.json`、`cordis.patch.yml` 与已提交的 `dist/` |
| Release tarball | `https://github.com/lanlan0811/dsh-lan-canvas/releases/download/v<版本>/dsh-canvas-<版本>.tgz` | 每次发布由 `npm pack` 生成并附到 Release，离线/内网也可先下载再用本地路径 |
| 本地目录 | 仓库的绝对路径（如 `D:\Trae项目\dsh-canvas`） | 开发时使用；`plugin_manager` 会建立 link，改完代码重启 DSH 生效 |

DSH 侧操作：**Plugins** > **Add plugin** 填上述目标；或让代理调用
`plugin_manager` 的 `install_bundle`，`target` 为同一字符串。

## 不要按裸包名安装

npm 公共仓库里已有一个**同名占位包**：

```text
dsh-canvas@0.0.1   (author: dushaobindoudou, "name reserved; first release in development")
```

它只有 `package.json` 和 `README.md`，既没有 `dsh.bundle.patch`，也没有
`cordis.patch.yml`。如果安装时只填 `dsh-canvas`，DSH 会从 npm 装到这个占位包，
然后在校验阶段报：

```text
Cannot validate installed package dsh-canvas: Error: dsh: failed to read overlay
... node_modules\dsh-canvas\cordis.patch.yml: Error: ENOENT: no such file or directory
```

这不是本仓库的打包问题（用仓库 URL / tarball 安装时该文件一定存在，CI 的
`npm run check:pack` 会验证）。**请安装仓库 URL 或 tarball，不要安装裸包名。**

## 装错了怎么恢复

1. **Plugins** 页面找到 `dsh-canvas`，移除（或 `plugin_manager` `remove_bundle`）；
2. 确认 profile 的 `node_modules/dsh-canvas` 已删除（目录链接指向的仓库目录不应被删）；
3. 用仓库 URL 或 tarball 重新安装；
4. 新建会话，确认 9 个 `dsh_canvas_*` 工具与 `dsh-canvas` 技能出现；
5. 打开左侧栏「画布」，若显示授权错误，刷新画布或重启 DSH。

## 安装后自检

- `npm run check:bundle`：清单、patch、locale、icon、SKILL、9 工具 + 技能 + 4 路由握手；
- `npm run check:pack`：`npm pack` 实际产物必须包含
  `cordis.patch.yml`、`dist/index.mjs`、`dist/client.js`、`locale`、`icon.svg`、
  `docs/DETAIL.md`、`skills/SKILL.md`、`LICENSE`、`THIRD-PARTY-NOTICES.md`；
- 版本以仓库 `package.json` 的 `version` 为准；Release 标签为 `v<version>`。
