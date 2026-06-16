import { NextResponse } from 'next/server'

// /api/products/[id] — 动态路由
// 是 /old-products/:id (R2)、/u/:id (R7)、/shop/:id (AR3)、/api/v1/products/:id (BR1) 的目标
export async function GET(_request, { params }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) {
    return NextResponse.json(
      { error: 'Invalid product id, expected numeric', receivedId: id },
      { status: 400 }
    )
  }
  return NextResponse.json({
    endpoint: '/api/products/[id]',
    product: {
      id,
      name: `Product #${id}`,
      price: Number(id) * 9.9,
      inStock: true,
    },
    timestamp: new Date().toISOString(),
  })
}
