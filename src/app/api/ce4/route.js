import { NextResponse } from 'next/server'

// CE4 反例：真实路由 vs fallback rewrite
// 与 next.config.js 中 fallback `/api/ce4 → /api/auth/login` 同时存在。
// 因为 fallback 在动态路由解析（handle:resource）之后才尝试匹配，本端点会优先命中，
// fallback **永远不应** 被触发。
// 如果你访问 /api/ce4 看到 action:"please-login"，说明 fallback 抢跑了（异常）。
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/ce4',
    winner: 'real-route',
    timestamp: new Date().toISOString(),
    note: 'If you instead see action:"please-login", the fallback rewrite leaked through (unexpected!)',
  })
}
