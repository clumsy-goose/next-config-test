import { NextResponse } from 'next/server'

// /api/headers — 返回入站请求头；用于验证 has/missing 命中
// 同时配合 H4 注入 X-Endpoint / X-Custom-Trace-Id / Cache-Control: no-store
export async function GET(request) {
  const headers = {}
  request.headers.forEach((value, key) => {
    headers[key] = value
  })
  return NextResponse.json({
    endpoint: '/api/headers',
    method: 'GET',
    url: request.url,
    headers,
    timestamp: new Date().toISOString(),
  })
}
