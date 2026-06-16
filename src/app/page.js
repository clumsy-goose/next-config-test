export default function HomePage() {
  return (
    <main>
      <h1>Next Config Test</h1>
      <p>验证 ISR / SSR / CSR / SSG 与 next.config.js 中 headers / redirects / rewrites 配置。</p>
      <ul>
        <li><a href="/ssr">/ssr</a> — Server-Side Rendering</li>
        <li><a href="/ssg">/ssg</a> — Static Site Generation</li>
        <li><a href="/isr">/isr</a> — Incremental Static Regeneration</li>
        <li><a href="/csr">/csr</a> — Client-Side Rendering</li>
        <li><a href="/api/hello">/api/hello</a></li>
        <li><a href="/api/headers">/api/headers</a></li>
        <li><a href="/api/health">/api/health</a></li>
      </ul>
    </main>
  )
}
