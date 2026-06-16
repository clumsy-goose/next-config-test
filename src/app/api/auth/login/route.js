import { NextResponse } from 'next/server'

// /api/auth/login — 登录端点；R5 (/account 无 session) / R11 (/private 无 x-api-key) 的目标
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/auth/login',
    action: 'please-login',
    timestamp: new Date().toISOString(),
  })
}
