'use client'

// 首页 - 端点测试入口与预期效果说明（交互版）
// 点击 "Run" 按钮即可发送 fetch 请求，结果展示在下方。
// 浏览器限制：
//   - redirect:'manual' 拿不到响应头/状态，故统一 redirect:'follow'
//     用 response.redirected + response.url 反映重定向链是否抵达预期目标。
//   - Cookie 通过 document.cookie 临时注入；fetch 完毕后清除，避免污染状态。
//   - X-SKIP-TOKEN: eop-1022 所有请求自动带上，匹配部署网关鉴权。

import { useState } from 'react'

const SKIP_TOKEN = { 'X-SKIP-TOKEN': 'eop-1022' }

// ============== 样式 ==============
const styles = {
  main: { maxWidth: 1180, margin: '0 auto', lineHeight: 1.6, color: '#222' },
  h1: { fontSize: 28, marginBottom: 4 },
  lead: { color: '#555', marginTop: 0 },
  section: {
    border: '1px solid #e5e5e5',
    borderRadius: 8,
    padding: '12px 16px',
    margin: '16px 0',
    background: '#fff',
  },
  h2: { fontSize: 18, margin: '4px 0 8px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: {
    textAlign: 'left',
    padding: '8px 10px',
    borderBottom: '1px solid #ddd',
    background: '#fafafa',
    fontWeight: 600,
  },
  td: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'top' },
  code: {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 13,
    background: '#f5f5f5',
    padding: '1px 5px',
    borderRadius: 3,
  },
  pill: {
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 600,
    border: '1px solid currentColor',
    marginLeft: 6,
  },
  pre: {
    background: '#0f172a',
    color: '#e2e8f0',
    padding: 12,
    borderRadius: 6,
    overflowX: 'auto',
    fontSize: 12.5,
    lineHeight: 1.45,
    maxHeight: 320,
  },
  small: { color: '#666', fontSize: 12 },
  btn: {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 13,
    cursor: 'pointer',
    border: '1px solid #2563eb',
    color: '#2563eb',
    background: '#fff',
    padding: '4px 10px',
    borderRadius: 4,
    textAlign: 'left',
    width: '100%',
  },
  btnRunning: { borderColor: '#a3a3a3', color: '#888', cursor: 'wait' },
  result: {
    marginTop: 8,
    border: '1px dashed #cbd5e1',
    borderRadius: 6,
    padding: 8,
    background: '#f8fafc',
  },
  badgeOk: { color: '#16a34a' },
  badgeBad: { color: '#dc2626' },
  badgeRedir: { color: '#ea580c' },
  link: { color: '#2563eb' },
}

function Pill({ color, children }) {
  return <span style={{ ...styles.pill, color }}>{children}</span>
}

// ============== 工具：带超时的 fetch + cookie 临时注入 ==============
function setCookie(name, value) {
  document.cookie = `${name}=${value}; path=/; SameSite=Lax`
}
function deleteCookie(name) {
  document.cookie = `${name}=; path=/; SameSite=Lax; expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

async function runFetch({ method = 'GET', path, headers = {}, body, cookies }) {
  const cookieKeys = cookies ? Object.keys(cookies) : []
  cookieKeys.forEach((k) => setCookie(k, cookies[k]))

  const start = performance.now()
  let result = { ok: false }
  try {
    const init = {
      method,
      headers: { ...SKIP_TOKEN, ...headers },
      redirect: 'follow',
      credentials: 'include',
      cache: 'no-store',
    }
    if (body !== undefined && body !== null) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body)
      const hasCT = Object.keys(init.headers).some(
        (k) => k.toLowerCase() === 'content-type'
      )
      if (!hasCT) init.headers['content-type'] = 'application/json'
    }
    const res = await fetch(path, init)
    const duration = Math.round(performance.now() - start)
    const text = await res.text()
    let parsed = null
    try {
      parsed = JSON.parse(text)
    } catch {}
    const responseHeaders = {}
    res.headers.forEach((v, k) => {
      responseHeaders[k.toLowerCase()] = v
    })
    result = {
      ok: true,
      status: res.status,
      statusText: res.statusText,
      type: res.type,
      redirected: res.redirected,
      finalUrl: res.url,
      headers: responseHeaders,
      bodyParsed: parsed,
      bodyText: parsed ? null : text,
      duration,
    }
  } catch (e) {
    result = {
      ok: false,
      error: String(e?.message || e),
      duration: Math.round(performance.now() - start),
    }
  } finally {
    cookieKeys.forEach((k) => deleteCookie(k))
  }
  return result
}

// ============== 结果展示 ==============
function ResultPanel({ result, focusHeaders = [] }) {
  if (!result) return null
  if (!result.ok && result.error) {
    return (
      <div style={styles.result}>
        <strong style={styles.badgeBad}>FETCH ERROR</strong>{' '}
        <span style={styles.small}>({result.duration} ms)</span>
        <div style={{ marginTop: 6 }}>
          <code style={styles.code}>{result.error}</code>
        </div>
        <div style={{ ...styles.small, marginTop: 6 }}>
          可能原因：跨域 (CORS) 阻断 / 部署网关拒绝 / 网络中断。
        </div>
      </div>
    )
  }

  const statusColor =
    result.status >= 500
      ? styles.badgeBad
      : result.status >= 400
      ? styles.badgeBad
      : result.status >= 300
      ? styles.badgeRedir
      : styles.badgeOk

  // 仅高亮"该用例最关心的"响应头；其余折叠在 details 里
  const focusKeys = focusHeaders.map((k) => k.toLowerCase())
  const focusEntries = focusKeys.map((k) => [k, result.headers[k]])
  const otherEntries = Object.entries(result.headers).filter(
    ([k]) => !focusKeys.includes(k)
  )

  return (
    <div style={styles.result}>
      <strong style={statusColor}>
        {result.status} {result.statusText}
      </strong>
      <span style={styles.small}> · {result.duration} ms · type={result.type}</span>
      {result.redirected && (
        <>
          {' · '}
          <span style={styles.badgeRedir}>redirected → {result.finalUrl}</span>
        </>
      )}

      {focusEntries.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
            关注的响应头
          </div>
          <table style={{ ...styles.table, fontSize: 12 }}>
            <tbody>
              {focusEntries.map(([k, v]) => (
                <tr key={k}>
                  <td style={{ ...styles.td, padding: '3px 6px', width: 220 }}>
                    <code style={styles.code}>{k}</code>
                  </td>
                  <td style={{ ...styles.td, padding: '3px 6px' }}>
                    {v == null ? (
                      <em style={styles.badgeBad}>(missing)</em>
                    ) : (
                      <code style={styles.code}>{v}</code>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details style={{ marginTop: 6 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12, color: '#475569' }}>
          全部响应头 ({otherEntries.length + focusEntries.length})
        </summary>
        <pre style={styles.pre}>
          {Object.entries(result.headers)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n')}
        </pre>
      </details>

      <details style={{ marginTop: 6 }} open>
        <summary style={{ cursor: 'pointer', fontSize: 12, color: '#475569' }}>
          响应 body
        </summary>
        <pre style={styles.pre}>
          {result.bodyParsed
            ? JSON.stringify(result.bodyParsed, null, 2)
            : result.bodyText || '(empty)'}
        </pre>
      </details>
    </div>
  )
}

// ============== 测试行 ==============
function TestRow({
  id,
  method = 'GET',
  path,
  headers,
  cookies,
  body,
  expect,
  focusHeaders,
}) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  async function onClick() {
    setLoading(true)
    const r = await runFetch({ method, path, headers, body, cookies })
    setResult(r)
    setLoading(false)
  }

  return (
    <tr>
      <td style={{ ...styles.td, width: 60 }}>
        <code style={styles.code}>{method}</code>
      </td>
      <td style={{ ...styles.td, width: '40%' }}>
        <button
          type="button"
          onClick={onClick}
          disabled={loading}
          style={{
            ...styles.btn,
            ...(loading ? styles.btnRunning : null),
          }}
          title="点击发送 fetch 请求"
        >
          {loading ? '正在请求…' : path}
        </button>
        {(headers || cookies) && (
          <div style={{ ...styles.small, marginTop: 4 }}>
            {headers &&
              Object.entries(headers).map(([k, v]) => (
                <div key={k}>
                  <code style={styles.code}>
                    {k}: {v}
                  </code>
                </div>
              ))}
            {cookies &&
              Object.entries(cookies).map(([k, v]) => (
                <div key={k}>
                  <code style={styles.code}>
                    cookie: {k}={v}
                  </code>
                </div>
              ))}
          </div>
        )}
      </td>
      <td style={styles.td}>
        <div>{expect}</div>
        <ResultPanel result={result} focusHeaders={focusHeaders} />
      </td>
    </tr>
  )
}

// ============== 渲染模式（保持直链：用户希望真正跳到那个页面） ==============
function RenderModesSection() {
  return (
    <section style={styles.section}>
      <h2 style={styles.h2}>① 渲染模式（ISR / SSR / CSR / SSG）</h2>
      <p style={styles.small}>
        这一组保留为直链跳转，便于在新页查看实际 HTML / 客户端水合行为。
      </p>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Mode</th>
            <th style={styles.th}>入口（新窗口打开）</th>
            <th style={styles.th}>预期效果</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={styles.td}>
              <Pill color="#dc2626">SSR</Pill>
            </td>
            <td style={styles.td}>
              <a style={styles.link} href="/ssr" target="_blank" rel="noreferrer">
                <code style={styles.code}>/ssr</code>
              </a>
            </td>
            <td style={styles.td}>
              每次刷新 <code style={styles.code}>renderedAt</code> /{' '}
              <code style={styles.code}>random</code> 都变化；响应头{' '}
              <code style={styles.code}>X-Render-Mode: ssr</code>、
              <code style={styles.code}>Cache-Control: no-store, must-revalidate</code>。
            </td>
          </tr>
          <tr>
            <td style={styles.td}>
              <Pill color="#16a34a">SSG</Pill>
            </td>
            <td style={styles.td}>
              <a style={styles.link} href="/ssg" target="_blank" rel="noreferrer">
                <code style={styles.code}>/ssg</code>
              </a>
            </td>
            <td style={styles.td}>
              多次访问 <code style={styles.code}>buildTime</code> 不变；响应头{' '}
              <code style={styles.code}>X-Render-Mode: ssg</code>。
            </td>
          </tr>
          <tr>
            <td style={styles.td}>
              <Pill color="#2563eb">ISR</Pill>
            </td>
            <td style={styles.td}>
              <a style={styles.link} href="/isr" target="_blank" rel="noreferrer">
                <code style={styles.code}>/isr</code>
              </a>{' '}
              ·{' '}
              <a
                style={styles.link}
                href="/isr?preview=1"
                target="_blank"
                rel="noreferrer"
              >
                <code style={styles.code}>/isr?preview=1</code>
              </a>
            </td>
            <td style={styles.td}>
              10s 内访问内容相同，超时下次访问触发后台再生；响应头{' '}
              <code style={styles.code}>X-Render-Mode: isr</code>；带{' '}
              <code style={styles.code}>?preview=1</code> 时额外注入{' '}
              <code style={styles.code}>X-Preview-Mode: isr-preview</code>。
            </td>
          </tr>
          <tr>
            <td style={styles.td}>
              <Pill color="#9333ea">CSR</Pill>
            </td>
            <td style={styles.td}>
              <a style={styles.link} href="/csr" target="_blank" rel="noreferrer">
                <code style={styles.code}>/csr</code>
              </a>
            </td>
            <td style={styles.td}>
              初始 HTML 仅显示 <em>Loading on client…</em>；挂载后客户端发起{' '}
              <code style={styles.code}>/api/hello?name=CSR</code>。
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}

// ============== 测试用例数据 ==============

// API 直访
const API_CASES = [
  {
    id: 'A1',
    method: 'GET',
    path: '/api/hello?name=Foo',
    expect: <>JSON <code style={styles.code}>{'{ message: "Hello, Foo!" }'}</code>。</>,
  },
  {
    id: 'A2',
    method: 'POST',
    path: '/api/hello',
    body: { x: 1 },
    expect: <>POST 回显：JSON <code style={styles.code}>received.x === 1</code>。</>,
  },
  {
    id: 'A3',
    method: 'GET',
    path: '/api/echo?k=v',
    expect: <>回显 query/headers/url；JSON <code style={styles.code}>query.k === "v"</code>。</>,
  },
  {
    id: 'A4',
    method: 'GET',
    path: '/api/headers',
    focusHeaders: ['X-Endpoint', 'X-Custom-Trace-Id', 'Cache-Control'],
    expect: (
      <>
        响应头注入：
        <code style={styles.code}>X-Endpoint: headers-inspector</code>、
        <code style={styles.code}>X-Custom-Trace-Id: trace-static-001</code>、
        <code style={styles.code}>Cache-Control: no-store</code>。
      </>
    ),
  },
  {
    id: 'A5',
    method: 'GET',
    path: '/api/health',
    expect: <>JSON <code style={styles.code}>status: "ok"</code>。</>,
  },
  {
    id: 'A6',
    method: 'GET',
    path: '/api/greeting',
    expect: <>未命中灰度：JSON <code style={styles.code}>channel: "stable"</code>。</>,
  },
  {
    id: 'A7',
    method: 'GET',
    path: '/api/products/42',
    focusHeaders: ['X-Product-Endpoint', 'Cache-Control'],
    expect: (
      <>
        响应头：
        <code style={styles.code}>X-Product-Endpoint: v1</code>、
        <code style={styles.code}>Cache-Control: public, s-maxage=60</code>；
        JSON <code style={styles.code}>product.id === "42"</code>。
      </>
    ),
  },
  {
    id: 'A8',
    method: 'GET',
    path: '/api/products/abc',
    expect: (
      <>
        <Pill color="#dc2626">400</Pill>{' '}
        <code style={styles.code}>error</code> 含 "Invalid product id"。
      </>
    ),
  },
  {
    id: 'A9',
    method: 'GET',
    path: '/api/v2/status',
    expect: <>JSON <code style={styles.code}>apiVersion: "v2"</code>。</>,
  },
  {
    id: 'A10',
    method: 'GET',
    path: '/api/cors/data',
    focusHeaders: [
      'Access-Control-Allow-Origin',
      'Access-Control-Allow-Methods',
      'X-CORS-Enabled',
    ],
    expect: <>响应头注入完整 CORS 允许字段，<code style={styles.code}>X-CORS-Enabled: 1</code>。</>,
  },
  {
    id: 'A11',
    method: 'GET',
    path: '/api/cached',
    focusHeaders: ['Cache-Control', 'X-Cache-Strategy'],
    expect: (
      <>
        响应头：
        <code style={styles.code}>
          Cache-Control: public, max-age=30, stale-while-revalidate=60
        </code>
        ；<code style={styles.code}>X-Cache-Strategy: swr</code>。
      </>
    ),
  },
  {
    id: 'A12',
    method: 'GET',
    path: '/api/auth/login',
    expect: <>JSON <code style={styles.code}>action: "please-login"</code>。</>,
  },
  {
    id: 'A13',
    method: 'GET',
    path: '/api/beta/greeting',
    expect: <>JSON <code style={styles.code}>channel: "beta"</code>。</>,
  },
  {
    id: 'A14',
    method: 'GET',
    path: '/api/help/intro?from=docs',
    expect: <>JSON <code style={styles.code}>section: "intro", from: "docs"</code>。</>,
  },
]

// Redirects（浏览器 fetch 默认 follow，看 redirected + finalUrl）
const REDIRECT_CASES = [
  {
    id: 'R1',
    path: '/home',
    expect: (
      <>
        308 → <code style={styles.code}>/</code>；fetch 跟随到首页 HTML，
        <strong>redirected: true</strong>，finalUrl 应以 <code style={styles.code}>/</code> 结尾。
      </>
    ),
  },
  {
    id: 'R2',
    path: '/old-products/123',
    expect: (
      <>
        307 → <code style={styles.code}>/api/products/123</code>；body 为 product JSON，
        <strong>redirected: true</strong>。
      </>
    ),
  },
  {
    id: 'R3',
    path: '/legacy-api/products/9',
    expect: (
      <>
        308 → <code style={styles.code}>/api/v1/products/9</code>，再被 BR1 重写到{' '}
        <code style={styles.code}>/api/products/9</code>；body 为 product JSON。
      </>
    ),
  },
  {
    id: 'R4',
    path: '/search?legacy=true',
    expect: (
      <>
        307 → <code style={styles.code}>/api/health</code>；body 为 health JSON，
        <strong>redirected: true</strong>。
      </>
    ),
  },
  {
    id: 'R4n',
    path: '/search',
    expect: <>无 <code style={styles.code}>legacy=true</code> 不重定向，期望 404。</>,
  },
  {
    id: 'R5',
    path: '/account/orders',
    expect: <>无 session cookie → 307 → <code style={styles.code}>/api/auth/login</code>。</>,
  },
  {
    id: 'R5n',
    path: '/account/orders',
    cookies: { session: 'abc' },
    expect: <>带 session cookie → 不重定向，期望 404。</>,
  },
  {
    id: 'R7',
    path: '/u/42',
    expect: <>307 → <code style={styles.code}>/api/products/42</code>。</>,
  },
  {
    id: 'R7n',
    path: '/u/abc',
    expect: <>非数字未命中正则 → 不重定向，期望 404。</>,
  },
  {
    id: 'R8',
    path: '/docs/intro',
    expect: <>307 → <code style={styles.code}>/api/help/intro?from=docs</code>。</>,
  },
  {
    id: 'R9',
    path: '/go/github',
    expect: (
      <>
        308 → <code style={styles.code}>https://github.com/vercel/next.js</code>。
        <br />
        <span style={styles.small}>
          ⚠️ 浏览器 fetch 跟随跨域 3xx 后会因 CORS 失败，结果会显示{' '}
          <em>FETCH ERROR</em>，这正是预期；用 curl 或 test-runner 验证。
        </span>
      </>
    ),
  },
  {
    id: 'R10',
    path: '/trigger-redirect',
    headers: { 'x-redirect-test': '1' },
    expect: <>命中 has header → 307 → <code style={styles.code}>/api/health</code>。</>,
  },
  {
    id: 'R10n',
    path: '/trigger-redirect',
    expect: <>未带触发 header → 不重定向，期望 404。</>,
  },
  {
    id: 'R11',
    path: '/private/dashboard',
    expect: <>无 x-api-key → 307 → <code style={styles.code}>/api/auth/login</code>。</>,
  },
  {
    id: 'R11n',
    path: '/private/dashboard',
    headers: { 'x-api-key': 'k' },
    expect: <>带 x-api-key → 不重定向，期望 404。</>,
  },
]

// Rewrites（URL 不变，body 来自目标）
const REWRITE_CASES = [
  {
    id: 'BR1a',
    path: '/api/v1/health',
    expect: <>BR1：内容同 <code style={styles.code}>/api/health</code>，JSON <code style={styles.code}>endpoint: "/api/health"</code>。</>,
  },
  {
    id: 'BR1b',
    path: '/api/v1/products/7',
    expect: <>BR1：JSON <code style={styles.code}>product.id === "7"</code>。</>,
  },
  {
    id: 'BR2',
    path: '/api/greeting',
    headers: { 'x-canary': 'always' },
    expect: <>BR2：has header 灰度命中，<code style={styles.code}>channel: "beta"</code>。</>,
  },
  {
    id: 'BR3',
    path: '/api/greeting',
    cookies: { canary: 'true' },
    expect: <>BR3：has cookie 灰度命中，<code style={styles.code}>channel: "beta"</code>。</>,
  },
  {
    id: 'BR4',
    path: '/api/greeting?beta=1',
    expect: <>BR4：has query 灰度命中，<code style={styles.code}>channel: "beta"</code>。</>,
  },
  {
    id: 'AR1',
    path: '/healthz',
    expect: <>AR1：内容同 <code style={styles.code}>/api/health</code>。</>,
  },
  {
    id: 'AR2',
    path: '/status',
    expect: <>AR2：内容同 <code style={styles.code}>/api/v2/status</code>。</>,
  },
  {
    id: 'AR3',
    path: '/shop/55',
    expect: <>AR3：JSON <code style={styles.code}>product.id === "55"</code>。</>,
  },
  {
    id: 'AR3n',
    path: '/shop/abc',
    expect: <>AR3：正则段未命中 → 404。</>,
  },
  {
    id: 'AR4',
    path: '/echo-it?msg=hi',
    expect: (
      <>
        AR4：JSON <code style={styles.code}>{'pathname: "/api/echo"'}</code>、
        <code style={styles.code}>{'query: { from: "alias", msg: "hi" }'}</code>。
      </>
    ),
  },
  {
    id: 'FR1',
    path: '/proxy/posts/1',
    expect: <>FR1：反向代理外部 jsonplaceholder，body 含 <code style={styles.code}>id: 1, title, body</code>。</>,
  },
  {
    id: 'FR1n',
    path: '/proxy/posts/abc',
    expect: <>FR1：正则段未命中 → 404。</>,
  },
]

// 条件 headers / authorization 相关
const CONDITIONAL_CASES = [
  {
    id: 'H6',
    path: '/api/headers',
    cookies: { debug: 'on' },
    focusHeaders: ['X-Debug-Mode', 'X-Debug-Source'],
    expect: <>has cookie debug=on → 注入 <code style={styles.code}>X-Debug-Mode: enabled</code>。</>,
  },
  {
    id: 'H6n',
    path: '/api/headers',
    focusHeaders: ['X-Debug-Mode'],
    expect: <>未带 debug cookie → <code style={styles.code}>X-Debug-Mode</code> 不应出现。</>,
  },
  {
    id: 'H7',
    path: '/api/headers',
    headers: { 'x-tenant': 'acme' },
    focusHeaders: ['X-Tenant-Resolved', 'Vary'],
    expect: <>has header x-tenant=acme → 注入 <code style={styles.code}>X-Tenant-Resolved: acme</code>。</>,
  },
  {
    id: 'H7n',
    path: '/api/headers',
    focusHeaders: ['X-Tenant-Resolved'],
    expect: <>未带 x-tenant → <code style={styles.code}>X-Tenant-Resolved</code> 不应出现。</>,
  },
  {
    id: 'H9',
    path: '/api/secure/data',
    focusHeaders: ['WWW-Authenticate', 'X-Auth-Required'],
    expect: <>未带 Authorization → 401 + <code style={styles.code}>WWW-Authenticate</code>。</>,
  },
  {
    id: 'H9n',
    path: '/api/secure/data',
    headers: { authorization: 'Bearer xyz' },
    focusHeaders: ['WWW-Authenticate', 'X-Auth-Required'],
    expect: <>带 Authorization → 200，挑战头不再下发。</>,
  },
  {
    id: 'P5',
    path: '/isr?preview=1',
    focusHeaders: ['X-Preview-Mode', 'Cache-Control', 'X-Render-Mode'],
    expect: <>has query preview=1 → 注入 <code style={styles.code}>X-Preview-Mode: isr-preview</code> + <code style={styles.code}>no-store</code>。</>,
  },
]

function CaseTable({ cases }) {
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={{ ...styles.th, width: 60 }}>Method</th>
          <th style={{ ...styles.th, width: '40%' }}>路径（点击 Run）</th>
          <th style={styles.th}>预期效果 / 结果</th>
        </tr>
      </thead>
      <tbody>
        {cases.map((c) => (
          <TestRow key={c.id} {...c} />
        ))}
      </tbody>
    </table>
  )
}

// ============== 一键运行所有 ==============
function RunAllButton({ cases, label }) {
  const [running, setRunning] = useState(false)
  const [summary, setSummary] = useState(null)

  async function onClick() {
    setRunning(true)
    setSummary({ done: 0, total: cases.length, started: Date.now() })
    let ok = 0
    let bad = 0
    for (const c of cases) {
      const r = await runFetch(c)
      if (r.ok && r.status < 500) ok++
      else bad++
      setSummary({
        done: ok + bad,
        total: cases.length,
        ok,
        bad,
        started: Date.now(),
      })
    }
    setRunning(false)
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        onClick={onClick}
        disabled={running}
        style={{
          ...styles.btn,
          width: 'auto',
          padding: '6px 14px',
          fontWeight: 600,
        }}
      >
        {running ? `运行中 ${summary?.done || 0}/${summary?.total || 0}` : label}
      </button>
      {summary && !running && (
        <span style={{ marginLeft: 10, fontSize: 12, color: '#475569' }}>
          完成：{summary.ok} 个 fetch 成功 · {summary.bad} 个失败/CORS 错误
          。详细结果请到上方各行查看（每行单独点击 Run 显示）。
        </span>
      )}
    </div>
  )
}

// ============== 入口 ==============
export default function HomePage() {
  return (
    <main style={styles.main}>
      <h1 style={styles.h1}>Next Config Test · 端点交互看板</h1>
      <p style={styles.lead}>
        ISR / SSR / CSR / SSG 与 <code style={styles.code}>next.config.js</code> 中{' '}
        <code style={styles.code}>headers</code> /{' '}
        <code style={styles.code}>redirects</code> /{' '}
        <code style={styles.code}>rewrites</code>{' '}
        的可点击测试看板。每行点击即发送 fetch，结果展示在右侧。
      </p>
      <p style={styles.small}>
        ⚠️ 全站请求自动带 <code style={styles.code}>X-SKIP-TOKEN: eop-1022</code>{' '}
        以匹配部署网关。Cookie 在请求前临时注入，请求后立即清除。浏览器 fetch
        默认 <code style={styles.code}>redirect: 'follow'</code>，故 3xx 用例会观察到{' '}
        <code style={styles.code}>redirected: true</code>{' '}
        与最终落地的 <code style={styles.code}>finalUrl</code>，无法直接看到 307/308 状态码本身（这部分由
        <code style={styles.code}>test-runner.mjs</code> 用 manual 模式严格断言）。
        完整规范见{' '}
        <a
          style={styles.link}
          href="https://github.com/clumsy-goose/next-config-test/blob/main/TEST_SPEC.md"
        >
          TEST_SPEC.md
        </a>
        。
      </p>

      <RenderModesSection />

      <section style={styles.section}>
        <h2 style={styles.h2}>② API 端点（直接访问）</h2>
        <CaseTable cases={API_CASES} />
        <RunAllButton cases={API_CASES} label="▶ Run all API cases" />
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>③ Redirects（fetch follow，观察 redirected + finalUrl）</h2>
        <CaseTable cases={REDIRECT_CASES} />
        <RunAllButton cases={REDIRECT_CASES} label="▶ Run all redirect cases" />
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>④ Rewrites（URL 不变，body 来自重写目标）</h2>
        <CaseTable cases={REWRITE_CASES} />
        <RunAllButton cases={REWRITE_CASES} label="▶ Run all rewrite cases" />
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>⑤ 条件用例（has / missing：cookie · header · query）</h2>
        <p style={styles.small}>
          这一组依赖请求头 / cookie / query 触发，链接无法直接表达，因此必须用 fetch
          注入条件并即时清理。点击下方 Run 即可。
        </p>
        <CaseTable cases={CONDITIONAL_CASES} />
        <RunAllButton cases={CONDITIONAL_CASES} label="▶ Run all conditional cases" />
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>⑥ 一键自动化（CLI，含严格 3xx 状态断言）</h2>
        <pre style={styles.pre}>{`# 本地：先 npm run build && npm run start
node test-runner.mjs http://localhost:3000

# 部署后：
node test-runner.mjs https://your-app.example.com`}</pre>
        <p style={styles.small}>
          脚本零依赖，覆盖 50+ 用例，使用{' '}
          <code style={styles.code}>redirect: 'manual'</code>{' '}
          严格断言 3xx 状态码与 Location；任意用例失败则进程退出码非 0。
        </p>
      </section>
    </main>
  )
}
