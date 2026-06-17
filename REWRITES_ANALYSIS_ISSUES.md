# 调查问题/疑点记录

记录调查 rewrite 加入 routes 数组逻辑过程中遇到的疑点。

## Vercel CLI 调查疑点

1. `convertRewrites`（`packages/routing-utils/src/superstatic.ts:168-199`）只做 1:1 映射 + 加 `check: true`，全程未排序；`packages/next/src/index.ts` 的 `beforeFilesRewrites/afterFilesRewrites/fallbackRewrites` 也是 `push(...convertRewrites(list))`，三段内部严格保留 `routes-manifest.json` 中的数组顺序。该顺序由 Next.js 自己写入（`next build`），不是 Vercel CLI 决定 —— 严格说"用户书写顺序"是否被 Next.js 内部改写过这一段不在本仓库可证，需到 Next.js 源码二次确认。
2. `beforeFiles` 分支会被打上 `override: true` 并视 nextVersion 把 `check` 改成 `continue: true`（`index.ts:756-767`，受 `beforeFilesShouldContinue`/`REDIRECTS_NO_STATIC_NEXT_VERSION` 控制）。即三阶段并不是对称等价的 v3 routes —— `beforeFiles` 实际带 override，语义上更接近"redirect-like 强制覆盖"，与 `afterFiles/fallback` 不同。
3. 旧 schema（`routesManifest.rewrites` 是数组）全部当作 `afterFiles`（`index.ts:747-753`），没有 beforeFiles/fallback 概念。
4. 老 Next（< 9.1.4-canary.0）连 `routes-manifest.json` 都不存在（`utils.ts:370-372`），rewrite 走的是另一条 legacy 代码路径，本次未深入。
5. `index.ts` 至少有两处构造 routes 数组（export 路径 ~1024、server-build 路径 ~2685），三阶段相对位置一致：`beforeFilesRewrites → {handle:'filesystem'} → _next/data 系列 → afterFilesRewrites → {handle:'resource'} → fallbackRewrites → 404 → {handle:'miss'}`；但中间夹杂的 `_next/image`/`_next/data`/i18n 规则两条路径并不完全相同，需要按部署模式区分。

## OpenNext 调查疑点

> 注：本仓库 `/Users/corbinlin/Project/opennext` 实际是 `@edgeone/opennextjs-pages` —— 由 OpenNext + Netlify 适配派生、目标产物对接 EdgeOne Pages 的一个分支，不是社区主干 OpenNext / OpenNext Cloudflare。结论仅对该分支成立。

### 1. 入口与调用链
- 主入口：`src/build/routes.ts:430` 的 `createRouteMeta(ctx)`。
- 工具：`src/build/route-utils.ts`（`convertRedirects` / `convertRewrites` / `convertHeaders` / `convertTrailingSlash` / `sourceToRegex`），注释明言"从 Vercel `@vercel/routing-utils` (superstatic.ts) 内化的核心路由转换逻辑"。
- 输出：`<serverHandlerDir>/config.json`，`{ version: 3, routes, framework? }`，写在 `routes.ts:685-699`。文件头部注释（`routes.ts:1-12`）显式声明"符合 Vercel Build Output API v3 格式"。

### 2. 是否解析 routes-manifest.json？是否再合并/重排？
- 直接读 `.next/routes-manifest.json`（通过 `ctx.getRoutesManifest()`，`routes.ts:436`），并取出 `redirects / headers / rewrites / dynamicRoutes / dataRoutes / staticRoutes`。
- **完全在编译期合并**到一个扁平 `routes: Route[]` 数组里，运行时不再做阶段编排（`src/run/**` 里 grep `rewrites|RouteMatcher|matchPathname` 全部命中 0 条与 rewrite 路由相关的代码 —— 运行时只有缓存/重新验证逻辑）。匹配引擎是 EdgeOne Pages 平台自己的 Build Output v3 路由解释器，OpenNext 这边只生成配置。

### 3. beforeFiles / afterFiles / fallback 怎么串起来
`routes.ts:413-428` 的注释把整体顺序写得很死，`routes.ts:482-657` 严格按它 push：

```
1  _next/static cache headers (continue:true)
2  trailingSlash 规范化
3  headers (continue:true)
4  redirects（过滤 internal）
5  beforeFiles rewrites          ← 在 filesystem 之前
6  RSC 路由
7  404/500 status routes
8  { handle: 'filesystem' }
9  afterFiles rewrites           ← filesystem 之后
10 fallback rewrites             ← 最后兜底前
11 serverRoutes (SSR/ISR)
12 dynamicRoutes
13 dataRoutes
14 API routes
15 catch-all `^${basePath}/.*$`
```

兼容老版本：若 `routesManifest.rewrites` 是数组（旧 schema），全部当 afterFiles（`routes.ts:455-461`）。

### 4. 是否排序？
- **不排序**。三阶段内部以及阶段之间，全程 `routes.push(...convertRewrites(list))`，`list` 直接来自 `routes-manifest.json` 里 Next.js 自身写入的顺序（也就是用户在 `next.config.js` 里 `return { beforeFiles: [...], afterFiles: [...], fallback: [...] }` 的书写顺序）。
- `src/build/routes.ts` 与 `src/build/route-utils.ts` 全文 grep `\.sort(` 命中 0 处。

### 5. convertRewrites 的产物（`route-utils.ts:332-365`）
```ts
const route: RouteWithSrc = { src, dest, check: true };
if (r.has)     route.has = r.has;
if (r.missing) route.missing = r.missing;
if (r.statusCode) route.status = r.statusCode;
```
注意：仍然保留 `check: true`（Vercel v3 语义：rewrite 命中后回到 routes 顶部继续匹配，做 filesystem check）。但 `routes.ts:8-11` 注释又声明 EdgeOne "不支持 check"。这是疑点（见下）。

### 6. 与 Vercel v3 spec 的关系
- **派生 + 子集**。`config.json` 用 `version: 3`、字段名（`src/dest/has/missing/continue/handle:'filesystem'/status/headers/exclude`）与 v3 完全对齐；`route-utils.ts` 直接内化自 `@vercel/routing-utils/superstatic`。
- 子集差异（`routes.ts:7-11`）：仅支持 `handle: 'filesystem'`，不支持 `check / caseSensitive / locale / middlewarePath / middlewareRawSrc`，正则要求 RE2（无 lookahead）。`exclude` 字段则是为了替代 `(?!...)`。
- 没有自定义 schema，相当于"Vercel Build Output v3 子集 + 一个 `exclude` 扩展"。

### 一句话总结
该分支 OpenNext 在**编译期**严格按 `beforeFiles → filesystem → afterFiles → fallback` 顺序、保持用户书写顺序、不做任何 sort，把 rewrites 拍平进一份 Vercel Build Output v3 `config.json`，由 EdgeOne Pages 运行时解释执行。

### 疑点 / TODO
1. `convertRewrites` 输出 `check: true`，但项目自己声明 EdgeOne 不支持 `check`。要么 EdgeOne 解释器静默忽略 `check`，要么 rewrites 的 filesystem 回检语义在 EdgeOne 上和 Vercel 不一致 —— 需确认 EdgeOne 路由解释器是否真把 `check` 当 no-op，否则 `afterFiles` rewrite 命中后能否再走一遍 dynamicRoutes 是不确定的。
2. `routes.ts` 步骤 7 末尾还塞了一条 `^/((?:[^/]+/)*[^/.]+)/$ → /$1` 的隐式规则（"Next.js 产物是 ssg.html"），它放在 `filesystem` 之前，可能与用户 trailingSlash 配置 / `afterFiles` rewrite 冲突。
3. 这是 fork（`@edgeone/opennextjs-pages`），与社区主干 `@opennextjs/aws`、`@opennextjs/cloudflare` 的运行时模型不同 —— 主干在 Lambda/Worker 内部把请求交给 Next 自己的 `NextServer`，其 rewrites 顺序由 Next 运行时决定，不是这里看到的 v3 编译模型。结论不要外推到主干 OpenNext。
4. `version: 3` 但没有 `build` / `images` / `wildcard` / `overrides` 等 v3 顶层字段；只用了 `routes`，与 Vercel 完整产物不等价。

## Vercel CLI 调查疑点

### 关键路径与代码位置
- 入口：`packages/next/src/index.ts:705-707` 声明 `beforeFilesRewrites/afterFilesRewrites/fallbackRewrites: Route[] = []`。
- 填充：`index.ts:747-775` —— 直接调用 `convertRewrites(routesManifest.rewrites.beforeFiles | .afterFiles | .fallback)`，对每个数组分别 `.push(...)`。如果 `routesManifest.rewrites` 是旧 schema（数组），整个数组都塞进 `afterFilesRewrites`（`index.ts:747-753`）。
- `convertRewrites` 实现：`packages/routing-utils/src/superstatic.ts:168-205` —— `rewrites.map(r => ({ src, dest, check: true, has?, missing?, status? }))`，**纯 1:1 映射**，无 sort/排序/重排。
- 拼装最终 routes 数组（serverless / serverMode）：`packages/next/src/server-build.ts:2252 / 2475 / 2522 / 2570 / 2572 / 2578` 与 legacy/默认 build：`index.ts:1031 / 1042 / 1070 / 1074 / 1076`。

### 三阶段在 routes 数组里的位置
固定结构（中间被 `handle:` 标记隔开）：
```
... headers / redirects / middleware ...
...beforeFilesRewrites           ← 在 handle:filesystem 之前
{ handle: 'filesystem' }
... (basePath/_next/data 规范化) ...
...afterFilesRewrites            ← filesystem 之后、resource 之前
{ handle: 'resource' }
...fallbackRewrites              ← resource 之后、miss 之前
{ src: '.*', status: 404 }
{ handle: 'miss' }
...
```
（`server-build.ts:2475/2522/2570/2572/2578` 行号一一对应。）

### 是否排序
**不排序**。三阶段内部以及之间全程 `...convertRewrites(list)` 展开，`list` 来源 = `.next/routes-manifest.json` 里 Next.js 写入的顺序，等价于用户 `next.config.js` 中 `rewrites()` 返回的书写顺序。`packages/next/src/index.ts` 与 `packages/routing-utils/src/superstatic.ts` grep `\.sort(` 在这条调用链上 0 命中。

### 用户书写顺序是否保留
**严格保留**。adapter 只做：(a) 把 `{source, destination, has, missing}` 映射成 `{src, dest, check:true, has, missing}`；(b) 对 `beforeFilesRewrites` 额外加 `override:true` 并把 `check` 转成 `continue:true`（`index.ts:756-767`）；(c) 通过 `updateRouteSrc`（`index.ts:787-824`）应用 trailingSlash / basePath / locale 前缀。这些都是逐项原地变换，不重排。

### routes 是合并的还是透传？
**Vercel CLI 合并**。`.next/routes-manifest.json` 只是输入，最终 v3 `config.json` 的 routes 数组由 `@vercel/next` adapter 在 Vercel 这边拼装，用户 rewrites 与 Next 自己的 dynamic / data / RSC / middleware / 404 路由全部由 adapter 编排到一起。

### Next-build 与 vercel adapter 的边界
- Next.js `next build` 产物：`.next/routes-manifest.json`（含 `rewrites.{beforeFiles,afterFiles,fallback}`，每条已带 `regex / namedRegex / routeKeys`），`.next/server/**`，`prerender-manifest.json` 等。Next 写入时即按用户书写顺序。
- Vercel `@vercel/next` builder：读取上述 manifest → `convertRewrites` → 嵌入由 `handle:filesystem/resource/miss` 分隔的固定模板，加上 redirects / headers / middleware / dynamicRoutes / dataRoutes / 404 fallback，输出 `.vercel/output/config.json`（v3）。

### 一句话总结
beforeFiles / afterFiles / fallback **保留用户书写顺序、不排序**，分别被 `@vercel/next` adapter 插在 `handle:filesystem` 之前、之后、`handle:resource` 之后（`handle:miss` 之前）三个固定锚点上。

### 疑点
1. `beforeFilesShouldContinue`（`index.ts:441`，按 next 版本 gate）会把 beforeFiles 的 `check:true` 改为 `continue:true` 并加 `override:true`；老版本 Next 行为差异未深究。
2. `updateRouteSrc`（trailingSlash/locale 前缀逻辑）只改 `src` 不改顺序；但 source 经规范化后是否在 Next 写 manifest 时已按 specificity 排序属于 Next 内部行为，超出 Vercel CLI 范围。
3. `routesManifest.rewrites` 是数组（旧 schema）时全部归入 `afterFilesRewrites`，没有 `beforeFiles` / `fallback` 概念；非常老的 Next 项目下行为不同。
4. `server-build.ts` 与 `index.ts` 各自有一份拼装逻辑（serverBuild vs default/legacy build），分支由 `isServerMode` 等开关决定；两条路径的相对锚点一致，但中间夹的辅助路由不同，调试时需要先确认走哪条分支。

## EdgeOne CLI 调查疑点

### 1. 是否复用 Vercel CLI / @vercel/next？
**完全不复用**。EdgeOne CLI 不调 Vercel CLI、也不读 `.next/routes-manifest.json`。Next.js 项目走 `src/plugins/pluginResolver.ts:42-46` 强制注入的 `@edgeone/opennextjs-pages` 插件 —— 该插件是 OpenNext 的 EdgeOne 分支（fork），由它读 manifest、生成 `.edgeone/cloud-functions/ssr-node/config.json`（v3 子集）。EdgeOne CLI 自身只做 "把 ssr-node/config.json 与其他 builder 产物拼成 `.edgeone/routes.json`"。

### 2. ssr-node/config.json 是怎么生成的（rewrites 三段）
不在 tef-cli 仓内，在 `packages/tef-cli/node_modules/@edgeone/opennextjs-pages/dist/build/routes.js` 的 `createRouteMeta`：
- `routes.js:234-244` 拆出 `beforeFilesRewrites / afterFilesRewrites / fallbackRewrites`（数组型旧 schema 全部当 afterFiles）。
- `routes.js:252-351` 顺序硬编码：`_next/static cache → trailingSlash → headers → redirects → beforeFilesRewrites → RSC → 404/500 → trailing-redirect → {handle:"filesystem"} → afterFilesRewrites → fallbackRewrites → static/dynamic/data/api routes → ^/.*$`。
- `convertRewrites`（`route-utils.js:594-623`）只是 `rewrites.map(...)`，每条加 `check:true`，**三段内部完全保留 next.config.js 书写顺序，不 sort**。
- 写盘：`routes.js:357-370`，`{ version:3, routes, framework? }` —— **没有任何 server-name 字段**。

### 3. routes.json 是怎么生成的（关键文件 `src/pages/generate-routes.ts`）
入口 `generateRoutes()`（line 853）：
- L871 读 `.edgeone/cloud-functions/ssr-node/config.json`。
- L877-881 调 `extractAdapterRules(serverHandlerConfig)`（实现见 `src/pages/builder/utils/adapter-rules-handler.ts:12-35`）—— 以 **第一个 `route.handle === 'filesystem'`** 为切点 `slice` 成 `beforeFilesystem / afterFilesystem` 两段。**这就是把 v3 五个 phase 压扁成只剩一个 filesystem 的位置**：实际上压扁更早就发生了（opennextjs-pages 从未生成 `resource/miss/rewrite/hit/error` 这四种 handle，源头就只有一个 `filesystem`），EdgeOne CLI 这里只是顺手再切一刀。
- L971-979 仅取 `afterFilesystem`，逐条 `addServerNameToRoutes(..., 'ssr-node')`（L703-708：`route => ({ ...route, 'server-name':'ssr-node' })`）→ 进 `allRoutes`。
- L1101-1113 最终拼装 `sortedRoutes`：
  ```
  trailingSlashRoutes
  adapterMiddlewareRoutes        ← = beforeFilesystem，原样、不排序、不加 server-name
  legacyFilesystemRedirectRoutes
  promotedConfRoutes              ← edgeone.json 的 headers/redirects/rewrites
  { handle: 'filesystem' }        ← 唯一保留的 handle
  sortRoutes([...allRoutes(含 afterFilesystem 已带 ssr-node), ...({src:'/.*','server-name':'ssr-node'} 兜底)])
  ```
- `sortRoutes`（`src/pages/builder/utils/route-sorter.ts:65-111`）按 `getRouteMatchType`（精准 0 → 单参 1 → 多级 2 → 全局 catch-all 3）升序、组内按 `calculateSpecificity` 降序。**afterFiles 与 fallback 在这里被混到同一池里重排，原书写顺序丢失。**
- L1163-1206 写 `.edgeone/routes.json`：`{ version:3, routes:sortedRoutes, middlewarePaths?, ...routesConf }`。

### 4. 三段最终落点
- **beforeFiles**：opennext 在 ssr-node/config.json 里放在 `{handle:'filesystem'}` 之前 → EdgeOne CLI 把这一整段当作 `adapterMiddlewareRoutes` 透传到 routes.json 里 filesystem 之前的位置；**段内严格保持书写顺序**；不带 `server-name`。
- **afterFiles + fallback**：在 ssr-node/config.json 内分别在 filesystem 之后、紧接彼此；EdgeOne CLI 把它们一锅端进 `afterFilesystem`，加上 `server-name:'ssr-node'`，然后与 `^/.*$` 兜底一起送进 `sortRoutes`。**两段不再可分，且组内顺序按 specificity 重排**。

### 5. server-name 注入点
- 单条 ssr-node 路由的 `'server-name':'ssr-node'`：`generate-routes.ts:703-708 addServerNameToRoutes`，仅在 `generate-routes.ts:977 / 982 / 1103` 调用（即只在写 routes.json 时加）。
- 其他 cloud-functions 子目录顶层 `'server-name'` + `runtime`：`generate-routes.ts:619-626` 在 `scanCloudFunctionsConfigs()` 里写回各自的 config.json；ssr-node 被 L902 `filter(item => item.serverName !== 'ssr-node')` 显式排除，所以 **ssr-node/config.json 自身永远没有 server-name 字段**，只有 routes.json 拷贝出去的副本里有。

### 6. routes.json vs ssr-node/config.json 关系
两份文件**分别生成、单向流动**：opennextjs-pages 写 ssr-node/config.json → tef-cli `generate-routes.ts` 读它 → 切 filesystem → afterFilesystem 加 server-name → 与其他 builder + edgeone.json 合并 + 排序 → 写 routes.json。ssr-node/config.json 在 tef-cli 流程里只读不写。

### 一句话总结
EdgeOne CLI 不复用 Vercel CLI；Next.js rewrites 由 fork 出来的 opennextjs-pages 在编译期按 `beforeFiles → filesystem → afterFiles → fallback` 顺序保留用户书写顺序拍平进 ssr-node/config.json，但 tef-cli `generate-routes.ts` 随后把 filesystem 之后的 afterFiles + fallback 合并成一池、加 `server-name:'ssr-node'`、再用 `route-sorter.ts` 按 match type / specificity 重排 —— **afterFiles 与 fallback 的相对顺序在 routes.json 里不再可保证与 next.config.js 一致**。

### 疑点 / 风险
1. `sortRoutes` 把 afterFiles 与 fallback 混排，违反 Next.js 语义（fallback 必须严格在 afterFiles 之后，与 specificity 无关）。当 fallback 项 specificity 比 afterFiles 高时，运行时会先命中 fallback，与 Vercel/Next dev 行为不一致。
2. opennextjs-pages 输出的 `check:true` 被原样塞进 routes.json；EdgeOne 路由解释器是否实现 `check` 语义未在源码中确认（参见 OpenNext 部分疑点 1）。
3. `extractAdapterRules` 只识别**第一个** `handle:'filesystem'`；如果 opennext 未来产物里出现 `handle:'resource' / 'miss' / 'rewrite' / 'hit' / 'error'`，会作为普通路由被吞进 afterFilesystem 并被 sortRoutes 打乱，没有兼容路径。
4. `adapterMiddlewareRoutes`（beforeFiles 段）不加 `server-name`，依赖运行时根据 dest 自行解析；与 afterFiles/fallback 路径处理不对称。
5. tef-cli 没有从 `.next/routes-manifest.json` 直接读取的代码路径 —— 一旦 opennextjs-pages 升级行为变化（如改顺序、改 check 字段），tef-cli 这边无法独立兜底。

---

## EdgeOne CLI 调查疑点

调查路径：`/Users/corbinlin/Project/ef-dev-tools/packages/tef-cli`（v1.x）。

### 关键链路（两段式：adapter → CLI）

EdgeOne CLI **不直接调用 `@vercel/next`，也不自己解析 `.next/routes-manifest.json`**。它依赖一个独立的 OpenNext fork —— `@edgeone/opennextjs-pages`（`node_modules/@edgeone/opennextjs-pages/dist/build/routes.js`，由用户工程通过 EdgeOne Next plugin 触发）—— 由该 adapter 写出 `.edgeone/cloud-functions/ssr-node/config.json`；再由 CLI `src/pages/generate-routes.ts` 读取并合并成最终的 `.edgeone/routes.json`。

### 1. adapter 阶段（`@edgeone/opennextjs-pages`）

`build/routes.js:225-360` 的 `createRouteMeta()` 从 `routes-manifest.json` 取出 `rewrites`，并按以下固定顺序拼装（**保留用户书写顺序，不排序**，因为 `convertRewrites` 在 `route-utils.js:594` 仅是 `.map()`）：

```
staticCache → trailingSlash → headers → redirects
→ beforeFiles rewrites           ← 锚点 A
→ (RSC / 404 / 500 / 尾斜杠 redirect)
→ { handle: "filesystem" }       ← 唯一 handle 锚点
→ afterFiles rewrites            ← 锚点 B
→ fallback rewrites              ← 锚点 C
→ staticRoutes / dynamicRoutes / dataRoutes / apiRoutes
→ catch-all { src: "^/.*$" }
```

- 该阶段产物是 v3 风格的 `routes` 数组，但只剩 `handle:"filesystem"` 一个锚点（**没有 resource/miss/rewrite/hit/error**），所以 5-phase 在 adapter 里就被压扁成 1-phase。
- 此阶段产物里 **没有 `server-name` 字段**。

### 2. CLI 阶段（`src/pages/generate-routes.ts`）

```
src/pages/builder/utils/adapter-rules-handler.ts:12-35
  extractAdapterRules(config) → 以 { handle:"filesystem" } 为切刀
    beforeFilesystem = routes.slice(0, idx)
    afterFilesystem  = routes.slice(idx + 1)
```

`generateRoutes()`（`generate-routes.ts:853-1234`）把上面两段重新摆放：

- **L879-881**：`extractAdapterRules(serverHandlerConfig)` 拆出 `adapterMiddlewareRoutes` / `adapterUpstreamRoutes`。
- **L971-979**：仅把 `adapterUpstreamRoutes` 推入 `allRoutes`，并通过 `addServerNameToRoutes(routes,'ssr-node')`（`L703-708`，纯 `.map()` 加 `'server-name':'ssr-node'`）注入字段。
- **L1101-1113** 是最终装配：

```ts
const routesToSort = [
  ...allRoutes.filter(r => !isPureDynamicRoutes(r)),
  ...(hasServerHandler ? [{ src:'/.*', 'server-name':'ssr-node' }] : []),
];
const sortedOtherRoutes = sortRoutes(routesToSort);   // ← 重排！
const sortedRoutes = [
  ...trailingSlashRoutes,
  ...adapterMiddlewareRoutes,         // beforeFiles 段：保留原顺序
  ...legacyFilesystemRedirectRoutes,
  ...promotedConfRoutes,              // edgeone.json headers/redirects/rewrites
  ...assetsRules,                     // [{ handle:'filesystem' }]
  ...sortedOtherRoutes,               // afterFiles + fallback + dynamic + apiRoutes + catchall：被重排
];
```

- `sortRoutes`（`src/pages/builder/utils/route-sorter.ts:65-111`）：按 `getRouteMatchType`（精准 0 < 单段 1 < 多段 2 < 全局 catch-all 3）+ `calculateSpecificity` 重排，仅在 catch-all (matchType=3) 内才按 `server-name` 权重再分。**这意味着 afterFiles 与 fallback 的相对顺序、以及它们与 staticRoutes/dynamicRoutes/apiRoutes 的相对顺序，全部被 EdgeOne 自己的 specificity 算法覆盖，原来用户在 next.config.js 里的写法顺序在 filesystem 之后段不再保留。**
- `beforeFiles` 段（`adapterMiddlewareRoutes`）整体直接 splice 进去，**不进入 `sortRoutes`，顺序保留**；但其内部 `server-name` 缺失（CLI 没给 beforeFiles 加 server-name —— L495 注释明示「预处理阶段不加 server-name（透传）」）。

### 3. 两份文件的关系

- `.edgeone/cloud-functions/ssr-node/config.json` 是 **adapter 输出**（输入给 CLI），由 `@edgeone/opennextjs-pages` 写入；其 `routes` 含 `{ handle:"filesystem" }`，无 `server-name`。
- `.edgeone/routes.json` 是 **CLI 合并输出**，由 `generate-routes.ts:1206 writeFileSync` 一次写出。CLI **不会回写 ssr-node/config.json**（没找到回写代码）；两份的差异是：
  - routes.json 把多个 cloud-functions/edge-functions/agent-* 的 routes **拼接**；
  - 给每条注入 `server-name`（`addServerNameToRoutes` 或行内 `.map`，L924/935/948/960/977/982/1103/1131）；
  - 把 ssr-node/config.json 的 before-filesystem 段按原顺序前置，after-filesystem 段送入 `sortRoutes` 重排；
  - 追加 `{ src:'/.*', 'server-name':'ssr-node' }` 兜底（L1103）；
  - 顶级合并 `conf`、`schedules`、`middlewarePaths`。

### 4. 一句话总结

EdgeOne 走的是「**`@edgeone/opennextjs-pages`（OpenNext fork）当 Next adapter，CLI 只做合并 + server-name 注入 + 二次排序**」的两段式：beforeFiles 在 adapter 里就被锚到 filesystem 之前、CLI 端也整体保留原顺序；afterFiles + fallback 在 adapter 里依然按用户顺序写出，但 CLI 在最终 routes.json 里把它们和 staticRoutes/dynamicRoutes/apiRoutes 一起 `sortRoutes` 重排，**所以 fallback 不再天然兜底于 afterFiles 之后，只能靠 specificity 排在 catch-all 之前**。

### 疑点

1. EdgeOne `sortRoutes` 把 afterFiles 与 fallback 一起按 specificity 重排，这与 Vercel/Next 语义（fallback 严格在 dynamicRoutes 之后）**不等价**：若用户写 `afterFiles: [{source:'/a',destination:'/b'}]` 和 `fallback: [{source:'/(.*)',destination:'/c'}]`，EdgeOne 仅靠通配级别区分先后，碰巧一致，但若 fallback 写成精准 src，就会错位到 afterFiles 之前。
2. `getRoutePriority`（`route-sorter.ts:16-38`）把 `server-name === 'edge'` 设为 2000、`api/ssr` 设为 1000；当多个 ssr-node 路由 `src` 完全相同时按 server-name 权重，但 adapter 段都是 ssr-node，对实际行为影响有限，疑点是「edge 函数若与 ssr-node 抢同一 src 时谁先」。
3. `isPureDynamicRoutes`（`generate-routes.ts:836-848`）会把仅含 `src` 和 `server-name:'ssr-node'` 的"纯动态"路由从 `allRoutes` 滤掉，由 catch-all `/.*` 兜底；意味着 adapter 写出的部分 dynamicRoutes 会被丢弃 —— 若用户的 afterFiles 重写后的某条形如纯动态 ssr-node，会不会被误丢？需要核对 `isPureDynamicRoutes` 的判定条件是否会误伤 rewrite 产物。
4. CLI 不接受 adapter 已经放好的位置：beforeFiles 完全保留，但 afterFiles 被二次排序 —— 这是 EdgeOne 与 Vercel 行为分叉的核心点，文档里未声明。
5. `convertRewrites`（adapter 端）对每条加 `check:true`，CLI 端不会去掉；EdgeOne 网关侧如何解释 `check:true` 与 `handle:"filesystem"` 的组合（特别是仅有 1 个 handle 的情况）尚未验证。
6. `cloud-functions/ssr-node/config.json` 与 `.edgeone/routes.json` **未发现回写动作**，但 OpenNext fork 内是否在后续阶段二次重写 config.json 没全量扫描，存疑。
