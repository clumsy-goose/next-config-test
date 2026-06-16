import { NextResponse } from 'next/server'

// /api/help/[section] — R8 /docs/:section -> /api/help/:section?from=docs 的目标
export async function GET(request, { params }) {
  const { section } = await params
  const { searchParams } = new URL(request.url)
  return NextResponse.json({
    endpoint: '/api/help/[section]',
    section,
    from: searchParams.get('from'),
    timestamp: new Date().toISOString(),
  })
}
