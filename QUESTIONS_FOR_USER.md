# 待用户确认的问题清单

> 调查 rewrites 编译流程过程中，遇到几个需要用户/上游团队确认的疑点。
> 这里只列**需要外部确认**的问题；纯源码可证的细节都在 [`REWRITES_ANALYSIS_ISSUES.md`](./REWRITES_ANALYSIS_ISSUES.md) 与 [`REWRITES_ORDERING.md`](./REWRITES_ORDERING.md) 里。

---

## Q1. EdgeOne CLI 对 afterFiles + fallback 的二次排序是 bug 还是有意为之？

**当前结论（待 EdgeOne 团队确认）**：基于跨实现源码对比 + Next.js 文档语义，**这应当被视作 bug**，理由见 `REWRITES_ORDERING.md` 第 7 节"立场"。建议修复方案是**直接去掉 `route-sorter.ts:65-111` 的 sortRoutes 调用**——`@edgeone/opennextjs-pages` 已按 Next 规范写好顺序，tef-cli 不需要再重排。

**背景**：
- `tef-cli/src/pages/builder/utils/route-sorter.ts:65-111` 的 `sortRoutes` 把 OpenNext fork 已经按用户书写顺序写好的 `afterFiles + fallback` 段重新按 `matchType + specificity` 排了一次。
- 这与 Next.js / Vercel / OpenNext 主流的"严格保留声明顺序"相违背。
- 项目里 **CE6 反例** 专门验证此场景：`afterFiles: /api/ce6/:path*` 通配 + `fallback: /api/ce6/keep` 精准。本地 next start 模式 CE6 通过（标准语义生效）；如 EdgeOne 部署 CE6 失败，即直接证明 sortRoutes 把 fallback 提前了。

**需要外部确认**：
- (a) EdgeOne 团队是否同意修复（去掉 sortRoutes，直接透传 OpenNext 顺序）？
- (b) 是否需要兼容期 / 配置开关？
- (c) 由谁跟进——给 EdgeOne 工单 / 给 ef-dev-tools 仓库提 PR / 都做？

**复现路径**：本项目部署到 EdgeOne 后跑 `node test-runner.mjs <BASE>`，观察 CE6 是否绿。如果挂，说明 sortRoutes 抢了 afterFiles。

---

## Q2. EdgeOne 路由解释器是否真的支持 `check: true`？

**背景**：
- `@edgeone/opennextjs-pages` 在 `route-utils.ts:332-365` 给每条 rewrite 都加 `check: true`。
- 但同文件 `routes.ts:8-11` 注释又声明 EdgeOne **不支持** `check`。
- `tef-cli` 把 `check: true` 原样透传到 `routes.json`。

**需要确认**：
- (a) EdgeOne 边缘 router 收到 `check: true` 是按 v3 spec 实现"回顶端再走一遍"，还是当 no-op 忽略？
- (b) 如果忽略，那么我们项目里 BR1 (`/api/v1/* → /api/*`) 改写完之后，后面的 H4 / H6 / H7 等 headers 还能正确叠上吗？目前测试是绿的，但语义路径不明。

**实证记录**：
- 项目里 R3 (`/legacy-api/products/9` → `/api/v1/products/9`) 串到 BR1 (`/api/v1/* → /api/*`) 工作正常 → 暗示边缘 router **实现了** check 语义。
- 但这只是间接观察，不是源码确认。

---

## Q3. EdgeOne 是否会将 5 个 v3 phase 全部支持？

**背景**：
- 当前 EdgeOne 产物里只有 1 个 `handle: "filesystem"`，其他 5 个 phase（`resource / miss / rewrite / hit / error`）全部缺失。
- 这意味着：
  - `handle:"rewrite"` 段（动态路由参数还原）由 ssr-node 函数内部承担
  - `handle:"hit"` 段（静态资源 cache headers）由 EdgeOne 自己的 cache 配置兜底
  - `handle:"error"` 段（错误页路由）由函数内部捕获

**需要确认**：
- (a) EdgeOne 团队是否计划支持完整 6 phase？还是认为单一 filesystem 标记已足够？
- (b) 当前实现是否对所有 Next.js 应用都安全？尤其是用了 PPR / 自定义 error.js / `<Image />` 等高级特性的项目。

---

## Q4. AR4 行为差异：`request.url` / 注入 query / 透传 query

**背景**：
我们的 AR4 用例（`/echo-it?msg=hi → /api/echo?from=alias`）在不同环境下表现不同：

| 行为 | Vercel | EdgeOne | next start (standalone) |
|---|---|---|---|
| 函数 `request.url.pathname` | 待验证 | `/api/echo`（已被改写） | `/echo-it`（保留客户端 URL） |
| destination 注入的 `from=alias` 出现在 `request.url.searchParams` | 待验证 | ✅ | ❌ |
| 原始 `msg=hi` 透传到 destination | ✅（按 Next 文档） | ❌（被吞掉） | ✅ |

**需要确认**：
- (a) Next.js 官方对 `request.url` 在 rewrite 后的"应是什么"是否有明确规范？
- (b) Vercel 的实际行为（我们没有部署到 Vercel 验证过）。
- (c) EdgeOne 是否计划修正"destination 已带 query 时丢弃原 query"的行为？

**当前应对**：测试脚本已放宽 AR4 断言，只严格检查 `endpoint === "/api/echo"`（这是改写真正命中的唯一稳定证据），其余三种行为缺失只发 warning。

---

## Q5. FR1 在 EdgeOne 上偶发 504 的真实原因

**背景**：
- `/proxy/posts/1 → https://jsonplaceholder.typicode.com/posts/1` 这条 fallback 在 EdgeOne 部署上时不时返回 504。
- 我们暂时归因于"边缘节点出网到 jsonplaceholder.typicode.com 受限"。

**需要确认**：
- (a) EdgeOne 边缘节点出站策略是否有白名单 / 限流 / 区域限制？
- (b) 反向代理外部 origin 是不是 EdgeOne 推荐的部署模式？
- (c) 是否需要换用 EdgeOne 自己的边缘 fetch 优化？

---

## Q6. 是否要给 EdgeOne 团队提交 issue / PR？

如果上述 Q1（sortRoutes 重排 afterFiles+fallback）确认是 bug，建议：
- (a) 在 EdgeOne 工单系统提交 issue
- (b) 提供一个最小复现 demo（可以用我们项目里加一对反例就能演示）
- (c) 可选：直接给 `tef-cli` 提 PR 修复 sortRoutes 的分桶策略

**需要决策**：是否要做？由谁来跟进？

---

## 维护说明

- 这个文件用来累积**需要回头确认**的问题，每条都要说清楚 **背景 / 需要确认什么 / 复现路径**。
- 解决一条就把它从这个文件里移除，并更新 `REWRITES_ORDERING.md` 的对应章节。
- 不要往这个文件里塞已经能从源码里直接找到答案的问题——那些归 `REWRITES_ANALYSIS_ISSUES.md`。
