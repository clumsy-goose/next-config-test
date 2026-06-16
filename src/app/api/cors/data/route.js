import { NextResponse } from 'next/server'

// /api/cors/data — CORS 端点；H3 注入 Access-Control-* 头
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/cors/data',
    items: [{ id: 1, name: 'foo' }, { id: 2, name: 'bar' }],
    timestamp: new Date().toISOString(),
  })
}

export async function OPTIONS() {
  // 预检：返回空体，CORS 头由 next.config.js 注入
  return new NextResponse(null, { status: 204 })
}
