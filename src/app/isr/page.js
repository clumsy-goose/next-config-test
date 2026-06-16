// ISR: 静态生成 + 定时再生 (每 10 秒)
export const revalidate = 10

export default async function ISRPage() {
  const renderedAt = new Date().toISOString()
  return (
    <main>
      <h1>ISR Page</h1>
      {/* 单一 text node 写法，避免 React SSR 注释切断动态值。 */}
      <p data-testid="rendered-at">{`renderedAt: ${renderedAt}`}</p>
      <p>10 秒内访问得到相同内容；超时后下一次访问会触发后台再生。</p>
    </main>
  )
}
