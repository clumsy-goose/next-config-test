import { NextResponse } from 'next/server'

// /api/v2/status — 版本化状态端点；AR2 /status 重写目标
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/v2/status',
    apiVersion: 'v2',
    status: 'operational',
    timestamp: new Date().toISOString(),
  })
}
