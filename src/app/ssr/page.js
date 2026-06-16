// SSR: 每次请求都在服务端渲染
export const dynamic = 'force-dynamic'

export default async function SSRPage() {
  const renderedAt = new Date().toISOString()
  const random = Math.random().toString(36).slice(2, 10)
  return (
    <main>
      <h1>SSR Page</h1>
      {/* 用模板字面量合成单一 text node，避免 React 18 SSR 在动态值前后注入 <!----> 注释，
          导致测试脚本/外部抓取很难用正则截取数值。 */}
      <p data-testid="rendered-at">{`renderedAt: ${renderedAt}`}</p>
      <p data-testid="random">{`random: ${random}`}</p>
      <p>每次刷新都会变化（force-dynamic）。</p>
    </main>
  )
}
