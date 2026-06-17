import { NextResponse } from 'next/server'

// Sibling 反例 - Node 动态路由
// 与 sibling/edge/route.js (Edge 静态) 同级,验证排序与命中规则。
// 通过 export const runtime 不指定 → 默认 Node.js 运行时。
export async function GET(_request, { params }) {
  const { id } = await params
  return NextResponse.json({
    endpoint: '/api/sibling/[id]',
    runtime: 'nodejs',
    matchedAs: 'dynamic',
    id,
    timestamp: new Date().toISOString(),
  })
}
