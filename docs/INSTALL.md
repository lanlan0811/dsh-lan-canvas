# 安装与故障排查（dsh-lan-canvas）

## 支持的四条安装路径

| 方式 | 目标（填给 DSH） | 说明 |
|---|---|---|
| npm（推荐） | `dsh-lan-canvas` | 唯一、不会被旧名 `dsh-canvas` 的占位包劫持 |
| 仓库 URL | `https://github.com/lanlan0811/dsh-lan-canvas` | pnpm 以 git 依赖安装，读取仓库里的 `package.json`、`cordis.patch.yml` 与已提交的 `dist/` |
| Release tarball | `https://github.com/lanlan0811/dsh-lan-canvas/releases/download/v<版本>/dsh-lan-canvas-<版本>.tgz` | 每次发布由 `npm pack` 生成并附到 Release，离线/内网也可先下载再用本地路径 |
| 本地目录 | 仓库的绝对路径（如 `D:\Trae项目\dsh-canvas`） | 开发时使用；`plugin_manager` 会建立 link，改完代码重启 DSH 生效 |

DSH 侧操作：**Plugins** > **Add plugin** 填上述目标；或让代理调用
`plugin_manager` 的 `install_bundle`，`target` 为同一字符串。

## 不要安装旧的裸包名

npm 公共仓库里有一个**他人保留的占位包**：

```text
dsh-canvas@0.0.1   (author: dushaobindoudou, "name reserved; first release in development")
```

它只有 `package.json` 和 `README.md`，既没有 `dsh.bundle.patch`，也没有
`cordis.patch.yml`。本项目早期也用 `dsh-canvas` 作包名；为了让安装目标唯一，
现已迁移到 **`dsh-lan-canvas`**。如果安装时只填旧名 `dsh-canvas`，
DSH 会从 npm 装到占位包，然后在校验阶段报：

```text
Cannot validate installed package dsh-canvas: Error: dsh: failed to read overlay
... node_modules\dsh-canvas\cordis.patch.yml: Error: ENOENT: no such file or directory
```

这不是本仓库的打包问题（npm scoped 包 / 仓库 URL / tarball 都包含该文件，
CI 的 `npm run check:pack` 会验证）。**请安装 `dsh-lan-canvas`，
不要安装旧的裸包名。**

## 从旧包名迁移

1. **Plugins** 页面找到旧的 `dsh-canvas`，移除（或 `plugin_manager` `remove_bundle`）；
2. 确认 profile 的 `node_modules/dsh-canvas` 已删除（目录链接指向的仓库目录不应被删）；
3. 重新安装 `dsh-lan-canvas`（npm / 仓库 URL / tarball）；
4. 重启 DSH（bundle 行名从 `dsh-canvas` 变为 scoped 包名，Host 需要重新加载）；
5. 新建会话，确认 9 个 `dsh_canvas_*` 工具与 `dsh-canvas` 技能出现；
6. 打开左侧栏「画布」，若显示授权错误，刷新画布或重启 DSH。

## 安装后自检

- `npm run check:bundle`：清单、patch、locale、icon、SKILL、9 工具 + 技能 + 4 路由握手；
- `npm run check:pack`：`npm pack` 实际产物必须包含
  `cordis.patch.yml`、`dist/index.mjs`、`dist/client.js`、`locale`、`icon.svg`、
  `docs/DETAIL.md`、`skills/SKILL.md`、`LICENSE`、`THIRD-PARTY-NOTICES.md`，
  且不得包含 `.map` 文件；
- 版本以仓库 `package.json` 的 `version` 为准；Release 标签为 `v<version>`。

## 命名对照

| 名称 | 值 | 说明 |
|---|---|---|
| 项目 / 仓库 | `dsh-lan-canvas` | GitHub 仓库名 |
| npm 包 | `dsh-lan-canvas` | 安装目标 |
| 客户端 bundle id / 面板 key | `dsh-canvas` | 内部稳定标识 |
| 工具 | `dsh_canvas_*` | 工具 API 名，不随包名变化 |
| 技能 | `dsh-canvas` | 技能 id，不随包名变化 |
| 数据目录 | `.dsh-canvas/` | 工作区数据 |
