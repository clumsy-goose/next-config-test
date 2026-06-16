import { NextResponse } from 'next/server'

// /api/secure/data — 鉴权端点；H9 在缺少 authorization 时注入 401 挑战头
export async function GET(request) {
  const auth = request.headers.get('authorization')
  if (!auth) {
    return NextResponse.json(
      { endpoint: '/api/secure/data', error: 'unauthorized' },
      { status: 401 }
    )
  }
  return NextResponse.json({
    endpoint: '/api/secure/data',
    user: 'authorized-user',
    authPrefix: auth.split(' ')[0] || null,
    timestamp: new Date().toISOString(),
  })
}
