import { NextResponse } from 'next/server'

// /api/cached — 配合 H10 验证 SWR Cache-Control 注入
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/cached',
    note: 'Cache-Control header is injected by next.config.js',
    timestamp: new Date().toISOString(),
  })
}
