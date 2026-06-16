import { NextResponse } from 'next/server'

// /api/beta/greeting — 灰度通道；通过 BR2/BR3/BR4 重写命中
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/beta/greeting',
    channel: 'beta',
    message: 'Hello from BETA channel',
    timestamp: new Date().toISOString(),
  })
}
