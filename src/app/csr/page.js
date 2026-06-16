'use client'

// CSR: 数据全部在客户端获取
import { useEffect, useState } from 'react'

export default function CSRPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const start = Date.now()
    fetch('/api/hello?name=CSR', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => setData({ ...json, fetchedAt: new Date().toISOString(), latencyMs: Date.now() - start }))
      .catch((e) => setError(String(e)))
  }, [])

  return (
    <main>
      <h1>CSR Page</h1>
      {!data && !error && <p>Loading on client…</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      {data && (
        <pre data-testid="csr-data" style={{ background: '#f5f5f5', padding: 12 }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
      <p>本页 HTML 框架是静态的，数据由浏览器在挂载后请求。</p>
    </main>
  )
}
