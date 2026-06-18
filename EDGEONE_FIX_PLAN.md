# EdgeOne 与 Vercel 对齐修复方案

> 基于本项目 [`probe-env.mjs`](./probe-env.mjs) 在 next start / Vercel / EdgeOne 三环境实测出的 3 个真实分歧，给出 EdgeOne CLI / 边缘 router 的对齐修复方案。
>
> 实测数据来源见 [`VALIDATION_PLAN.md`](./VALIDATION_PLAN.md)。
>
> 涉及代码: `/Users/corbinlin/Project/ef-dev-tools/packages/tef-cli`（EdgeOne CLI）+ EdgeOne Pages 边缘 router（运行时）。

---

## 0. 修复优先级总表

| 分歧 | 严重度 | 修复位置 | 修复难度 | 推荐处理 |
|---|---|---|---|---|
| **CE6** afterFiles 段被 sortRoutes 重排到 fallback 段之后 | 🔴 高 — 直接破坏 Next 文档承诺 | tef-cli | ⭐ 简单 | **立刻修** |
| **SIBLING** afterFiles 在 Edge function 之前评估（与 Vercel 相反） | 🟡 中 — 与 Vercel 不一致但更接近 spec | 边缘 router 或 tef-cli | ⭐⭐ 中等 | 先文档化,再决定方向 |
| **AR4** rewrite destination 已带 query 时丢弃原 query | 🟡 中 — 偏离 Next 标准但可观察 | 边缘 router | ⭐⭐⭐ 复杂 | runtime 侧修 |

---

## 1. CE6 修复方案 — sortRoutes 破坏书写顺序

### 当前 bug 重现

实测请求 `/api/ce6/keep`：

| 环境 | 命中 | 结果 |
|---|---|---|
| next start | afterFiles `/api/ce6/:path*` 通配 | `action:"please-login"` ✓ |
| Vercel | 同上 | `action:"please-login"` ✓ |
| **EdgeOne** | **fallback `/api/ce6/keep` 精准** | `endpoint:"/api/health"` ✗ |

### 根因（已源码定位）

`tef-cli/src/pages/builder/utils/route-sorter.ts:65-111` 的 `sortRoutes` 函数把 OpenNext fork 已经按 Next 写盘顺序排好的 `afterFilesystem` 段（含 afterFiles + fallback + dynamic + apiRoutes）一锅端按 `matchType + specificity` 重排：

```ts
// route-sorter.ts (现行代码)
export function sortRoutes(routes: any[]): any[] {
  return [...routes].sort((a, b) => {
    const matchTypeA = getRouteMatchType(srcA);  // 0=精准 1=单段 2=多段 3=catch-all
    const matchTypeB = getRouteMatchType(srcB);
    if (matchTypeA !== matchTypeB) return matchTypeA - matchTypeB;
    // ... 同级别按 specificity 降序
  });
}
```

调用点 `tef-cli/src/pages/generate-routes.ts:895`：

```ts
// 当前实现:把 afterFilesystem 整段 + catchall 一起送进 sortRoutes
const routesToSort = [
  ...allRoutes.filter(r => !isPureDynamicRoutes(r)),     // ← 内含 afterFiles + fallback + dynamic
  ...(hasServerHandler ? [{ src: '/.*', 'server-name': 'ssr-node' }] : []),
];
const sortedOtherRoutes = sortRoutes(routesToSort);      // ★ BUG 发生地
```

### 修复方案 A · 直接去掉 sortRoutes（推荐，最小变更）

```diff
- const routesToSort = [
-   ...allRoutes.filter(route => !isPureDynamicRoutes(route)),
-   ...(hasServerHandler ? [{ src: '/.*', 'server-name': 'ssr-node' }] : []),
- ];
- const sortedOtherRoutes = sortRoutes(routesToSort);
+ // OpenNext fork 写出的 afterFilesystem 段顺序 (afterFiles → fallback → dynamic → apiRoutes)
+ // 已经符合 Next.js 书写顺序契约,不再做二次排序。
+ const sortedOtherRoutes = [
+   ...allRoutes.filter(route => !isPureDynamicRoutes(route)),
+   ...(hasServerHandler ? [{ src: '/.*', 'server-name': 'ssr-node' }] : []),
+ ];
```

**效果**：CE6 立刻通过，对齐 Vercel/Next。

**风险评估**：
- 失去"通配规则可能误匹配精准规则"的自动保护——但这本来就是 Next 的设计预期（声明顺序 = 用户责任）
- 历史用户如果**依赖** sortRoutes 自动重排，他们的项目可能行为变化——但这种"依赖"本身是错的，他们的项目在迁到 Vercel 时也会翻车

**兼容路径**：可以在 tef-cli 加一行 deprecation warning，过渡期保留 `sortRoutes` 但默认关闭：
```ts
if (process.env.TEF_LEGACY_SORT_ROUTES === '1') {
  console.warn('[tef] sortRoutes is enabled via TEF_LEGACY_SORT_ROUTES. ' +
               'This breaks Next.js declaration-order semantics; remove ASAP.');
  return sortRoutes(routes);
}
```

### 修复方案 B · 分桶后再排（保留 sortRoutes 价值）

如果 EdgeOne 团队认为 sortRoutes 在某些场景下仍有价值（比如多个 builder 合并时的去重），可以**只在桶内排，桶间顺序固定**：

需要先在 `extractAdapterRules` 把 `afterFilesystem` 按 OpenNext fork 的写盘顺序切成 4 段。

```ts
// adapter-rules-handler.ts (新增 extractDetailedAdapterRules)
export function extractDetailedAdapterRules(config: { routes: any[] }): {
  beforeFilesystem: any[];   // before filesystem marker
  afterFiles:       any[];   // 紧跟 filesystem 之后,有 dest+check 的 rewrite
  fallback:         any[];   // 含外部 URL 或 dest 但 src 不像动态路由的
  dynamic:          any[];   // 静态/动态 page/route handler 触发器
  catchall:         any[];   // 最末尾的 ^/.*$ 兜底
} {
  // OpenNext fork 写盘顺序:
  //   filesystem boundary
  //   → afterFiles rewrites (dest + check, src 来自用户 next.config 的 source)
  //   → fallback rewrites (dest + check, dest 可能是绝对 URL)
  //   → serverRoutes / dynamicRoutes / dataRoutes / apiRoutes (src + 可能无 dest)
  //   → catchall ^/.*$
  //
  // 用 heuristic 切分:
  //   - 第一组连续的 dest+check 条目 = afterFiles (直到遇到不像 afterFiles 的)
  //   - 紧接其后的 dest+check 条目(其 dest 含 :// 或与 next.config fallback 匹配) = fallback
  //   - 之后的 dest 不带 check 或仅 src = dynamic 路由触发器
  //   - 最后的 ^/.*$ = catchall
  ...
}
```

调用方改造：

```ts
// generate-routes.ts (改造后)
const detailed = extractDetailedAdapterRules(serverHandlerConfig);

// 桶内排,桶间顺序固定
const sortedRoutes = [
  ...trailingSlashRoutes,
  ...detailed.beforeFilesystem,                                    // 1. beforeFiles 段(原序)
  ...legacyFilesystemRedirectRoutes,
  ...assetsRules,                                                  // 2. handle:filesystem
  ...sortRoutes(detailed.afterFiles.map(addServerName)),           // 3. afterFiles(可桶内排)
  ...sortRoutes(detailed.dynamic.map(addServerName)),              // 4. dynamic
  ...sortRoutes(detailed.fallback.map(addServerName)),             // 5. fallback (永远在 dynamic 后)
  ...detailed.catchall.map(addServerName),                         // 6. catchall
  ...(hasServerHandler ? [{ src: '/.*', 'server-name': 'ssr-node' }] : []),
];
```

**效果**：CE6 通过 + 保留每桶内的优化排序。

**代价**：需要在 OpenNext fork 输出和 tef-cli 之间约定段标识。最稳的做法是让 OpenNext fork 输出元数据（见方案 C）。

### 修复方案 C · 在 OpenNext fork 端加段标记（最彻底）

修改 `@edgeone/opennextjs-pages` 的 `routes.ts`，让它在 ssr-node/config.json 里多写一个元数据字段：

```jsonc
// .edgeone/cloud-functions/ssr-node/config.json (改造后)
{
  "version": 3,
  "routes": [...],
  "tef": {
    "phaseMarkers": {
      "beforeFiles":  [0, 7],     // routes[0..7] 是 beforeFiles 段
      "filesystem":   8,           // routes[8] 是 handle:filesystem
      "afterFiles":   [9, 12],     // routes[9..12] 是 afterFiles
      "fallback":     [13, 14],    // routes[13..14] 是 fallback
      "dynamic":      [15, 30],
      "catchall":     31
    }
  }
}
```

这样 tef-cli 不需要 heuristic 切分,直接读 phaseMarkers。

**优点**:稳定、明确、未来 Next 加新 phase 也兼容。
**缺点**:需要改 OpenNext fork (跨仓库改动)。

### 推荐路径

> **短期**：方案 A（最小、最快）
>
> **长期**：方案 C（最稳、与 spec 演进对齐）

---

## 2. SIBLING 修复方案 — afterFiles vs Edge static function

### 当前差异

实测请求 `/api/sibling/edge`（同时有 Edge static handler + afterFiles rewrite 指向同一 path）：

| 环境 | 谁赢 |
|---|---|
| next start | Edge function 优先 |
| Vercel | Edge function 优先 |
| **EdgeOne** | **afterFiles 优先** |

注意这里 EdgeOne 反而**更接近 v3 spec 字面**——v3 spec 文档说 afterFiles 在 `handle:"filesystem"` 与 `handle:"resource"` 之间，而 Edge function 是在 `handle:"resource"` 才被查找。

但 Vercel 实际实现把 functions 当作 filesystem 一部分查（"static functions"），所以 functions 总能抢在 afterFiles 之前。

### 根因（双方都"对"，只是选择不同）

| 实现 | functions 查找时机 |
|---|---|
| Vercel 边缘 router | `handle:"filesystem"` 阶段同时查 static/ 与 functions/ 的精准命中 |
| EdgeOne 边缘 router | `handle:"filesystem"` 仅查 static/，functions/ 在 `handle:"resource"` 才查 |

EdgeOne 的实现严格按 spec 文字描述。Vercel 是"实现优化"——把 functions 当作 filesystem 一部分能减少 phase 切换开销。

### 修复方案 A · runtime 改造（最干净，不在 CLI 范围）

让 EdgeOne 边缘 router 在 `handle:"filesystem"` 阶段同时检查 functions/ 目录：

```
handle:"filesystem"  →  并发查找 static/ 与 functions/
                          static 命中 → 服务文件 → handle:"hit"
                          function 命中 → 调用函数 → handle:"hit"
                          都没命中 → 继续到下一段(afterFiles)
```

这是 Vercel 的实际行为。需要 EdgeOne Pages 团队改运行时 router。

### 修复方案 B · CLI 端 workaround（在 routes.json 里显式插入函数路由）

让 tef-cli 在 `handle:"filesystem"` 之后、afterFiles 之前**显式插入**所有 functions 的精准命中规则：

```diff
sortedRoutes:
  ...trailingSlashRoutes
  ...adapterMiddlewareRoutes        // beforeFiles
  ...legacyFilesystemRedirectRoutes
  ...assetsRules                     // [{ handle: 'filesystem' }]
+ // 显式插入 functions 精准命中规则,模拟 Vercel "functions 也算 filesystem" 的行为
+ ...detailed.staticFunctionRoutes   // ← 新增:每个非动态函数一条 { src: '^/api/foo$', server-name: 'ssr-node' }
  ...sortRoutes(detailed.afterFiles.map(addServerName))
  ...
```

需要在 `extractDetailedAdapterRules` 里识别"哪些 routes 对应静态函数":

```ts
// 静态函数特征:有 src 但 src 完全是字面量(无正则元字符 [.*+?{}|()])、
// 没有 dest、没有 status、没有 headers,通常带 server-name
function isStaticFunctionRoute(route: any): boolean {
  if (!route.src || route.dest || route.status || route.headers) return false;
  // 简化:src 没有正则元字符
  return !/[.*+?{}|()\\^$\[\]]/.test(route.src.replace(/^[\^]|\$$/g, ''));
}
```

实际操作时，tef-cli 还可以直接遍历 `.edgeone/cloud-functions/ssr-node/index.mjs` / functions 目录，把每个真实的 function path 提出来生成对应路由。

**优点**：纯 CLI 改动，不需要 EdgeOne runtime 改造。

**缺点**：
- routes.json 体积增大（每个静态函数多一条）
- 与 Vercel 的"语义级"对齐不完全等价（边角情况可能漏，比如带 base path / locale 的）

### 推荐路径

> **首选**：方案 A（runtime 改造）— 与 Vercel 完全语义对齐
> **过渡**：方案 B（CLI 显式注入）— 在 runtime 改造前先把行为追平,降低用户感知差异

文档化建议（无论选哪条）：在 EdgeOne docs 显式声明此与 Vercel 的差异，列出影响场景（"如果你的 afterFiles source 与某个静态 route handler 同名，EdgeOne 上 afterFiles 会赢，Vercel 上 handler 会赢"）。

---

## 3. AR4 修复方案 — destination query 透传

### 当前差异

实测请求 `/echo-it?msg=hi`，rewrite 配置 `{ source: '/echo-it', destination: '/api/echo?from=alias' }`：

| 环境 | 实际 query | 含义 |
|---|---|---|
| next start | `{msg:"hi"}` | request.url 是客户端原 URL,destination 注入不可见 |
| Vercel | `{from:"alias", msg:"hi"}` | 注入+透传(完整 spec) |
| **EdgeOne** | **`{from:"alias"}`** | **注入但丢失原 query** |

按 Next 文档：`When a destination URL has a query string, the user's query will be appended to it`，所以 Vercel 的"注入+透传"是规范行为。

### 根因

EdgeOne 边缘 router 在执行 rewrite 时，对 `dest` 字段处理：

```
当前:
  原 path = /echo-it?msg=hi
  dest    = /api/echo?from=alias
  → 直接替换为 /api/echo?from=alias  (覆盖原 query)

正确:
  原 path = /echo-it?msg=hi  →  原 query = "msg=hi"
  dest    = /api/echo?from=alias  →  dest path = "/api/echo", dest query = "from=alias"
  → 合并: /api/echo?from=alias&msg=hi  (dest query 在前,原 query 追加)
```

### 修复方案 A · runtime 改造（推荐）

让 EdgeOne 边缘 router 改写 dest 时按 [vercel/routing-utils 的合并语义](https://github.com/vercel/vercel/blob/main/packages/routing-utils/src/superstatic.ts) 处理：

```ts
function applyRewrite(originalUrl: URL, dest: string): URL {
  const next = new URL(dest, originalUrl);
  // 把原 URL 的 query 追加到 dest query 后(原 dest 同名 key 优先)
  for (const [k, v] of originalUrl.searchParams.entries()) {
    if (!next.searchParams.has(k)) {
      next.searchParams.append(k, v);
    }
  }
  return next;
}
```

### 修复方案 B · CLI 端 workaround（不推荐，但可行）

tef-cli 可以把所有 `destination` 含 query 的 rewrite 改写成显式合并形式：

```diff
- { source: '/echo-it', destination: '/api/echo?from=alias' }
+ { source: '/echo-it', destination: '/api/echo?from=alias&__merge_original_query=1' }
```

然后 EdgeOne 边缘 router 看到 `__merge_original_query=1` 时执行合并。

**这是 hack**，要求 runtime 也协作。不推荐。

### 推荐路径

> **唯一路径**: 方案 A — 这是 runtime 行为问题，必须在 runtime 修

CLI 端**无法**单独修复此问题。只能等 EdgeOne 边缘 router 改进。

---

## 4. 修复优先级建议

```
   ┌─────────────────────────────────────────┐
   │ 立刻修(本周)                            │
   ├─────────────────────────────────────────┤
   │ CE6 方案 A: 去掉 sortRoutes             │  影响小,变更小,效果立竿见影
   └─────────────────────────────────────────┘

   ┌─────────────────────────────────────────┐
   │ 短期(本月)                              │
   ├─────────────────────────────────────────┤
   │ SIBLING 文档化                          │  在 EdgeOne docs 声明此差异
   │ AR4 文档化                              │
   └─────────────────────────────────────────┘

   ┌─────────────────────────────────────────┐
   │ 中期(下季度)                            │
   ├─────────────────────────────────────────┤
   │ AR4 方案 A: runtime 边缘 router 修      │
   │ SIBLING 方案 B: CLI 显式注入函数路由    │  (临时方案,直到 runtime 对齐)
   │ CE6 方案 C: OpenNext fork 加段标记      │  (在方案 A 上的进一步加固)
   └─────────────────────────────────────────┘

   ┌─────────────────────────────────────────┐
   │ 长期                                    │
   ├─────────────────────────────────────────┤
   │ SIBLING 方案 A: runtime 边缘 router 改  │  让 functions 算 filesystem 一部分
   │ 完整 v3 phase 支持                      │  resource/miss/rewrite/hit/error
   └─────────────────────────────────────────┘
```

---

## 5. 验证修复有效性

修复后跑这个项目的 probe，三家应该全绿：

```bash
git clone git@github.com:clumsy-goose/next-config-test.git
cd next-config-test
npm install

# 部署/起服务后
node probe-env.mjs \
  http://localhost:3010 \
  https://next-config-test.vercel.app \
  https://next-config-test-zyvpp6jk.edgeone.cool

# 修复成功的标志:
#   "全部 3 个环境签名一致"  exit code 0
```

具体每个分歧的预期行为：

```
CE6:     all 3 → afterFiles 段优先  ✓
SIBLING: all 3 → Edge function 优先 ✓ (如选 SIBLING 方案 A)
                 OR all 3 → afterFiles 优先 (如全部对齐到 EdgeOne)
AR4:     all 3 → 注入+透传            ✓
```

---

## 6. 给 EdgeOne 团队的最小可行 PR（pseudo-patch）

```diff
diff --git a/packages/tef-cli/src/pages/generate-routes.ts b/packages/tef-cli/src/pages/generate-routes.ts
index xxx..yyy 100644
--- a/packages/tef-cli/src/pages/generate-routes.ts
+++ b/packages/tef-cli/src/pages/generate-routes.ts
@@ -891,11 +891,16 @@ export async function generateRoutes(...) {
     const hasServerHandler = ...;
 
-    const routesToSort = [
-      ...allRoutes.filter(route => !isPureDynamicRoutes(route)),
-      ...(hasServerHandler ? [{ src: '/.*', 'server-name': 'ssr-node' }] : []),
-    ];
-    const sortedOtherRoutes = sortRoutes(routesToSort);
+    // OpenNext fork 写出的 afterFilesystem 段顺序
+    // (afterFiles → fallback → dynamic → apiRoutes) 已经符合 Next.js 书写顺序契约。
+    // 不再做二次排序,以避免破坏 fallback 必须晚于 afterFiles 的语义。
+    // 历史上 sortRoutes 出于"按 specificity 排序减少误命中"的善意而存在,
+    // 但这违反 Next 文档承诺。如需临时回滚,设 TEF_LEGACY_SORT_ROUTES=1。
+    const baseRoutes = allRoutes.filter(route => !isPureDynamicRoutes(route));
+    const catchallRoute = hasServerHandler ? [{ src: '/.*', 'server-name': 'ssr-node' }] : [];
+    const sortedOtherRoutes = process.env.TEF_LEGACY_SORT_ROUTES === '1'
+      ? sortRoutes([...baseRoutes, ...catchallRoute])
+      : [...baseRoutes, ...catchallRoute];
+
     const sortedRoutes = [
       ...trailingSlashRoutes,
       ...adapterMiddlewareRoutes,
```

附带 changelog 条目：

```markdown
## tef-cli vNEXT
### Fixed
- **Route ordering**: removed `sortRoutes()` from the post-filesystem segment.
  Previously, `afterFiles` and `fallback` rewrites were re-ordered by route
  specificity, which violated Next.js documented "rewrites are checked in
  the order they're defined" contract and caused fallback rules to fire
  before afterFiles rules in some configurations.
  [Restore old behavior with `TEF_LEGACY_SORT_ROUTES=1`.]

### Verification
- See `next-config-test` upstream test suite for reproducer (CE6 case).
- Probe `node probe-env.mjs` should now report identical signatures across
  next start / Vercel / EdgeOne for the CE6 probe.
```

---

## 7. 不在 CLI 范围的修复（runtime 侧建议）

EdgeOne Pages 边缘 router 实现层需要改的两个点（无法只动 CLI）：

### 7.1 SIBLING — functions 加入 filesystem 阶段查找

```pseudo
// 当前:
on handle:"filesystem":
  if (file in static/) → serve, jump to hit phase
  else → fall through to next route entry (afterFiles 等)
on handle:"resource":
  if (function in functions/) → invoke

// 改为:
on handle:"filesystem":
  if (file in static/) → serve
  else if (function in functions/ && exact match) → invoke
  else → fall through
```

### 7.2 AR4 — rewrite destination query 合并

```pseudo
// 当前:
applyRewrite(req, route):
  newUrl = parse(route.dest)         // dest = "/api/echo?from=alias"
  return newUrl                       // 丢失原 query

// 改为:
applyRewrite(req, route):
  newUrl = parse(route.dest, req.url)
  for (k, v) in req.url.searchParams:
    if (!newUrl.searchParams.has(k))
      newUrl.searchParams.append(k, v)
  return newUrl
```

---

## 8. 一句话总结

> **EdgeOne 与 Vercel 对齐三件事按优先级**：
>
> 1. **CE6 (sortRoutes 重排) — CLI 一行改动就能修**，立刻动；
> 2. **SIBLING (functions 优先级) — 短期文档化、长期 runtime 改造**；
> 3. **AR4 (destination query 合并) — 必须 runtime 修，CLI 无能为力**。
>
> 修完后跑 `node probe-env.mjs <三个URL>` 应该看到 "全部 3 个环境签名一致"。
