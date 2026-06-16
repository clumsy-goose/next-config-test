# Test Specification — `next-config-test`

> 本文档描述 `next.config.js` 中所有 **headers / redirects / rewrites** 配置项与
> ISR / SSR / CSR / SSG 页面 / 各 API 端点 在部署后访问的预期结果。
> 配套测试脚本：`test-runner.mjs`（用法：`node test-runner.mjs <BASE_URL>`）。

---

## 0. 通用约定

- `${BASE}` 表示部署后的根 URL，例如 `https://your-app.example.com`。
- 测试脚本默认 **不跟随 3xx**（手动断言 `Location`），并对所有响应都断言全站 H1 安全头。
- 重定向断言时只对比 `Location` 的 **路径 + query**，避免依赖 `BASE` 的 host。

### 全站期望（H1 安全头）— 对所有页面 / API 都应成立

| Header | Expected |
|---|---|
| `X-Powered-By-Test` | `next-config-test` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |

---

## 1. 渲染模式页面

| # | 路径 | 渲染模式 | 期望状态 | 关键断言 |
|---|---|---|---|---|
| P1 | `GET ${BASE}/` | RSC (静态首页) | 200 | HTML 含 `Next Config Test` |
| P2 | `GET ${BASE}/ssr` | **SSR**（`force-dynamic`） | 200 | HTML 含 `data-testid="rendered-at"`；两次连续请求 `random` 值不同；响应头 `X-Render-Mode: ssr` 且 `Cache-Control: no-store, must-revalidate` |
| P3 | `GET ${BASE}/ssg` | **SSG**（`force-static`） | 200 | HTML 含 `data-testid="build-time"`；两次访问 `buildTime` 值相同；响应头 `X-Render-Mode: ssg` |
| P4 | `GET ${BASE}/isr` | **ISR**（`revalidate=10`） | 200 | HTML 含 `data-testid="rendered-at"`；响应头 `X-Render-Mode: isr` |
| P5 | `GET ${BASE}/isr?preview=1` | ISR + 预览头 | 200 | 响应头 `X-Preview-Mode: isr-preview`、`Cache-Control: no-store` |
| P6 | `GET ${BASE}/csr` | **CSR** | 200 | HTML 不含数据 (`Loading on client…`)；响应头 `X-Render-Mode: csr`；浏览器执行后会调用 `/api/hello` |

---

## 2. API 端点（直接访问，不经过 redirect/rewrite）

| # | 路径 | 期望状态 | 期望 body / 头 |
|---|---|---|---|
| A1 | `GET /api/hello?name=Foo` | 200 | JSON `endpoint:"/api/hello"`, `message:"Hello, Foo!"` |
| A2 | `POST /api/hello` body `{"x":1}` | 200 | JSON `received:{"x":1}`, `method:"POST"` |
| A3 | `GET /api/echo?k=v` | 200 | JSON `query.k === "v"` |
| A4 | `GET /api/headers` | 200 | 响应头 `X-Endpoint: headers-inspector`、`X-Custom-Trace-Id: trace-static-001`、`Cache-Control: no-store` |
| A5 | `GET /api/health` | 200 | JSON `status:"ok"` |
| A6 | `GET /api/greeting` | 200 | JSON `channel:"stable"` |
| A7 | `GET /api/products/42` | 200 | JSON `product.id:"42"`；响应头 `X-Product-Endpoint: v1`、`Cache-Control: public, s-maxage=60` |
| A8 | `GET /api/products/abc` | 400 | JSON `error` 含 `Invalid product id` |
| A9 | `GET /api/v2/status` | 200 | JSON `apiVersion:"v2"` |
| A10 | `GET /api/cors/data` | 200 | 响应头 `Access-Control-Allow-Origin: *`、`Access-Control-Allow-Methods: GET, POST, OPTIONS`、`X-CORS-Enabled: 1` |
| A11 | `OPTIONS /api/cors/data` | 204 | 同上 CORS 头 |
| A12 | `GET /api/secure/data` (无 `Authorization`) | 401 | 响应头 `WWW-Authenticate: Bearer realm="api"`、`X-Auth-Required: 1` |
| A13 | `GET /api/secure/data` (带 `Authorization: Bearer x`) | 200 | 响应**不包含** `WWW-Authenticate` 头；JSON `user:"authorized-user"` |
| A14 | `GET /api/cached` | 200 | 响应头 `Cache-Control: public, max-age=30, stale-while-revalidate=60`、`X-Cache-Strategy: swr` |
| A15 | `GET /api/auth/login` | 200 | JSON `action:"please-login"` |
| A16 | `GET /api/beta/greeting` | 200 | JSON `channel:"beta"` |
| A17 | `GET /api/help/intro?from=docs` | 200 | JSON `section:"intro"`, `from:"docs"` |

---

## 3. Headers — 条件命中（has / missing）

| # | 请求 | 期望响应头 |
|---|---|---|
| H6  | `GET /api/headers` with `Cookie: debug=on` | 出现 `X-Debug-Mode: enabled`、`X-Debug-Source: cookie` |
| H6n | `GET /api/headers` 无 cookie | **不出现** `X-Debug-Mode` |
| H7  | `GET /api/headers` with `x-tenant: acme` | 出现 `X-Tenant-Resolved: acme`、`Vary` 含 `x-tenant` |
| H7n | `GET /api/headers` 无 x-tenant | **不出现** `X-Tenant-Resolved` |
| H8  | `GET /isr?preview=1` | `X-Preview-Mode: isr-preview` |
| H9  | `GET /api/secure/data` 无 `Authorization` | `WWW-Authenticate`、`X-Auth-Required: 1` 同时出现；状态码 401 |
| H9n | `GET /api/secure/data` 带 `Authorization` | 上述两个头都**不**出现；状态码 200 |

---

## 4. Redirects — 期望 3xx + Location

> 测试脚本对每条 redirect 都使用 `redirect: 'manual'`（fetch）/ `--max-redirs 0`（curl） 拦截。

| # | 请求 | 期望状态 | 期望 Location |
|---|---|---|---|
| R1  | `GET /home` | **308** | `/` |
| R2  | `GET /old-products/123` | **307** | `/api/products/123` |
| R3  | `GET /legacy-api/products/9` | **308** | `/api/v1/products/9` |
| R4  | `GET /search?legacy=true` | **307** | `/api/health` |
| R4n | `GET /search` (无 `legacy=true`) | 404 或 200 | **不重定向** |
| R5  | `GET /account/orders` (无 `session` cookie) | **307** | `/api/auth/login` |
| R5n | `GET /account/orders` 带 `Cookie: session=abc` | 404 | **不重定向** |
| R7  | `GET /u/42` | **307** | `/api/products/42` |
| R7n | `GET /u/abc` | 404 | **不重定向**（正则段未命中） |
| R8  | `GET /docs/intro` | **307** | `/api/help/intro?from=docs` |
| R9  | `GET /go/github` | **308** | `https://github.com/vercel/next.js` |
| R10 | `GET /trigger-redirect` 带 `x-redirect-test: 1` | **307** | `/api/health` |
| R10n| `GET /trigger-redirect` 无该 header | 404 | **不重定向** |
| R11 | `GET /private/dashboard` 无 `x-api-key` | **307** | `/api/auth/login` |
| R11n| `GET /private/dashboard` 带 `x-api-key: k` | 404 | **不重定向** |

---

## 5. Rewrites — URL 不变，内部转发

| # | 请求 | 期望状态 | 期望 body |
|---|---|---|---|
| BR1a | `GET /api/v1/health` | 200 | 同 `/api/health`，`endpoint:"/api/health"` |
| BR1b | `GET /api/v1/products/7` | 200 | 同 `/api/products/7`，`product.id:"7"` |
| BR2  | `GET /api/greeting` 带 `x-canary: always` | 200 | `channel:"beta"`（命中灰度） |
| BR3  | `GET /api/greeting` 带 `Cookie: canary=true` | 200 | `channel:"beta"` |
| BR4  | `GET /api/greeting?beta=1` | 200 | `channel:"beta"` |
| BR-default | `GET /api/greeting`（无任何条件） | 200 | `channel:"stable"` |
| AR1  | `GET /healthz` | 200 | `endpoint:"/api/health"`, `status:"ok"` |
| AR2  | `GET /status` | 200 | `apiVersion:"v2"` |
| AR3  | `GET /shop/55` | 200 | `product.id:"55"` |
| AR3n | `GET /shop/abc` | 404 | 正则未命中，落到 404 |
| AR4  | `GET /echo-it?msg=hi` | 200 | `query.from === "alias"` 必须存在；`query.msg === "hi"` 在 Next 标准行为下会透传（部分边缘托管如 EdgeOne 当 destination 已带 query 时不再透传，脚本对此发警告而非失败） |
| FR1  | `GET /proxy/posts/1` | 200 (或 5xx，见下) | 来自外部 jsonplaceholder，body 含 `userId`、`id:1`、`title`、`body`。若边缘节点出站受限，可能返回 502/503/504；这反映环境出网而非配置问题，FR1n 仍能验证 fallback 规则被命中 |
| FR1n | `GET /proxy/posts/abc` | 404 | 正则未命中；fallback 不会代理 |

---

## 6. 静态资源（H2）

| # | 请求 | 期望响应头 |
|---|---|---|
| S1 | `GET /static/anything.txt`（路径只要存在 / 不存在均会带头；不存在则 404） | `Cache-Control: public, max-age=31536000, immutable`、`X-Asset-Tier: static-immutable` |

> 注：本项目未提供 `/static/*` 静态文件，仅验证 **配置生效**（4xx 响应也会带上对应自定义头）。

---

## 7. 路由阶段优先级反例（counter-examples）

> 验证 **`beforeFiles > filesystem > afterFiles > dynamic-route > fallback`** 的执行顺序。
> 每条反例都设计成"两种规则同时指向同一个 URL"，命中谁就证明了谁的优先级更高。
> 推理详见 [`V3_PHASES.md`](./V3_PHASES.md)。

| # | 验证 | 同时存在 | 请求 | 期望 body | 反向断言 |
|---|---|---|---|---|---|
| **CE1** | beforeFiles 抢在 filesystem 之前 | `public/priority/before-fs.txt` 文件 + beforeFiles `/priority/before-fs.txt → /api/health` | `GET /priority/before-fs.txt` | JSON `endpoint:"/api/health"` | body 不应含 `PRIORITY=filesystem` 文本 |
| **CE2** | filesystem 抢在 afterFiles 之前 | `public/priority/fs-after.txt` 文件 + afterFiles `/priority/fs-after.txt → /api/health` | `GET /priority/fs-after.txt` | 文件文本 `PRIORITY=filesystem...` | body 不应是 `/api/health` JSON |
| **CE3** | afterFiles 抢在动态路由之前 | `app/api/ce3/[id]/route.js` 动态路由 + afterFiles `/api/ce3/:id → /api/auth/login` | `GET /api/ce3/42` | JSON `action:"please-login"` | body 不应含 `winner:"dynamic-route"` |
| **CE4** | 真实路由命中,fallback 永不触发 | `app/api/ce4/route.js` 真实路由 + fallback `/api/ce4 → /api/auth/login` | `GET /api/ce4` | JSON `winner:"real-route"` | body 不应含 `action:"please-login"` |
| **CE5** | 所有阶段 miss 时 fallback 兜底 | 仅 fallback `/ce5/:path* → /api/auth/login`（无任何真实路由） | `GET /ce5/anything/here` | JSON `action:"please-login"`、`endpoint:"/api/auth/login"` | — |

### 命中链路（对应 V3 phases）

```
CE1 请求 /priority/before-fs.txt
  └─ 初始段 BR命中: dest=/api/health, check:true   ← rewrite 抢跑
      └─ 回顶端,fs miss,resource 命中 health.func
         返回 health JSON ✓

CE2 请求 /priority/fs-after.txt
  └─ 初始段没命中
      └─ handle:filesystem 找到 static/priority/fs-after.txt ✓
         直接返回文件,afterFiles 无机会运行

CE3 请求 /api/ce3/42
  └─ 初始段没命中
      └─ filesystem miss
          └─ afterFiles AR (CE3) 命中: dest=/api/auth/login   ← rewrite 抢在 resource 前
              └─ 回顶端,resource 命中 auth/login.func
                 返回 login JSON ✓

CE4 请求 /api/ce4
  └─ 初始段没命中
      └─ filesystem miss
          └─ afterFiles 没命中
              └─ handle:resource 命中 ce4.func ✓ ← 真实路由先接住
                 返回 real-route JSON,fallback 永不到达

CE5 请求 /ce5/anything/here
  └─ 初始段没命中
      └─ filesystem miss
          └─ afterFiles 没命中
              └─ resource miss(无 ce5.func)
                  └─ fallback FR (CE5) 命中: dest=/api/auth/login ✓
                     返回 login JSON
```

---

## 8. CSR 页面客户端行为（人工 / 浏览器验证）

- 打开 `${BASE}/csr`，**初始 HTML** 不含 JSON 数据（仅 `Loading on client…`）。
- 浏览器挂载后客户端发起 `GET /api/hello?name=CSR`，页面呈现含 `message: "Hello, CSR!"` 的代码块。
- 网络面板可看到独立的 `/api/hello` 请求；这是 CSR 与 SSR/SSG 最直观的差异。

---

## 9. 测试覆盖矩阵

| 配置类别 | 写法 | 覆盖用例 |
|---|---|---|
| Headers · 全站 | `source:"/:path*"` | H1 (所有用例隐式校验) |
| Headers · 命名通配 + immutable | `source:"/static/:path*"` | S1 |
| Headers · CORS | 多条 `Access-Control-*` | A10 / A11 |
| Headers · 端点专属 | 精确 `source` | A4 / A14 |
| Headers · 正则段 | `:id(\\d{1,})` | A7 |
| Headers · has cookie | `cookie debug=on` | H6 / H6n |
| Headers · has header | `header x-tenant=acme` | H7 / H7n |
| Headers · has query | `query preview=1` | P5 / H8 |
| Headers · missing header | `authorization` | A12 / A13 / H9 / H9n |
| Headers · 渲染模式标记 | 单 `source` | P2 / P3 / P4 / P6 |
| Redirects · 308 简单 | `permanent:true` | R1 |
| Redirects · 307 命名段 | `:id` | R2 |
| Redirects · 308 通配 | `:path*` | R3 |
| Redirects · has query | `query legacy=true` | R4 / R4n |
| Redirects · missing cookie | `session` | R5 / R5n |
| Redirects · has host | `www.example.com` | （需要 host 模拟，列入文档非自动化） |
| Redirects · 正则段 | `:id(\\d+)` | R7 / R7n |
| Redirects · 透传 query | `?from=docs` | R8 |
| Redirects · 跨域外链 | `https://...` | R9 |
| Redirects · has header | `x-redirect-test:1` | R10 / R10n |
| Redirects · missing header | `x-api-key` | R11 / R11n |
| Rewrites · beforeFiles 通配剥离 | `/api/v1/:path*` | BR1a / BR1b |
| Rewrites · beforeFiles has header | `x-canary:always` | BR2 |
| Rewrites · beforeFiles has cookie | `canary=true` | BR3 |
| Rewrites · beforeFiles has query | `beta=1` | BR4 |
| Rewrites · afterFiles 别名 | `/healthz`、`/status` | AR1 / AR2 |
| Rewrites · afterFiles 正则段 | `/shop/:id(\\d+)` | AR3 / AR3n |
| Rewrites · afterFiles 注入 query | `?from=alias` | AR4 |
| Rewrites · fallback 反向代理 | `/proxy/posts/:id` | FR1 / FR1n |
| 优先级 · beforeFiles &gt; filesystem | rewrite 抢在静态文件之前 | CE1 |
| 优先级 · filesystem &gt; afterFiles | 静态文件抢在 rewrite 之前 | CE2 |
| 优先级 · afterFiles &gt; dynamic-route | rewrite 抢在动态路由之前 | CE3 |
| 优先级 · dynamic-route &gt; fallback | 真实路由命中,fallback 永不触发 | CE4 |
| 优先级 · fallback 兜底 | 所有阶段 miss 时 fallback 生效 | CE5 |
