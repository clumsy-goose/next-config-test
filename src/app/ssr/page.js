// SSR: 每次请求都在服务端渲染
export const dynamic = 'force-dynamic'

export default async function SSRPage() {
  const renderedAt = new Date().toISOString()
  const random = Math.random().toString(36).slice(2, 10)
  return (
    <main>
      <h1>SSR Page</h1>
      <p data-testid="rendered-at">renderedAt: {renderedAt}</p>
      <p data-testid="random">random: {random}</p>
      <p>每次刷新都会变化（force-dynamic）。</p>
    </main>
  )
}
