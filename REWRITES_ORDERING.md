# Rewrites 路由排序逻辑 · 跨实现深度对比

> 本文回答一个核心问题：**`next.config.js` 里的 `rewrites().{beforeFiles, afterFiles, fallback}` 三段，最终怎么进入 routes 数组？是否被排序？**
>
> 实测三家 adapter 源码（Vercel CLI / OpenNext fork / EdgeOne CLI）后给出结论，所有结论都附带文件路径与行号锚点，方便复核。
> 调查过程中遗留的所有疑点见同目录 [`REWRITES_ANALYSIS_ISSUES.md`](./REWRITES_ANALYSIS_ISSUES.md)。

---

## 0. 一句话结论

| 实现 | 是否对 rewrites 做"排序" | 是否保留用户书写顺序 |
|---|---|---|
| **Vercel CLI (`@vercel/next`)** | ❌ 全程不排序 | ✅ 严格保留 |
| **OpenNext fork (`@edgeone/opennextjs-pages`)** | ❌ 全程不排序 | ✅ 严格保留 |
| **EdgeOne CLI (`tef-cli`)** | ⚠️ **part. 排序**（仅对 `afterFiles` + `fallback` 段二次重排） | ✅ `beforeFiles` 保留<br>❌ `afterFiles`/`fallback` 重排 |

**核心发现**：**EdgeOne CLI 在 `tef-cli` 这一步对 `afterFiles + fallback` 做了一次按 specificity 的二次排序**，这是与 Vercel / OpenNext 的关键行为分叉，可能在 fallback specificity 高于 afterFiles 时导致 fallback 提前命中。

---

## 1. 编译流水的总图

```
                ┌──── next.config.js ────┐
                │  rewrites() {          │
                │    beforeFiles, ...    │
                │    afterFiles,  ...    │
                │    fallback,    ...    │
                │  }                     │
                └────────────┬───────────┘
                             ▼ next build
                ┌─ .next/routes-manifest.json ─┐
                │  rewrites: {                  │
                │    beforeFiles: [...]         │  ← Next 内部按用户书写顺序写入
                │    afterFiles:  [...]         │
                │    fallback:    [...]         │
                │  }                            │
                └────────────┬──────────────────┘
                             │
       ┌─────────────────────┼─────────────────────┐
       ▼                     ▼                     ▼
   Vercel CLI         OpenNext fork           EdgeOne CLI
(@vercel/next)     (@edgeone/opennextjs    (tef-cli)
                       -pages)
       │                     │                     │
       │                     │                     ▼
       │                     │           需要先经过 opennextjs-pages
       │                     │           生成 ssr-node/config.json
       │                     │                     │
       ▼                     ▼                     ▼
.vercel/output/      ssr-node/config.json    .edgeone/routes.json
config.json          (含完整三段)           (afterFiles+fallback 被重排)
```

---

## 2. Vercel CLI · 不排序，纯透传

### 关键路径

| 步骤 | 文件 / 行号 | 作用 |
|---|---|---|
| 1 | `packages/next/src/index.ts:652` | 调用 `getRoutesManifest()` 读 `.next/routes-manifest.json` |
| 2 | `packages/next/src/index.ts:705-707` | 声明三个桶：<br>`beforeFilesRewrites: Route[] = []`<br>`afterFilesRewrites: Route[] = []`<br>`fallbackRewrites: Route[] = []` |
| 3 | `packages/next/src/index.ts:747-775` | 把每段 `routes-manifest.json` 的对应数组**按下标顺序** `convertRewrites` 后 `push` 进各自桶 |
| 4 | `packages/routing-utils/src/superstatic.ts:168-205` | `convertRewrites = rewrites.map(r => ({ src, dest, check:true, ...has, ...missing, ...status }))` —— **纯 1:1 映射，无 sort** |
| 5 | `packages/next/src/server-build.ts:2475 / 2522 / 2570 / 2572 / 2578` | 把三个桶按固定锚点拼装到最终 routes 数组 |

### 拼装出的 v3 routes 模板

```text
... headers / redirects / middleware ...
...beforeFilesRewrites           ← 阶段 1：filesystem 之前
{ handle: 'filesystem' }         ← 锚点 1
... _next/data 等内置规则 ...
...afterFilesRewrites            ← 阶段 2
{ handle: 'resource' }           ← 锚点 2
...fallbackRewrites              ← 阶段 3
{ src: '.*', status: 404 }
{ handle: 'miss' } / 'hit' / ...
```

### 排序证据

```bash
# 在 vercel/packages/{next,routing-utils} 内全文搜
$ grep -RE "\.sort\(|sortRoutes|orderBy" packages/next/src packages/routing-utils/src
# → 命中 0 处（在 rewrites 调用链内）
```

### 结论

> **三段在 routes-manifest.json 里写的什么顺序，在 v3 routes 里就是什么顺序，不动一根毫毛。**

唯一例外：**`beforeFiles` 段会被打上 `override: true`** 并把 `check: true` 改写为 `continue: true`（`index.ts:756-767`，受 `beforeFilesShouldContinue` gate）——这是**字段层面的差异化处理**，**不是排序**。语义动机：让 beforeFiles 抢在后续 redirects / filesystem 前生效。

---

## 3. OpenNext fork · 不排序，全部硬编码顺序

> 调查的是 `/Users/corbinlin/Project/opennext`，实为 `@edgeone/opennextjs-pages`（OpenNext + Netlify 适配派生 + EdgeOne 改造的一支 fork）。社区主干 `@opennextjs/aws` / `@opennextjs/cloudflare` 是另一种运行时模型，本节结论不要外推。

### 关键路径

| 步骤 | 文件 / 行号 | 作用 |
|---|---|---|
| 1 | `src/build/routes.ts:430` | `createRouteMeta(ctx)` 入口 |
| 2 | `src/build/routes.ts:436` | 通过 `ctx.getRoutesManifest()` 读 manifest |
| 3 | `src/build/routes.ts:413-428` | 注释里把整体顺序写死 |
| 4 | `src/build/routes.ts:482-657` | 严格按上面顺序 `routes.push(...)` |
| 5 | `src/build/route-utils.ts:332-365` | `convertRewrites = list.map(r => ({ src, dest, check:true, has, missing, status }))` —— **同样是纯 map，无 sort** |
| 6 | `src/build/routes.ts:685-699` | 写出 `<serverHandlerDir>/config.json`（`{version:3, routes, framework?}`） |

### 拼装出的 routes 模板（注释原文）

```text
1  _next/static cache headers (continue:true)
2  trailingSlash 规范化
3  headers (continue:true)
4  redirects（过滤 internal）
5  beforeFiles rewrites          ← 在 filesystem 之前
6  RSC 路由
7  404/500 status routes
8  { handle: 'filesystem' }      ← 唯一 handle 锚点
9  afterFiles rewrites           ← filesystem 之后
10 fallback rewrites             ← 紧接其后
11 serverRoutes (SSR/ISR)
12 dynamicRoutes
13 dataRoutes
14 API routes
15 catch-all `^${basePath}/.*$`
```

### 重要说明

- 该 fork **只生成一种 `handle:'filesystem'` 锚点**——v3 spec 里那 6 个 phase（`filesystem/resource/miss/rewrite/hit/error`）在源头就只剩 1 个。**afterFiles / fallback / dynamicRoutes / API / catch-all 全部挤在 filesystem 之后**。
- 运行时不再做阶段判定（`src/run/**` 全文 grep `rewrites|RouteMatcher` 在路由匹配上 0 命中）；解释执行交给 EdgeOne Pages 平台的网关 router。
- `convertRewrites` 仍输出 `check:true`，但平台是否实现该语义本仓库无法验证（疑点见 `REWRITES_ANALYSIS_ISSUES.md`）。

### 结论

> **顺序硬编码、不排序、保留书写顺序。三段就是 5 → 9 → 10 三个固定槽位，filesystem 之前一个槽（beforeFiles）、filesystem 之后两个连续槽（afterFiles → fallback）。**

---

## 4. EdgeOne CLI · 两段式 + 二次排序（行为分叉点）

EdgeOne 走的是**两段流水**：`@edgeone/opennextjs-pages` 先生成 `cloud-functions/ssr-node/config.json`，然后 `tef-cli` 读这份文件、合并成最终 `.edgeone/routes.json`。

```
ssr-node/config.json           ←  opennextjs-pages 写入（与第 3 节相同）
   │
   │   tef-cli 读取
   ▼
extractAdapterRules() 切刀
   │   以第一个 { handle:"filesystem" } 为切点
   │   left  = beforeFilesystem  （= adapter 的 beforeFiles 段）
   │   right = afterFilesystem   （= adapter 的 afterFiles + fallback + dynamic + ...）
   ▼
allRoutes = afterFilesystem
            ├── 每条加 server-name:"ssr-node"
            └── + { src:"/.*", "server-name":"ssr-node" } 兜底
   ▼
sortedOtherRoutes = sortRoutes(allRoutes)   ← ★ 关键的"重排"发生在这里
   ▼
最终 routes.json:
   trailingSlashRoutes
   adapterMiddlewareRoutes              ← beforeFilesystem，原序，不加 server-name
   legacyFilesystemRedirectRoutes
   promotedConfRoutes                   ← edgeone.json 自定义规则
   { handle: "filesystem" }
   sortedOtherRoutes                    ← afterFiles + fallback + dynamic 一锅排序
```

### 关键路径

| 步骤 | 文件 / 行号 | 作用 |
|---|---|---|
| 1 | `src/plugins/pluginResolver.ts:42-46` | 强制注入 `@edgeone/opennextjs-pages` |
| 2 | `src/pages/generate-routes.ts:853` | `generateRoutes()` 入口 |
| 3 | `src/pages/generate-routes.ts:871` | 读 ssr-node/config.json |
| 4 | `src/pages/builder/utils/adapter-rules-handler.ts:12-35` | `extractAdapterRules()` 以第一个 `handle:"filesystem"` 切两段 |
| 5 | `src/pages/generate-routes.ts:703-708` | `addServerNameToRoutes(rs, name)` —— `.map(r => ({ ...r, "server-name": name }))` |
| 6 | `src/pages/generate-routes.ts:971-979` | 把 `afterFilesystem` 全部加 `server-name:"ssr-node"`，进 `allRoutes` |
| 7 | **`src/pages/builder/utils/route-sorter.ts:65-111`** | **`sortRoutes()` —— 这就是"排序"发生地** |
| 8 | `src/pages/generate-routes.ts:1101-1113` | 最终装配 |
| 9 | `src/pages/generate-routes.ts:1163-1206` | 写 `.edgeone/routes.json` |

### `sortRoutes()` 的排序逻辑

`route-sorter.ts:65-111` 的算法（伪代码）：

```ts
function sortRoutes(routes) {
  return routes.sort((a, b) => {
    // 1. 主键：按 matchType 升序
    //    matchType 0 = 精准匹配（如 "/healthz"）
    //    matchType 1 = 单参（如 "/shop/:id"）
    //    matchType 2 = 多段通配（如 "/api/v1/:path*"）
    //    matchType 3 = 全局 catch-all（如 "/.*"）
    const ta = getRouteMatchType(a)
    const tb = getRouteMatchType(b)
    if (ta !== tb) return ta - tb

    // 2. 次键：按 specificity 降序（越具体越前）
    return calculateSpecificity(b) - calculateSpecificity(a)

    // 3. 仅当 matchType=3（catch-all）时还按 server-name 权重区分
    //    edge=2000 > api/ssr=1000 > 其他
  })
}
```

**这意味着**：

```
原写法（next.config.js）:
  afterFiles: [{ source: "/healthz", destination: "/api/health" }]
  fallback:   [{ source: "/.*", destination: "/api/auth/login" }]

ssr-node/config.json 里的顺序（opennextjs-pages 写入）：
  ① /healthz → /api/health           （afterFiles）
  ② /.*       → /api/auth/login      （fallback）

经过 tef-cli sortRoutes 之后（按 matchType + specificity）：
  ① /healthz → /api/health           matchType=0（精准）
  ② /.*       → /api/auth/login      matchType=3（catch-all）

✓ 这种情况下顺序碰巧不变。但是——
```

### 失序反例（理论上可能踩中的坑）

```
若用户写：
  afterFiles: [{ source: "/api/(.*)", destination: "/api/v1/$1" }]   // 通配
  fallback:   [{ source: "/api/health", destination: "/api/down" }]  // 精准

ssr-node/config.json 里的顺序：
  ① /api/(.*)        （afterFiles）
  ② /api/health      （fallback）

经过 sortRoutes 重排后：
  ① /api/health      ← matchType=0,被提前!
  ② /api/(.*)        ← matchType=2

后果：fallback 抢在 afterFiles 之前命中，与 Next.js 语义相反!
       Next 文档承诺：fallback 仅在 afterFiles + dynamic-route 都未命中后才生效。
```

**EdgeOne 的实际表现**会偏离 Vercel / OpenNext / Next dev server 的标准语义。我们项目里 5 个反例（CE1~CE5）目前在 EdgeOne 上**碰巧全绿**，是因为 specificity 排序出来的顺序与 Next.js 语义偶然一致；遇到上述反例就会出问题。

### `beforeFiles` 段的处理（不进 sortRoutes）

`adapterMiddlewareRoutes`（即 beforeFilesystem 段）**整体直接 splice 进最终数组、不进 sortRoutes**——所以 `beforeFiles` 内部书写顺序在 EdgeOne 上**是被严格保留**的，与 Vercel / OpenNext 一致。

### `server-name` 字段

| 段 | 是否注入 server-name |
|---|---|
| `beforeFilesystem` (adapter middleware) | ❌ 不注入（CLI 注释：透传，运行时按 dest 自行解析） |
| `afterFilesystem` (afterFiles + fallback + dynamic) | ✅ 全部 `server-name: "ssr-node"` |
| catch-all `/.*` | ✅ `server-name: "ssr-node"` |

### 结论

> **EdgeOne CLI 是三家里唯一对 rewrites 做排序的实现：`beforeFiles` 段保留原顺序、不加 server-name；`afterFiles` + `fallback` 被合并到一池、加 server-name、按 matchType + specificity 重排——这破坏了 Next.js 文档承诺的"fallback 严格晚于 afterFiles"语义。**

---

## 5. 三家对比矩阵

| 维度 | Vercel CLI | OpenNext fork (`@edgeone/opennextjs-pages`) | EdgeOne CLI (`tef-cli`) |
|---|---|---|---|
| 是否复用 Vercel adapter | — | 内化了 `@vercel/routing-utils/superstatic.ts` | 不复用，依赖 OpenNext fork |
| 是否解析 routes-manifest | ✅ | ✅ | ❌（间接，透过 OpenNext fork） |
| `convertRewrites` 是否排序 | ❌ map only | ❌ map only | ❌ map only |
| 三段是否有显式 sort 步骤 | ❌ | ❌ | ⚠️ `afterFiles+fallback` 进 `sortRoutes` |
| `beforeFiles` 顺序保留 | ✅ | ✅ | ✅ |
| `afterFiles` 顺序保留 | ✅ | ✅ | ❌（按 specificity 重排） |
| `fallback` 顺序保留 | ✅ | ✅ | ❌（与 afterFiles 混排） |
| handle phase 完整 | 6 个全有 | 仅 `filesystem` | 仅 `filesystem` |
| `beforeFiles` 是否加 `override:true` | ✅ | ❌ | ❌ |
| 是否给 ssr-node 路由打 `server-name` | ❌ | ❌ | ✅ |
| catch-all 兜底 | ✅ `{src:".*", status:404}` | ✅ `^${basePath}/.*$` | ✅ `{src:"/.*", "server-name":"ssr-node"}` |

---

## 6. 用我们项目当佐证

把项目编译产物拉出来对照：

```bash
# Vercel：beforeFiles / afterFiles / fallback 的相对顺序
$ jq '.routes' .vercel/output/config.json | grep -nE '"src"|"handle"' | head
# 看到 BR1~BR4 全部在 handle:"filesystem" 之前
# AR1~AR4 在 filesystem 之后、resource 之前
# FR1 在 resource 之后

# EdgeOne：beforeFiles 仍在 filesystem 之前
$ jq '.routes' .edgeone/routes.json | grep -nE '"src"|"handle"'
# 但 filesystem 之后那一段顺序是：
#   /healthz   (AR1, matchType=0)       ← 精准
#   /status    (AR2, matchType=0)       ← 精准
#   /shop/:id  (AR3, matchType=1)       ← 单参
#   /echo-it   (AR4, matchType=0)       ← 精准（注意它本来在 AR3 之后,被 sortRoutes 提前）
#   /proxy/posts/:id (FR1, matchType=1) ← 单参
#   /.*        (catch-all, matchType=3)
# 实际产物里 AR3/AR4 的相对顺序确实和 next.config.js 里写的不一样!
```

我们前面在 `.edgeone/routes.json` 里观察到的"AR3/AR4 顺序对调"现象，**就是 sortRoutes 在按 matchType + specificity 重排留下的痕迹**。

---

## 7. 实操建议

### 给应用开发者

如果你的 `next.config.js` 里 `afterFiles` 与 `fallback` **并不依赖严格的相对顺序**（例如 source 互相没有交集），三家行为等价，安全。

如果你**故意**依赖以下任一假设，请避开 EdgeOne 部署或写自动化测试加以验证：

1. "fallback 一定在 afterFiles 之后"
2. "同段内规则按书写顺序匹配"
3. "更通用的 source 写在更精准的 source 之后兜底"

### 给 adapter 作者

EdgeOne CLI 的 `sortRoutes` 是出于"按 specificity 排序减少误命中"的善意，但与 v3 spec 规定的"按声明顺序"原则相违背。如果要修正：

- 选项 A：跳过 sortRoutes 直接透传 OpenNext 输出的顺序（最小改动）
- 选项 B：把 `afterFiles` 与 `fallback` 在传入 sortRoutes 前**分别**打上 stable bucket 标记，确保 fallback 段永远排在 afterFiles 段之后
- 选项 C：把这一行为做成可配置开关

---

## 8. 一句话总结

> **三家 adapter 在编译期都不对单条 rewrite 重新排序，三段相对位置也都是按 v3 spec（或其子集）固定锚点摆放——但 EdgeOne CLI 在最后一步对 `afterFiles + fallback` 段额外执行了一次 `sortRoutes(matchType + specificity)`，是 Vercel / OpenNext / Next dev 的"严格按用户书写顺序"语义在 EdgeOne 上的唯一变种，会在 fallback specificity 高于 afterFiles 时导致命中错位。**

---

## 附录：复现命令

```bash
cd next-config-test

# Vercel v3 产物
mkdir -p .vercel
cat > .vercel/project.json <<'EOF'
{ "projectId": "prj_local_inspection", "orgId": "team_local",
  "settings": { "framework": "nextjs" } }
EOF
npx vercel@latest build --prod --yes
jq '.routes' .vercel/output/config.json | head -100

# Next 中间形态
jq '.rewrites' .next/routes-manifest.json

# EdgeOne 产物（部署后由远端 CLI 生成,本地复现要装 tef-cli）
jq '.routes' .edgeone/routes.json | head -100
diff <(jq -S .routes .edgeone/routes.json) \
     <(jq -S .routes .edgeone/cloud-functions/ssr-node/config.json) | head -40
```
