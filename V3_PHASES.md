# V3 Routing Phase Model

> Vercel Build Output API v3 把"请求路由"建模成一台状态机。
> 本文用本项目实际编译产物（`.vercel/output/config.json`）解释 6 个 `handle` phase
> 的触发时机、可写规则、跳转关系。
>
> 复现命令（无须部署）：
>
> ```bash
> mkdir -p .vercel
> cat > .vercel/project.json <<'EOF'
> { "projectId": "prj_local_inspection", "orgId": "team_local",
>   "settings": { "framework": "nextjs" } }
> EOF
> npx vercel@latest build --prod --yes
> jq '.routes[] | select(.handle != null)' .vercel/output/config.json
> ```

---

## 1. 6 个 phase 速查

```bash
$ jq '.routes[] | select(.handle != null)' .vercel/output/config.json
{ "handle": "filesystem" }
{ "handle": "resource" }
{ "handle": "miss" }
{ "handle": "rewrite" }
{ "handle": "hit" }
{ "handle": "error" }
```

| phase | 中文角色 | 何时被激活 | 用户能写吗 |
|---|---|---|---|
| *(初始段，无 phase)* | "请求一进来" | 永远第一时间执行 | ✅ headers / redirects / rewrites.beforeFiles |
| `filesystem` | "去 `static/` 找文件" | 初始段执行完 | ❌ 仅作状态切换 |
| `resource` | "去 `functions/` 找端点" | filesystem 没命中 | ❌ 仅作状态切换 |
| `miss` | "彻底找不到了" | filesystem + resource 都 miss | ❌ 框架专用 |
| `rewrite` | "刚 rewrite 过" | 任意 `check:true` rewrite 改写后 | ❌ 框架专用 |
| `hit` | "文件 / 函数已命中" | filesystem 或 resource 命中后、响应发出前 | ❌ 框架专用 |
| `error` | "处理过程出异常" | 任意 phase throw / 404 | ❌ 框架专用 |

> 关键：`handle: ...` **本身不匹配任何请求**——它是状态切换标记。`routes` 数组被这 6 个标记切成 7 段，router 根据状态机当前状态跳到对应段执行。

---

## 2. 执行模型（状态机）

```
                           请求到达边缘 router
                                   │
                    ┌──────────────▼──────────────┐
                    │   ① 初始段 (无 phase)        │
                    │   按顺序匹配每条 route       │
                    │     - status 3xx → 直接返回 │
                    │     - dest + check:true     │
                    │       → 改 path,回到顶端再走│
                    │     - continue:true         │
                    │       → 注入头,继续往下    │
                    └──────────────┬──────────────┘
                                   │
                       遇到 { "handle": "filesystem" }
                                   │
                    ┌──────────────▼──────────────┐
                    │   ② 真实查 static/ 目录     │
                    └──────┬───────────────┬──────┘
                           │               │
                    命中静态文件        没命中
                           │               │
                    ┌──────▼─────┐  ┌──────▼─────────────────┐
                    │ ⑥ HIT 段   │  │ filesystem~resource    │
                    │ 叠 cache 头│  │  之间的 routes 继续匹配 │
                    │ 然后送出   │  │  (afterFiles rewrites  │
                    │ 文件       │  │   也住在这里)           │
                    └──────┬─────┘  └──────┬─────────────────┘
                           │               │
                           │   遇到 { "handle": "resource" }
                           │               │
                           │        ┌──────▼──────┐
                           │        │ ③ 查动态资源 │
                           │        │ functions/  │
                           │        └──┬───────┬──┘
                           │           │       │
                           │    命中函数    没命中
                           │           │       │
                           │           │   resource~miss
                           │           │   之间继续 (fallback
                           │           │   rewrite + catch-all)
                           │           │       │
                           │           │   遇到 { "handle": "miss" }
                           │           │       │
                           │      ┌────▼─┐ ┌───▼────────┐
                           │      │ ⑥ HIT│ │ ④ MISS 段  │
                           │      └──┬───┘ │ 404 / 兜底 │
                           │         │     └────────────┘
                           ▼         ▼
                          回响应给客户端

                     ─────────────────────────
                    任何阶段触发 rewrite (check:true) ──┐
                                                       ▼
                              ┌──── ⑤ REWRITE 段 ───┐
                              │  对新 path 做清理   │
                              │  (动态参数还原 …)   │
                              └─────────┬───────────┘
                                        │
                              重新从 ① 走

                     ─────────────────────────
                    任何阶段抛异常 ──→ ⑦ ERROR 段
                                       (兜底到错误页)
```

---

## 3. 逐段详解（用本项目产物作证）

### 3.1 初始段（无 `handle`）

> "请求一进来就跑的规则"。`next.config.js` 里的 `headers()` / `redirects()` /
> `rewrites().beforeFiles` 全部下沉到这里，外加若干系统规则。

实际产物（节选）：

```jsonc
[
  // 系统：尾斜杠 308 redirect
  { "src": "^(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))/$",
    "headers": { "Location": "/$1" }, "status": 308 },

  // 系统：拦截 _next/__private/trace
  { "src": "/_next/__private/trace", "dest": "/404", "status": 404 },

  // 用户 H1：全站安全头 (continue:true 让匹配继续)
  { "src": "^/(?:/)?$",
    "headers": {
      "X-Powered-By-Test": "next-config-test",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
    },
    "continue": true },

  // 用户 H4：仅 /api/headers 注入业务头
  { "src": "^/api/headers(?:/)?$",
    "headers": { "X-Endpoint": "headers-inspector",
                 "Cache-Control": "no-store",
                 "X-Custom-Trace-Id": "trace-static-001" },
    "continue": true },

  // 用户 R1：/home → / (308)
  { "src": "^(?!/_next)/home(?:/)?$",
    "headers": { "Location": "/" }, "status": 308 },

  // 用户 BR1：beforeFiles rewrite 剥版本前缀
  { "src": "^/api/v1(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))?(?:/)?$",
    "dest": "/api/$1",
    "check": true },

  // ...
]
```

**特征：**

- `status: 3xx` 类规则 terminate 整个匹配（redirect）
- `continue: true` 类只注入头/小修改，不打断匹配（headers）
- `dest + check: true` 改完路径后**回到顶端**重走（rewrite）

---

### 3.2 `handle: "filesystem"` ── 触发文件系统查找

```jsonc
{ "handle": "filesystem" }
```

router 看到此标记后：

1. 拼出实际路径，去 `.vercel/output/static/` 下查文件。
2. 找到 → 跳到 `handle: "hit"` 段。
3. 没找到 → 进入 filesystem~resource 之间那一段。

本项目 `static/` 内容：

```
.vercel/output/static/
├── index.html              ← 渲染 /
├── ssg.html                ← 渲染 /ssg
├── csr.html                ← 渲染 /csr
├── 404.html / 500.html
└── _next/static/...        ← 构建产物 chunk
```

> 注意：`/ssr` `/isr` `/api/*` 不在 `static/`——它们是 functions，要走到 `resource` 段才会被找到。

---

### 3.3 filesystem ~ resource 之间

> "filesystem 已经 miss，但还没切到 resource 状态——这一段路由再 try 一次"

```jsonc
// 系统：app router 的 .action / .rsc 资源处理
{ "src": "/index(\\.action|\\.rsc)", "dest": "/index", ... }
{ "src": "/_next/data/(.*)", "dest": "/_next/data/$1" }

// 用户 afterFiles rewrites (AR1~AR4)
// 注意：Vercel 自动给每条加了 (?<rscsuff>\\.rsc)? 命名捕获
// 这样 /healthz.rsc (RSC payload 预取) 也能正确转发到 /api/health.rsc
{ "src": "^/healthz(?:/)?(?<rscsuff>\\.rsc)?$",
  "dest": "/api/health$1", "check": true }
{ "src": "^/status(?:/)?(?<rscsuff>\\.rsc)?$",
  "dest": "/api/v2/status$1", "check": true }
{ "src": "^/shop(?:/(\\d{1,}))(?:/)?(?<rscsuff>\\.rsc)?$",
  "dest": "/api/products/$1$2", "check": true }
{ "src": "^/echo-it(?:/)?(?<rscsuff>\\.rsc)?$",
  "dest": "/api/echo$1?from=alias", "check": true }
```

这是 **`rewrites().afterFiles`** 的物理位置。这些 rewrite 只在 `static/` 没接住后才生效，一旦命中又带 `check: true`，就回到状态机起点重走。

---

### 3.4 `handle: "resource"` ── 触发动态资源查找

```jsonc
{ "handle": "resource" }
```

router 看到此标记后：

1. 拿当前 path 去 `.vercel/output/functions/` 下匹配 `.func` 包。
2. 命中 → 调用函数 → 跳到 `handle: "hit"` 段。
3. 没命中 → 进入 resource~miss 之间那一段。

本项目 `functions/` 包（节选）：

```
functions/
├── index.func/                ← /
├── ssr.func/                  ← /ssr (force-dynamic)
├── isr.func/                  ← /isr (revalidate=10)
├── csr.func/                  ← /csr (因含 'use client' 也得动态)
├── api/health.func/
├── api/products/[id].func/    ← 动态路由
└── ... (每个端点一个 .func + 对应 .rsc.func)
```

---

### 3.5 resource ~ miss 之间

> "filesystem 与 resource 都 miss，最后的求生段"

```jsonc
// 用户 fallback rewrite (FR1)
{ "src": "^/proxy/posts(?:/(\\d{1,}))$",
  "dest": "https://jsonplaceholder.typicode.com/posts/$1",
  "check": true }

// 系统 catch-all
{ "src": "/.*", "status": 404 }
```

这是 **`rewrites().fallback`** 的物理位置。也是反向代理外部 origin 的常用落点（FR1）。能落到这一段的请求只剩两条出路：被反代到外部、或落 404。

---

### 3.6 `handle: "miss"`

> "filesystem 已经判定 miss，给我们这段路由再清理一下"

本项目内容：

```jsonc
{ "handle": "miss" }

// 系统：_next/static 缺失时返回 404
{ "src": "/_next/static/.+",
  "status": 404,
  "check": true }
```

意义：访问不存在的 `_next/static/xxx.js` 时，明确返回 404 而不是兜底跑 SSR。

---

### 3.7 `handle: "rewrite"` ── 路径改写后的清理段

> "刚刚发生过 rewrite，新 path 需要再清洗一遍"

本项目内容：

```jsonc
{ "handle": "rewrite" }

// 系统：把 /_next/data/ 内部映射
{ "src": "/_next/data/(.*)", "dest": "/_next/data/$1" }

// 系统：动态路由参数还原（关键！）
// 把 /api/help/intro 的 "intro" 装进 query nxtPsection
{ "src": "^/api/help/(?<nxtPsection>[^/]+?)(?:\\.rsc)(?:/)?$",
  "dest": "/api/help/[section].rsc?nxtPsection=$nxtPsection" }
{ "src": "^/api/help/(?<nxtPsection>[^/]+?)(?:/)?$",
  "dest": "/api/help/[section]?nxtPsection=$nxtPsection" }

{ "src": "^/api/products/(?<nxtPid>[^/]+?)(?:\\.rsc)(?:/)?$",
  "dest": "/api/products/[id].rsc?nxtPid=$nxtPid" }
{ "src": "^/api/products/(?<nxtPid>[^/]+?)(?:/)?$",
  "dest": "/api/products/[id]?nxtPid=$nxtPid" }
```

**这里才是动态路由真正"接通"的地方**——把 URL 里的 `42` 装进 query `nxtPid=42`，函数 handler 才能从 `params` 里读到。
也就是说，下面这段代码：

```js
// app/api/products/[id]/route.js
export async function GET(_req, { params }) {
  const { id } = await params  // ← id="42"
}
```

`params.id` 能拿到值，是 `handle: "rewrite"` 段的两条规则在背后做参数注入。

---

### 3.8 `handle: "hit"` ── 命中后叠头

> "文件 / 函数已命中，发响应前再叠几个头"

```jsonc
{ "handle": "hit" }

// 系统：_next/static 长缓存 immutable
{ "src": "/_next/static/(?:[^/]+/pages|pages|chunks|runtime|css|image|media|.../).+",
  "headers": { "cache-control": "public,max-age=31536000,immutable" },
  "continue": true }

// 系统：trailing slash 规整 + cache 标记
{ "src": "/index(?:/)?", "headers": { ... }, "continue": true }
{ "src": "/((?!index$).*?)(?:/)?", "headers": { ... }, "continue": true }
```

`continue: true` 让这一段所有规则都按顺序叠头，最终一起送出。

---

### 3.9 `handle: "error"` ── 异常分支

> "出了异常 / 显式 404，从这里挑错误页"

本项目（无自定义 error）的产物：

```jsonc
{ "handle": "error" }

{ "src": "/.*", "dest": "/_not-found", "status": 404 }
{ "src": "/.*", "dest": "/_not-found.rsc", "status": 404,
  "has": [{ "type": "header", "key": "rsc", "value": "1" }] }
```

如果你写了 `app/error.js` 或自定义 `app/not-found.js`、`pages/500.js`，会在这一段冒出额外条目。

---

## 4. `check: true` 与 phase 切换的精微差别

```jsonc
{ "src": "/api/v1/(.*)$", "dest": "/api/$1", "check": true }
```

`check: true` 的语义是"改完路径，**回到状态机起点**重走一遍"。所以：

- 在初始段触发的 rewrite → 回初始段顶端
- 在 filesystem~resource 段触发的 rewrite → **也是回初始段，不是回当前段**

### 跟踪一个请求：`GET /api/v1/health`

```
1. 初始段
   ├ H1 全站头匹配,continue:true,注入安全头
   ├ ...其他 headers/redirects 都不命中
   └ BR1 命中: dest=/api/health, check:true
            ↓
2. 因为 check:true,回到初始段顶端
   ├ H1 再次匹配,继续叠头
   ├ H4 命中 (现在 path=/api/headers? 不,/api/health)
   ├ H6/H7 等条件头评估
   └ 没有更多 rewrite/redirect 命中,流出初始段
            ↓
3. handle: filesystem
   ├ static/ 没有 /api/health,miss
            ↓
4. filesystem~resource 段
   ├ afterFiles rewrites 不命中
            ↓
5. handle: resource
   ├ functions/api/health.func/ 命中!
   ├ 调用函数,返回 JSON
            ↓
6. handle: hit 段
   ├ 没有匹配的 cache 规则 (这条不是 /_next/static)
            ↓
7. 响应送出 (带初始段叠的安全头)
```

### 跟踪一条链式 rewrite：`GET /legacy-api/products/9`

```
1. 初始段
   └ R3 命中 (redirects[/legacy-api/:path*])
     status: 308, Location: /api/v1/products/9
            ↓
2. 终止匹配,直接返回 308 给浏览器
            ↓ 浏览器自动二次请求:
3. GET /api/v1/products/9 走完整流程
   ├ 初始段 BR1 命中 (rewrites.beforeFiles[/api/v1/:path*])
   │   dest=/api/products/9, check:true
   ├ 回顶端
   ├ H5 命中 (^/api/products/:id(\d+))
   │   注入 X-Product-Endpoint: v1, Cache-Control: s-maxage=60
   ├ filesystem 没命中
   ├ resource 段命中 functions/api/products/[id].func/
   ├ handle: rewrite 段把 9 装进 nxtPid
   ├ 函数 handler 从 params 读到 id=9
   └ 响应送出
```

`check: true` 这一行，撑起了所有"链式 rewrite"——R3 → BR1 → H5 三跳接力，全靠它。

---

## 5. 各 phase 的"业主"

谁会往哪个 phase 写规则：

| phase | next.config.js | 框架内部 (Next) | 系统 (Vercel) |
|---|---|---|---|
| **初始段** | ✅ headers / redirects / rewrites.beforeFiles | trailing slash 308、_next/__private 拦截、RSC payload 路由 | — |
| **filesystem~resource** | ✅ rewrites.afterFiles | RSC payload 后处理、_next/data | — |
| **resource~miss** | ✅ rewrites.fallback | catch-all → 函数 | — |
| **`miss`** | ❌ | _next/static 不存在时返回 404 | — |
| **`rewrite`** | ❌ | 动态路由参数还原 | — |
| **`hit`** | ❌ | _next/static immutable | — |
| **`error`** | ❌ | 自定义 error.js / 404.js | _not-found 兜底 |

**用户能直接写 entry 的 phase 只有三个**——初始段、filesystem~resource、resource~miss——也就是 `headers / redirects / rewrites` API 暴露给你的那一切。其余四个都是框架/系统专用。

---

## 6. 速查：触发时机

| phase | 何时被路由器"激活" | 你能写什么 | 跳到哪去 |
|---|---|---|---|
| 初始段 | 请求到达后立刻 | headers / redirects / rewrites.beforeFiles | filesystem |
| `filesystem` 标记 | 初始段走完 | （只是标记，不写规则） | 命中→hit；未命中→fs~resource 段 |
| filesystem~resource 段 | filesystem 没找到文件 | rewrites.afterFiles | resource |
| `resource` 标记 | 上一段走完 | （只是标记） | 命中函数→hit；未命中→resource~miss 段 |
| resource~miss 段 | 函数也没命中 | rewrites.fallback、catch-all | miss |
| `miss` 段 | 进入 miss 状态 | 框架专用：404 处理 | 终止响应 |
| `rewrite` 段 | 任何 `check:true` rewrite 改完后 | 框架专用：动态参数还原 | 回到初始段 |
| `hit` 段 | filesystem / resource 命中 | 框架专用：cache headers | 终止响应 |
| `error` 段 | 任何 phase 抛错 | error 页 | 终止响应 |

---

## 7. 与 EdgeOne `.edgeone/routes.json` 对比

EdgeOne 适配器是 v3 spec 的"裁剪实现"——只保留了一个 `handle: "filesystem"` 标记，其他 5 个 phase 全压平到 filesystem 之后，靠 `server-name: "ssr-node"` 字段把流量打到唯一一个云函数。

| 维度 | Vercel `.vercel/output/config.json` | EdgeOne `.edgeone/routes.json` |
|---|---|---|
| 路由总数 | 65 | 41 |
| `handle` 标记数 | 完整 6 个 | 仅 1 个 (`filesystem`) |
| 函数包数 | 36 个独立 `.func/` | 1 个统一 `cloud-functions/ssr-node/` |
| 函数 runtime 自报 | 每个 `.vc-config.json` 自带 | 共享 ssr-node 的 runtime |
| 动态参数还原 | 在 `handle: "rewrite"` 段做 | 由 ssr-node 函数内部 router 兜底 |

也就是说：**EdgeOne 把 v3 的 6-phase 模型压扁成了"边缘只过 filesystem 之前的内容，剩下全交给函数"**。函数内部 (`cloud-functions/ssr-node/config.json`) 自己再跑一遍接近完整的路由表。

---

## 8. 一句话总结

> **v3 的 6 个 handle phase 把"请求路由"看成一台状态机**：
>
> - 初始段总是先跑（headers / redirects / beforeFiles）；
> - `filesystem` / `resource` 是查找触发器；
> - `hit` / `miss` 是查找结果分支；
> - `rewrite` 是路径改写后的清理段；
> - `error` 是异常分支。
>
> `next.config.js` 的 headers / redirects / rewrites 三阶段，最终被翻译进前 3 个段；
> 后 4 个段几乎都是框架/平台基础设施在用。

---

## 附录 A：复现命令

```bash
# 进入项目
cd next-config-test

# 安装依赖（如果还没装）
npm install

# 编译出 v3 产物（用 Vercel CLI 本地编译，不需要登录、不需要部署）
mkdir -p .vercel
cat > .vercel/project.json <<'EOF'
{
  "projectId": "prj_local_inspection",
  "orgId": "team_local",
  "settings": { "framework": "nextjs" }
}
EOF
npx vercel@latest build --prod --yes

# 看所有 phase 标记
jq '.routes[] | select(.handle != null)' .vercel/output/config.json

# 看每段路由数
jq '.routes' .vercel/output/config.json | \
  awk '/"handle":/ { print "──── "$0; next } /"src"|"dest"/ { c++ } END {}'

# 看具体某段（比如 rewrite 段）
jq '.routes' .vercel/output/config.json | \
  sed -n '/"handle": "rewrite"/,/"handle": "hit"/p'

# 看函数包配置
cat .vercel/output/functions/api/health.func/.vc-config.json | \
  jq 'del(.filePathMap)'    # filePathMap 太长，省略
```

## 附录 B：相关文件

- `.vercel/output/config.json` — 真正的 v3 路由清单（本地 build 后产生）
- `.next/routes-manifest.json` — Next 中间形态（next build 即生成）
- `.edgeone/routes.json` — EdgeOne 适配后的路由表（部署到 EdgeOne 后生成）
- `next.config.js` — 用户配置源头（`headers / redirects / rewrites` 函数）
- `TEST_SPEC.md` — 端点预期效果矩阵
- `test-runner.mjs` — 自动化测试（55 用例零依赖）
