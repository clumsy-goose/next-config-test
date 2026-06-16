import { NextResponse } from 'next/server'

// /api/echo — 回显 URL、query、header；用于验证 rewrite 注入的 query (AR4)
export async function GET(request) {
  const url = new URL(request.url)
  const query = Object.fromEntries(url.searchParams.entries())
  const headers = {}
  request.headers.forEach((value, key) => {
    headers[key] = value
  })
  return NextResponse.json({
    endpoint: '/api/echo',
    url: request.url,
    pathname: url.pathname,
    query,
    headers,
    timestamp: new Date().toISOString(),
  })
}
