# dsh-lan-canvas v1.1.6

实现 [Issue #5](https://github.com/lanlan0811/dsh-lan-canvas/issues/5)：画布交互可发现性、无效跳转反馈、页面跳转连线、自动排布与单页/总预览入口。

## 变更

### 无效交互不再跳错误页面

- 页面内点击指向不存在页面的 `<a>` / `data-nav` 时，保持 iframe 原地，画布 toast 提示目标无法解析，并在页内用虚线标出本页可点击元素（2.4 秒后自动清除）。不再静默无反馈。
- 编辑态点击外链不再静默：阻止默认导航并提示「外部链接不会在画布内打开」。
- 页面脚本执行 `location.href='missing.html'` 等导致 iframe 自行导航时，服务端返回不含工作区/凭证信息的友好 404 HTML，并通过 `postMessage` 通知父画布重建原页面。同一页 10 秒内最多自动返回 3 次，超过后停在友好页并提示检查页面脚本，防止死循环。
- 预览层同样会恢复原页面并保持预览打开，不再显示纯文本 `page not found` / `unknown workspace`。

### 交互可发现与页面跳转连线

- 悬停可点击元素时探针使用实线描边 + 手型光标，与普通 hover 的虚线框区分。
- `GET /api/project` 新增派生字段 `navLinks`：解析页面内 `<a href>` / `<a data-nav>` 中已存在页面的跳转，画布渲染为只读虚线箭头。
  - 不写入 `project.json`；同向已有手动连线时手动连线优先。
  - 页面新增/删除、HTML 修改或标题变化后自动更新；外链、`#` 锚点、自环、歧义/未解析链接不生成连线。
  - 解析按页面 `htmlRev` 缓存；单次冷构建最多读取 32 MiB、返回 500 条边，避免超大项目阻塞本地服务。

### 自动排布

- 顶部工具条新增「自动排布」按钮（SVG 图标）。
- `POST /api/nodes` 新增 `op: "layout"`：按当前阅读顺序（`y`、`x`、`id`）排成 1–4 列网格；列宽取列内最大节点宽度、行高取行内最大高度，间距沿用 120/140。
- 原子写入并自动适应视图；位置未变时 `moved=0`，不写盘、不广播。保留手动连线、批注、页面简报、设计风格与视口。
- 空画布时按钮禁用；重复点击幂等。
- 初始视图、顶部「适应」、右键「适应视图」与自动排布统一使用顶部 20% 留白，避免顶排节点的悬浮工具栏被固定顶栏遮住；顶排页面的「预览此页」也可直接点击。

### 预览入口

- 选中页面节点后，悬浮工具栏第一项新增「预览此页」。
- 顶部新增「预览」总入口：有选中页时从选中页开始，否则从第一页；沿用现有预览层的页面下拉、网页/平板/手机/自定义设备与缩放。
- 右键「预览 / 预览设备」入口保留，行为不变。

### 无障碍与样式

- 新按钮均有 `aria-label` / `title`；总预览按钮声明 `aria-haspopup="dialog"`；禁用态有视觉样式。
- 窄屏（≤1180px）隐藏工具按钮文字，但保留可访问名，避免挤压导出按钮。
- 新增 toast 使用 `role="status"` / `aria-live="polite"`，导出模式隐藏。
- 新增图标均为 SVG，不使用 emoji；无新增运行期依赖，发行包不含 `.map`。

## 接口与数据兼容

- `GET /api/project` 只增加派生字段 `navLinks`；`project.json` 版本与结构不变，旧项目直接可用。
- `POST /api/nodes` 增加 `layout` op；响应 `{ ok, moved, positions }`。
- `/page/:id` 缺失页面由纯文本 `page not found` 改为 404 HTML 友好页；认证失败、畸形百分号编码、目录页 500 等现有行为不变。相对脚本跳转丢掉 `?ws=` 时也返回同一友好页（不读取任何页面数据）。
- 无新增工具或 `/dsh-canvas/*` 路由（仍为 9 个工具 + 4 条路由）。

## 测试

- 新增 `test/navGraph.test.mjs`：id / `data-nav` / slug 解析、外链/锚点/自环/缺失/歧义跳过、去重、HTML/标题变化缓存失效、删除页面清理、读取失败隔离、旧项目 `updatedAt` 版本回退。
- 新增 `test/layout.test.mjs`：5 节点 3 列、不同尺寸不重叠、非负坐标、幂等（不写盘）、保留连线/批注/视口、空项目、缺自定义头 403、未知 op 400。
- 新增 `test/nav-feedback.e2e.test.mjs`：悬停可点击标记、坏链 toast + 高亮及 2.4s 清除、外链提示、脚本 404 自动返回、预览内恢复、原型文件不被写回、无未捕获异常。
- 新增 `test/canvas-controls.e2e.test.mjs`：顶部自动排布/总预览、排布落盘与刷新保持、节点「预览此页」、总预览初始页与页面下拉、空画布按钮禁用。
- 更新 `test/canvas-a11y.e2e.test.mjs`：节点工具栏 `预览此页/重命名/复制/删除` 顺序与顶部按钮可访问名。
- 更新 `test/server.test.mjs`：`navLinks` 空数组、缺失页友好 404（含/不含 `ws`）、CSP、正文不泄露凭证。
- 全量 `npm test`：314 项全部通过（0 fail / 0 skipped）；`npm run verify:codegen`、`npm run check:bundle`、`npm run check:pack`、`npm run verify:prototypes` 全绿。
- 回归：`nav.e2e`、`preview.e2e`、`interaction.e2e`、`probe.e2e`、`iframe-auth`、`regressions` 等旧测试保持通过。

## 验收

- 基线（1.1.5 dist）：坏链点击无提示；脚本坏跳转显示 `page not found` / `unknown workspace`；顶部只有页面/适应；无跳转连线。1.1.6 下均有对应修复与截图/DOM 证据。
- 本地门禁全绿后提交并推送 `main`；同一 SHA 的 main CI 成功后，本机 `npm publish --access public --ignore-scripts` 发布 `dsh-lan-canvas@1.1.6`。
- 再推送附注 tag `v1.1.6`；`release.yml` 复核同 SHA CI 与 npm 版本后创建 GitHub Release，并附可安装资产 `dsh-lan-canvas-1.1.6.tgz`。
- npm tarball 已核实包含 `cordis.patch.yml`、`dist/index.mjs`、`dist/web/*` 等必需文件，且无 `.map`。

## 升级提示

1.1.6 同时修改 Host 与 Web 画布：

- 升级后重启 DSH；或在 **Plugins** 页禁用再启用 `dsh-lan-canvas`，然后刷新页面。
- 无需迁移 profile；`.dsh-canvas/` 项目数据格式不变，已有页面/连线/批注直接兼容。
- 当前已打开的画布页面不会热更新到新 bundle，需按上述步骤重新加载。

## 已知边界

- 跳转连线只来自页面内显式 `<a href>` / `data-nav`；纯 JS 路由、非链接可点击区域不会自动生成连线。
- 无效交互提示是启发式识别（语义标签、role、常见 `data-ts-*`、`cursor:pointer` 最外层区域）；不保证覆盖所有自定义交互。
- 脚本跳到不存在页会友好 404 后自动返回；反复触发有 3 次/10 秒上限，之后停在提示页。
- 外部链接仍不会在画布或预览内打开；页面脚本导航到外站属于原型自身行为，画布不做拦截承诺。
