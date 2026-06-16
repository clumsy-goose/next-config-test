import { NextResponse } from 'next/server'

// CE3 反例：动态路由（dynamic-route）
// 与 next.config.js 中 afterFiles `/api/ce3/:id → /api/auth/login` 同时存在。
// 因为 afterFiles 在动态路由解析（handle:resource）之前命中，本端点 **永远不应** 被调用。
// 如果你访问 /api/ce3/42 看到 winner:"dynamic-route"，说明 afterFiles 没有生效（异常）。
export async function GET(_request, { params }) {
  const { id } = await params
  return NextResponse.json({
    endpoint: '/api/ce3/[id]',
    winner: 'dynamic-route',
    id,
    timestamp: new Date().toISOString(),
    note: 'If you see this, the afterFiles rewrite did NOT take precedence (unexpected!)',
  })
}
