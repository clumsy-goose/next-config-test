# 三环境验证计划 · 实测记录

> 用一份 fixture + 一个脚本（`probe-env.mjs`），把 `next.config.js` 中
> rewrites/headers 在三个真实运行时（**next start standalone / Vercel 边缘 / EdgeOne 边缘**）
> 的行为差异并排对比、量化记录。
>
> 本项目首次跑出真实分歧的日期：**2026-06-18**。
> 已部署的真实 URL 均为可复跑的活样本（详见 §3）。

---

## 0. 一句话结论

跨 3 个运行时探测 5 个行为分歧点：**3/5 一致、2/5 分歧、1/5 三家都不同**。

| 探测点 | next start | Vercel | EdgeOne |
|---|---|---|---|
| **CE2** filesystem vs afterFiles | filesystem 优先 ✓ | filesystem 优先 ✓ | filesystem 优先 ✓ |
| **CE3** afterFiles vs dynamic-route | afterFiles 优先 ✓ | afterFiles 优先 ✓ | afterFiles 优先 ✓ |
| **CE6** afterFiles 段 vs fallback 段 | afterFiles 段优先 ✓ | afterFiles 段优先 ✓ | **fallback 段抢跑 ✗** |
| **SIBLING** afterFiles vs Edge static function | Edge function 优先 | Edge function 优先 | **afterFiles 优先** |
| **AR4** rewrite destination query | 不注入但透传 | 注入+透传 ✓ | 注入但不透传 |

---

## 1. 探测点设计（5 个）

每个探测点都是**两个互相竞争的规则同时存在**——返回的 body 里有"指纹"字段，能直接说明哪条规则赢了。

### CE2 — filesystem vs afterFiles

```
fixture:
  public/priority/fs-after.txt  (静态文件,内容含 "PRIORITY=filesystem")
  next.config.js: afterFiles { source: "/priority/fs-after.txt", destination: "/api/health" }

probe: GET /priority/fs-after.txt
  body 含 "PRIORITY=filesystem" → filesystem 优先 (Next 文档承诺)
  body 是 health JSON           → afterFiles 抢跑
```

### CE3 — afterFiles vs dynamic-route

```
fixture:
  app/api/ce3/[id]/route.js     (Node 动态路由,返回 winner:"dynamic-route")
  next.config.js: afterFiles { source: "/api/ce3/:id", destination: "/api/auth/login" }

probe: GET /api/ce3/42
  body action:"please-login"        → afterFiles 优先 (Next 文档承诺)
  body winner:"dynamic-route"       → dynamic 抢跑
```

### CE6 — afterFiles 段 vs fallback 段（书写顺序契约）

```
fixture (无任何 route handler,仅两条 rewrite):
  next.config.js: afterFiles { source: "/api/ce6/:path*", destination: "/api/auth/login" }   (通配 matchType=2)
  next.config.js: fallback   { source: "/api/ce6/keep",   destination: "/api/health"      }  (精准 matchType=0)

probe: GET /api/ce6/keep
  body action:"please-login"   → afterFiles 段优先 (严格按书写顺序)
  body endpoint:"/api/health"  → fallback 段抢跑 (按 specificity 重排,违反 Next 文档)
```

### SIBLING — afterFiles vs Edge static function

```
fixture (★ 关键探测点):
  app/api/sibling/edge/route.js  (Edge runtime, 静态精准, 返回 runtime:"edge")
  next.config.js: afterFiles { source: "/api/sibling/edge", destination: "/api/auth/login" }

probe: GET /api/sibling/edge
  body action:"please-login"        → afterFiles 优先 (与 EdgeOne 行为一致)
  body runtime:"edge"               → Edge function 优先 (与 next start / Vercel 行为一致)
```

### AR4 — rewrite destination query 行为

```
配置: afterFiles { source: "/echo-it", destination: "/api/echo?from=alias" }

probe: GET /echo-it?msg=hi
  body query:{from:"alias",msg:"hi"}  → 注入+透传 (完整 spec)
  body query:{from:"alias"}            → 注入但不透传
  body query:{msg:"hi"}                → 不注入但透传
  body query:{}                        → 都丢失
```

---

## 2. 复跑命令（每个环境）

### 准备

```bash
git clone git@github.com:clumsy-goose/next-config-test.git
cd next-config-test
npm install
npx next build
```

### Env 1 — 本地 next start standalone

```bash
npx next start -p 3010 &
node probe-env.mjs http://localhost:3010
```

### Env 2 — Vercel 边缘

```bash
# 已登录的话:
npx vercel link --yes --project next-config-test
npx vercel deploy --prod --yes
# 部署完后用 Vercel 给的 alias 跑 probe
node probe-env.mjs https://next-config-test.vercel.app
```

### Env 3 — EdgeOne 边缘

```bash
# 已登录的话:
edgeone makers deploy --name next-config-test-zyvpp6jk --env production
# 部署完后:
node probe-env.mjs https://next-config-test-zyvpp6jk.edgeone.cool
```

### 一次性三家并排（推荐）

```bash
npx next start -p 3010 &
sleep 3
node probe-env.mjs \
  http://localhost:3010 \
  https://next-config-test.vercel.app \
  https://next-config-test-zyvpp6jk.edgeone.cool
```

---

## 3. 实测记录（2026-06-18 跑出来的数据）

```
== 环境签名对比表 ==

ID          行为分歧点                       Env1                Env2                Env3
──────────────────────────────────────────────────────────────────────────────────────
CE2         filesystem vs afterFiles         filesystem 优先     filesystem 优先     filesystem 优先
CE3         afterFiles vs dynamic-route      afterFiles 优先     afterFiles 优先     afterFiles 优先
CE6         afterFiles 段 vs fallback 段     afterFiles 段优先   afterFiles 段优先   fallback 段抢跑   ⚠
SIBLING     afterFiles vs Edge static func   Edge function 优先  Edge function 优先  afterFiles 优先   ⚠
AR4         rewrite destination query        不注入但透传        注入+透传 ✓         注入但不透传      ⚠

Env1 = http://localhost:3010                       (next start standalone)
Env2 = https://next-config-test.vercel.app
Env3 = https://next-config-test-zyvpp6jk.edgeone.cool

发现 3 个分歧点 - 说明实现间存在行为差异。
```

---

## 4. 三个分歧点逐一解读

### 分歧 ① — CE6: afterFiles 段 vs fallback 段

| 环境 | 实测 | 原因 |
|---|---|---|
| next start | afterFiles 段优先 | Next.js 自身 server 严格按 routes-manifest 顺序匹配 |
| Vercel | afterFiles 段优先 | v3 spec 实现严格保留段间顺序 |
| **EdgeOne** | **fallback 段抢跑** | tef-cli `route-sorter.ts:65-111` 的 `sortRoutes` 把 afterFiles+fallback 一起按 specificity 重排,违反 Next 书写顺序契约 |

**这就是我们前面源码调研得出的预测——实测在 EdgeOne 上确认了它**。

### 分歧 ② — SIBLING: afterFiles vs Edge static function

| 环境 | 实测 | 暗示 |
|---|---|---|
| next start | Edge function 优先 | "filesystem" 阶段把所有 functions（含 Edge）一起查,在 afterFiles 之前 |
| Vercel | Edge function 优先 | 与 next start 一致——v3 边缘 router 对 functions 的查找也在 afterFiles 之前 |
| **EdgeOne** | **afterFiles 优先** | EdgeOne 边缘 router 在 functions 查找之前评估 afterFiles 段——**这反而是更接近"v3 spec 文字描述"的实现** |

**这是反直觉的发现**：EdgeOne 在这一点上比 Vercel **更严格遵循 v3 文档字面**（afterFiles 在 handle:"filesystem" 之后、handle:"resource" 之前）。但这种"严格"反而与 Vercel 实际行为不符,可能让用户感到困惑。

### 分歧 ③ — AR4: rewrite destination query

| 环境 | 实测 | 含义 |
|---|---|---|
| next start | 不注入但透传 | request.url 直接是客户端 URL `/echo-it?msg=hi`,destination 的 query 不可见 |
| Vercel | 注入+透传 | rewrite 后 URL 完整重组,client query (msg) 与 dest query (from) 合并 |
| EdgeOne | 注入但不透传 | dest query (from) 注入,但原 client query (msg) 在合并时被丢弃 |

**Next 标准行为应是"注入+透传"——只有 Vercel 完全合规**。

---

## 5. 给应用开发者的建议（基于实测）

```js
// next.config.js
async rewrites() {
  return {
    afterFiles: [
      { source: '/healthz', destination: '/api/health' },                    // 安全：三家行为一致
      { source: '/api/v1/static-handler', destination: '/api/v2/handler' },  // ⚠ 仅在 EdgeOne 上能拦截真实静态 handler
    ],
    fallback: [
      // ⚠ 在 EdgeOne 上,fallback 段会和 afterFiles 一起按 specificity 重排
      // 不要让 fallback source 比 afterFiles source 更精准,否则会抢跑
      { source: '/api/legacy/:path*', destination: '/api/v1/:path*' },
    ],
  }
}
```

**最大坑点**：
1. **fallback 不要写比 afterFiles 更精准的 source**（EdgeOne 会抢跑）
2. **destination 写带 query 的路径时**，原 client query 在 EdgeOne 上不会合并（不要假设它会）
3. **想"用 afterFiles 屏蔽真实 static route handler"** 这种"招数"在 next start / Vercel 上无效——文件优先

---

## 6. 给 adapter 作者（特指 EdgeOne tef-cli）

CE6 的反例直接证明 `route-sorter.ts:65-111` 的 `sortRoutes` 让 fallback 抢跑了 afterFiles。

**修复路径**（按改动量小→大排）：

1. **方案 A · 直接去掉 sortRoutes**——透传 OpenNext fork 已写好的顺序。最小风险，与 Vercel/Next dev 行为对齐。
2. **方案 B · 分桶后再排**——`extractAdapterRules` 多做一刀，把 afterFiles 段、fallback 段、dynamicRoutes、apiRoutes 各自分桶，桶内可以排，桶间顺序固定（afterFiles 段 → 其他 → fallback 段）。
3. **方案 C · 加配置开关**——`tef.config.json` 加 `sortAfterFiles: false`，让保守用户能关闭。

SIBLING 这条的差异性质不同——这不是 bug，而是 EdgeOne 选择了更"字面 spec"的实现。但实际上**与 Vercel 相反**，可能让从 Vercel 迁过来的用户翻车。建议在 EdgeOne 文档里**显式声明此行为**。

---

## 7. 后续维护

每加一条新的 rewrite/headers 规则，都该问一遍：

1. 它会不会与已有 source 重叠？重叠时哪条赢？
2. 在 next start / Vercel / EdgeOne 上的赢者会不会不一样？
3. 如果会，这条规则该不该用 `has` / `missing` 收紧前置条件？

跑 `node probe-env.mjs <BASE> ...` 三次是最快的确认手段。

---

## 附录 A · 完整复现命令

```bash
# 一行话从零到三环境对比:
git clone git@github.com:clumsy-goose/next-config-test.git
cd next-config-test
npm install

# 本地准备 (后台启动 next start)
npx next build && (npx next start -p 3010 > /dev/null 2>&1 &)
sleep 3

# Vercel 部署 (需要 vercel login)
npx vercel link --yes --project next-config-test
npx vercel deploy --prod --yes

# EdgeOne 部署 (需要 edgeone login)
edgeone makers deploy --name next-config-test-zyvpp6jk --env production

# 三家并排 probe
node probe-env.mjs \
  http://localhost:3010 \
  https://next-config-test.vercel.app \
  https://next-config-test-zyvpp6jk.edgeone.cool

# 收尾
pkill -f "next start" 2>/dev/null
```

## 附录 B · 也可以扩展 probe

如果你新加一条 fixture（例如想测试 `headers().has cookie xxx`），只需在 `probe-env.mjs` 的 `PROBES` 数组里加一条：

```js
{
  id: 'NEW',
  name: '...',
  description: '...',
  path: '/api/your-fixture',
  opts: { headers: { 'cookie': 'xxx=yyy' } },   // 可选: 自定义请求头/方法/body
  interpret(r) {
    if (...) return ['判定A', '✓ 含义']
    if (...) return ['判定B', '✗ 含义']
    return ['未知', JSON.stringify(r.json).slice(0, 80)]
  },
},
```

跑 `node probe-env.mjs <urls...>` 立刻能看到三家在新探测点的差异。
