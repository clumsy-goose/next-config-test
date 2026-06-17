// Sibling 反例 - Edge 静态路由
// 与 sibling/[id]/route.js 同级。
// export const runtime = 'edge' 让本端点跑在 Edge runtime,
// 但路径 "/api/sibling/edge" 是**静态精准**,不带任何 [param]。
//
// 用 Web Request 接口 (Edge runtime 标准),不用 next/server 的 NextResponse helper
// 才能严格在 Edge 环境跑。

export const runtime = 'edge'

export async function GET() {
  return new Response(
    JSON.stringify({
      endpoint: '/api/sibling/edge',
      runtime: 'edge',
      matchedAs: 'static',
      timestamp: new Date().toISOString(),
    }),
    { headers: { 'content-type': 'application/json' } }
  )
}
