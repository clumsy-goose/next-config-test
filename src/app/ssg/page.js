// SSG: 构建期生成，运行期不再变化
export const dynamic = 'force-static'

const BUILD_TIME = new Date().toISOString()

export default function SSGPage() {
  return (
    <main>
      <h1>SSG Page</h1>
      <p data-testid="build-time">buildTime: {BUILD_TIME}</p>
      <p>构建期固定，多次访问内容不变。</p>
    </main>
  )
}
