import { NextResponse } from 'next/server'

// /api/greeting — 稳定通道；当未命中 BR2/BR3/BR4 灰度条件时由本端点服务
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/greeting',
    channel: 'stable',
    message: 'Hello from STABLE channel',
    timestamp: new Date().toISOString(),
  })
}
