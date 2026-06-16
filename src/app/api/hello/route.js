import { NextResponse } from 'next/server'

// /api/hello — 基础 GET/POST 端点
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name') || 'World'
  return NextResponse.json({
    endpoint: '/api/hello',
    message: `Hello, ${name}!`,
    method: 'GET',
    timestamp: new Date().toISOString(),
  })
}

export async function POST(request) {
  let body = null
  try {
    body = await request.json()
  } catch {
    body = null
  }
  return NextResponse.json({
    endpoint: '/api/hello',
    method: 'POST',
    received: body,
    timestamp: new Date().toISOString(),
  })
}
