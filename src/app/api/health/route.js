import { NextResponse } from 'next/server'

// /api/health — 健康检查；同时是 /healthz、/api/v1/health、/search?legacy=true、
// /trigger-redirect (有 x-redirect-test:1)、/legacy-api/health 的目标
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/health',
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  })
}
