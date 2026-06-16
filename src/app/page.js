'use client'

// 首页 - 端点交互看板
// 交互策略：
//   - ② API 端点：点击 Run 发送 fetch，结果展示在该行内（可看响应头/JSON）。
//   - ③ Redirects / ④ Rewrites：默认渲染为 <a target="_blank">，点击 → 浏览器
//     直接导航到目的地。新标签页地址栏会显示最终 URL（重定向后改变 / 重写后不变），
//     页面 body 即重写或重定向目标的 JSON，自带 endpoint 字段说明实际命中路由。
//     如该用例必须设置 cookie / 自定义 header（链接无法表达），则自动降级为 fetch。
//   - ⑤ 条件用例：必须 fetch（cookie/header 不能由链接触发）。
// 所有 fetch 请求自动携带 X-SKIP-TOKEN: eop-1022。Cookie 临时注入后立即清除。

import { useState } from 'react'

const SKIP_TOKEN = { 'X-SKIP-TOKEN': 'eop-1022' }

// ============== 样式 ==============
const styles = {
  main: {
    maxWidth: 1080,
    margin: '0 auto',
    lineHeight: 1.55,
    color: '#222',
    padding: '0 12px',
    boxSizing: 'border-box',
  },
  h1: { fontSize: 24, marginBottom: 4 },
  lead: { color: '#555', marginTop: 0, fontSize: 14 },
  section: {
    border: '1px solid #e5e5e5',
    borderRadius: 8,
    padding: '12px 14px',
    margin: '14px 0',
    background: '#fff',
    overflow: 'hidden', // 防止内部溢出撑大父级
  },
  h2: { fontSize: 17, margin: '4px 0 8px' },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
    tableLayout: 'fixed', // 关键：固定表格布局，列宽不会因内容撑开
  },
  th: {
    textAlign: 'left',
    padding: '6px 8px',
    borderBottom: '1px solid #ddd',
    background: '#fafafa',
    fontWeight: 600,
  },
  td: {
    padding: '6px 8px',
    borderBottom: '1px solid #f0f0f0',
    verticalAlign: 'top',
    overflow: 'hidden',
    wordBreak: 'break-word',
  },
  code: {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
    background: '#f5f5f5',
    padding: '1px 4px',
    borderRadius: 3,
    wordBreak: 'break-all',
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
    padding: 10,
    borderRadius: 6,
    overflowX: 'auto',
    overflowY: 'auto',
    fontSize: 12,
    lineHeight: 1.45,
    maxHeight: 260,
    margin: 0,
    whiteSpace: 'pre',
  },
  small: { color: '#666', fontSize: 12 },
  btn: {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
    cursor: 'pointer',
    border: '1px solid #2563eb',
    color: '#2563eb',
    background: '#fff',
    padding: '4px 8px',
    borderRadius: 4,
    textAlign: 'left',
    width: '100%',
    wordBreak: 'break-all',
  },
  btnRunning: { borderColor: '#a3a3a3', color: '#888', cursor: 'wait' },
  navLink: {
    display: 'inline-block',
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
    color: '#2563eb',
    textDecoration: 'none',
    border: '1px solid #2563eb',
    borderRadius: 4,
    padding: '4px 8px',
    wordBreak: 'break-all',
    background: '#fff',
  },
  navHint: { fontSize: 11, color: '#888', marginTop: 3 },
  result: {
    marginTop: 6,
    border: '1px dashed #cbd5e1',
    borderRadius: 6,
    padding: 8,
    background: '#f8fafc',
    overflow: 'hidden',
    maxWidth: '100%',
  },
  badgeOk: { color: '#16a34a' },
  badgeBad: { color: '#dc2626' },
  badgeRedir: { color: '#ea580c' },
  link: { color: '#2563eb' },
}

function Pill({ color, children }) {
  return <span style={{ ...styles.pill, color }}>{children}</span>
}

// ============== Cookie 临时注入 ==============
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

// ============== 结果面板 ==============
function ResultPanel({ result, focusHeaders = [] }) {
  if (!result) return null
  if (!result.ok && result.error) {
    return (
      <div style={styles.result}>
        <strong style={styles.badgeBad}>FETCH ERROR</strong>{' '}
        <span style={styles.small}>({result.duration} ms)</span>
        <div style={{ marginTop: 4 }}>
          <code style={styles.code}>{result.error}</code>
        </div>
        <div style={{ ...styles.small, marginTop: 4 }}>
          可能原因：跨域 / 网关拒绝 / 网络异常。
        </div>
      </div>
    )
  }

  const statusColor =
    result.status >= 400
      ? styles.badgeBad
      : result.status >= 300
      ? styles.badgeRedir
      : styles.badgeOk
  const focusKeys = focusHeaders.map((k) => k.toLowerCase())
  const focusEntries = focusKeys.map((k) => [k, result.headers[k]])

  return (
    <div style={styles.result}>
      <strong style={statusColor}>
        {result.status} {result.statusText}
      </strong>
      <span style={styles.small}> · {result.duration} ms</span>
      {result.redirected && (
        <div style={{ ...styles.small, marginTop: 2 }}>
          <span style={styles.badgeRedir}>redirected</span> →{' '}
          <code style={styles.code}>{result.finalUrl}</code>
        </div>
      )}

      {focusEntries.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>
            关注的响应头
          </div>
          <table style={{ ...styles.table, fontSize: 11 }}>
            <colgroup>
              <col style={{ width: '45%' }} />
              <col style={{ width: '55%' }} />
            </colgroup>
            <tbody>
              {focusEntries.map(([k, v]) => (
                <tr key={k}>
                  <td style={{ ...styles.td, padding: '2px 4px' }}>
                    <code style={styles.code}>{k}</code>
                  </td>
                  <td style={{ ...styles.td, padding: '2px 4px' }}>
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
        <summary style={{ cursor: 'pointer', fontSize: 11, color: '#475569' }}>
          全部响应头
        </summary>
        <pre style={styles.pre}>
          {Object.entries(result.headers)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n')}
        </pre>
      </details>

      <details style={{ marginTop: 6 }} open>
        <summary style={{ cursor: 'pointer', fontSize: 11, color: '#475569' }}>
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

// ============== Fetch 行（点击 Run，结果内联） ==============
function FetchRow({ method = 'GET', path, headers, cookies, body, expect, focusHeaders }) {
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
      <td style={styles.td}>
        <code style={styles.code}>{method}</code>
      </td>
      <td style={styles.td}>
        <button
          type="button"
          onClick={onClick}
          disabled={loading}
          style={{ ...styles.btn, ...(loading ? styles.btnRunning : null) }}
          title="点击发送 fetch 请求（结果展示在右侧）"
        >
          {loading ? '正在请求…' : path}
        </button>
        {(headers || cookies) && (
          <div style={{ ...styles.small, marginTop: 3 }}>
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
                    cookie {k}={v}
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

// ============== 直链行（target=_blank，浏览器导航） ==============
function NavigateRow({ method = 'GET', path, expect, navHint }) {
  return (
    <tr>
      <td style={styles.td}>
        <code style={styles.code}>{method}</code>
      </td>
      <td style={styles.td}>
        <a
          href={path}
          target="_blank"
          rel="noreferrer"
          style={styles.navLink}
          title="点击在新标签页打开（注意地址栏的最终 URL）"
        >
          {path}
        </a>
        <div style={styles.navHint}>{navHint || '↗ 在新标签页打开'}</div>
      </td>
      <td style={styles.td}>{expect}</td>
    </tr>
  )
}

// ============== 智能行：有 cookie/header 自动降级 fetch，否则导航 ==============
function SmartRow(props) {
  const { headers, cookies, body, method = 'GET' } = props
  const needsFetch = cookies || headers || body || method !== 'GET'
  return needsFetch ? <FetchRow {...props} /> : <NavigateRow {...props} />
}

// ============== 渲染模式（保持直链） ==============
function RenderModesSection() {
  return (
    <section style={styles.section}>
      <h2 style={styles.h2}>① 渲染模式（ISR / SSR / CSR / SSG）</h2>
      <p style={styles.small}>
        点击在新标签页打开，DevTools Network 可看响应头中的{' '}
        <code style={styles.code}>X-Render-Mode</code>。
      </p>
      <table style={styles.table}>
        <colgroup>
          <col style={{ width: 70 }} />
          <col style={{ width: '40%' }} />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th style={styles.th}>Mode</th>
            <th style={styles.th}>入口</th>
            <th style={styles.th}>预期效果</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={styles.td}><Pill color="#dc2626">SSR</Pill></td>
            <td style={styles.td}>
              <a style={styles.navLink} href="/ssr" target="_blank" rel="noreferrer">/ssr</a>
            </td>
            <td style={styles.td}>
              每次刷新 <code style={styles.code}>renderedAt</code> /{' '}
              <code style={styles.code}>random</code> 都变化；响应头{' '}
              <code style={styles.code}>X-Render-Mode: ssr</code>、
              <code style={styles.code}>Cache-Control: no-store</code>。
            </td>
          </tr>
          <tr>
            <td style={styles.td}><Pill color="#16a34a">SSG</Pill></td>
            <td style={styles.td}>
              <a style={styles.navLink} href="/ssg" target="_blank" rel="noreferrer">/ssg</a>
            </td>
            <td style={styles.td}>
              多次访问 <code style={styles.code}>buildTime</code> 不变；响应头{' '}
              <code style={styles.code}>X-Render-Mode: ssg</code>。
            </td>
          </tr>
          <tr>
            <td style={styles.td}><Pill color="#2563eb">ISR</Pill></td>
            <td style={styles.td}>
              <a style={styles.navLink} href="/isr" target="_blank" rel="noreferrer">/isr</a>
              <div style={styles.navHint}>
                <a style={styles.link} href="/isr?preview=1" target="_blank" rel="noreferrer">
                  /isr?preview=1
                </a>
              </div>
            </td>
            <td style={styles.td}>
              10s 内访问内容相同，超时下次访问触发后台再生；带{' '}
              <code style={styles.code}>?preview=1</code> 时注入{' '}
              <code style={styles.code}>X-Preview-Mode: isr-preview</code>。
            </td>
          </tr>
          <tr>
            <td style={styles.td}><Pill color="#9333ea">CSR</Pill></td>
            <td style={styles.td}>
              <a style={styles.navLink} href="/csr" target="_blank" rel="noreferrer">/csr</a>
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

// API 直访（fetch）
const API_CASES = [
  { id: 'A1', method: 'GET', path: '/api/hello?name=Foo',
    expect: <>JSON <code style={styles.code}>{'{ message: "Hello, Foo!" }'}</code></> },
  { id: 'A2', method: 'POST', path: '/api/hello', body: { x: 1 },
    expect: <>POST 回显，<code style={styles.code}>received.x === 1</code></> },
  { id: 'A3', method: 'GET', path: '/api/echo?k=v',
    expect: <>回显 query/headers，<code style={styles.code}>query.k === "v"</code></> },
  { id: 'A4', method: 'GET', path: '/api/headers',
    focusHeaders: ['X-Endpoint', 'X-Custom-Trace-Id', 'Cache-Control'],
    expect: <>注入 <code style={styles.code}>X-Endpoint</code>、<code style={styles.code}>X-Custom-Trace-Id</code>、<code style={styles.code}>Cache-Control: no-store</code></> },
  { id: 'A5', method: 'GET', path: '/api/health',
    expect: <>JSON <code style={styles.code}>status: "ok"</code></> },
  { id: 'A6', method: 'GET', path: '/api/greeting',
    expect: <>JSON <code style={styles.code}>channel: "stable"</code></> },
  { id: 'A7', method: 'GET', path: '/api/products/42',
    focusHeaders: ['X-Product-Endpoint', 'Cache-Control'],
    expect: <><code style={styles.code}>X-Product-Endpoint: v1</code>、<code style={styles.code}>s-maxage=60</code>，product.id=42</> },
  { id: 'A8', method: 'GET', path: '/api/products/abc',
    expect: <><Pill color="#dc2626">400</Pill> <code style={styles.code}>error</code> 含 "Invalid product id"</> },
  { id: 'A9', method: 'GET', path: '/api/v2/status',
    expect: <>JSON <code style={styles.code}>apiVersion: "v2"</code></> },
  { id: 'A10', method: 'GET', path: '/api/cors/data',
    focusHeaders: ['Access-Control-Allow-Origin', 'Access-Control-Allow-Methods', 'X-CORS-Enabled'],
    expect: <>注入完整 CORS 头 + <code style={styles.code}>X-CORS-Enabled: 1</code></> },
  { id: 'A11', method: 'GET', path: '/api/cached',
    focusHeaders: ['Cache-Control', 'X-Cache-Strategy'],
    expect: <>注入 SWR <code style={styles.code}>Cache-Control</code> + <code style={styles.code}>X-Cache-Strategy: swr</code></> },
  { id: 'A12', method: 'GET', path: '/api/auth/login',
    expect: <>JSON <code style={styles.code}>action: "please-login"</code></> },
  { id: 'A13', method: 'GET', path: '/api/beta/greeting',
    expect: <>JSON <code style={styles.code}>channel: "beta"</code></> },
  { id: 'A14', method: 'GET', path: '/api/help/intro?from=docs',
    expect: <>JSON <code style={styles.code}>section: "intro", from: "docs"</code></> },
]

// Redirects（默认导航；R5n/R10/R11n 必须 fetch）
const REDIRECT_CASES = [
  { id: 'R1', path: '/home',
    navHint: '↗ 应跳转到首页 /，地址栏 URL 变化',
    expect: <>308 → <code style={styles.code}>/</code>。新标签页地址栏会变成 <code style={styles.code}>/</code>。</> },
  { id: 'R2', path: '/old-products/123',
    navHint: '↗ 跳到 /api/products/123，地址栏会变化',
    expect: <>307 → <code style={styles.code}>/api/products/123</code>，body 是 product JSON。</> },
  { id: 'R3', path: '/legacy-api/products/9',
    navHint: '↗ 跳到 /api/v1/products/9（再被 BR1 重写）',
    expect: <>308 → <code style={styles.code}>/api/v1/products/9</code>；BR1 再重写到 <code style={styles.code}>/api/products/9</code>。地址栏停在 v1 路径，body 是 product JSON。</> },
  { id: 'R4', path: '/search?legacy=true',
    navHint: '↗ 跳到 /api/health',
    expect: <>带 legacy=true → 307 → <code style={styles.code}>/api/health</code>。</> },
  { id: 'R4n', path: '/search',
    navHint: '↗ 不重定向，直接 404 页面',
    expect: <>无 legacy=true → 不重定向 → 404。</> },
  { id: 'R5', path: '/account/orders',
    navHint: '↗ 无 session cookie → 跳到登录',
    expect: <>无 session → 307 → <code style={styles.code}>/api/auth/login</code>。</> },
  { id: 'R5n', path: '/account/orders', cookies: { session: 'abc' },
    expect: <>带 session cookie → 不重定向 → 404（cookie 须 fetch 注入）。</> },
  { id: 'R7', path: '/u/42',
    navHint: '↗ 数字 → 跳到 /api/products/42',
    expect: <>307 → <code style={styles.code}>/api/products/42</code>。</> },
  { id: 'R7n', path: '/u/abc',
    navHint: '↗ 非数字 → 不重定向 → 404',
    expect: <>正则段未命中 → 不重定向 → 404。</> },
  { id: 'R8', path: '/docs/intro',
    navHint: '↗ 跳到 /api/help/intro?from=docs',
    expect: <>307 → <code style={styles.code}>/api/help/intro?from=docs</code>。</> },
  { id: 'R9', path: '/go/github',
    navHint: '↗ 跨域跳到 GitHub 仓库',
    expect: <>308 → <code style={styles.code}>https://github.com/vercel/next.js</code>（地址栏会跳到 github.com）。</> },
  { id: 'R10', path: '/trigger-redirect', headers: { 'x-redirect-test': '1' },
    expect: <>has header 触发 → 307 → <code style={styles.code}>/api/health</code>（header 须 fetch 注入）。</> },
  { id: 'R10n', path: '/trigger-redirect',
    navHint: '↗ 无触发 header → 不重定向 → 404',
    expect: <>未带 x-redirect-test → 不重定向 → 404。</> },
  { id: 'R11', path: '/private/dashboard',
    navHint: '↗ 无 x-api-key → 跳到登录',
    expect: <>无 x-api-key → 307 → <code style={styles.code}>/api/auth/login</code>。</> },
  { id: 'R11n', path: '/private/dashboard', headers: { 'x-api-key': 'k' },
    expect: <>带 x-api-key → 不重定向 → 404（header 须 fetch 注入）。</> },
]

// Rewrites（默认导航；BR2/BR3 须 fetch）
const REWRITE_CASES = [
  { id: 'BR1a', path: '/api/v1/health',
    navHint: '↗ URL 不变，body 来自 /api/health',
    expect: <>BR1：URL 仍是 v1，body <code style={styles.code}>endpoint: "/api/health"</code>。</> },
  { id: 'BR1b', path: '/api/v1/products/7',
    navHint: '↗ URL 不变，body 来自 /api/products/7',
    expect: <>BR1：body <code style={styles.code}>product.id === "7"</code>。</> },
  { id: 'BR2', path: '/api/greeting', headers: { 'x-canary': 'always' },
    expect: <>BR2：has header 灰度 → <code style={styles.code}>channel: "beta"</code>（header 须 fetch 注入）。</> },
  { id: 'BR3', path: '/api/greeting', cookies: { canary: 'true' },
    expect: <>BR3：has cookie 灰度 → <code style={styles.code}>channel: "beta"</code>（cookie 须 fetch 注入）。</> },
  { id: 'BR4', path: '/api/greeting?beta=1',
    navHint: '↗ has query 灰度，URL 不变',
    expect: <>BR4：URL 仍是 /api/greeting?beta=1，body <code style={styles.code}>channel: "beta"</code>。</> },
  { id: 'AR1', path: '/healthz',
    navHint: '↗ URL 仍是 /healthz，body 来自 /api/health',
    expect: <>AR1：地址栏 /healthz，body <code style={styles.code}>endpoint: "/api/health"</code>。</> },
  { id: 'AR2', path: '/status',
    navHint: '↗ URL 仍是 /status，body 来自 /api/v2/status',
    expect: <>AR2：body <code style={styles.code}>apiVersion: "v2"</code>。</> },
  { id: 'AR3', path: '/shop/55',
    navHint: '↗ URL 仍是 /shop/55，body 来自 /api/products/55',
    expect: <>AR3：body <code style={styles.code}>product.id === "55"</code>。</> },
  { id: 'AR3n', path: '/shop/abc',
    navHint: '↗ 正则未命中 → 404',
    expect: <>AR3：正则段未命中 → 404。</> },
  { id: 'AR4', path: '/echo-it?msg=hi',
    navHint: '↗ URL 仍是 /echo-it?msg=hi，body 显示 query 重组',
    expect: <>AR4：body <code style={styles.code}>{'pathname: "/api/echo"'}</code>、<code style={styles.code}>{'query: { from: "alias", msg: "hi" }'}</code>。</> },
  { id: 'FR1', path: '/proxy/posts/1',
    navHint: '↗ URL 仍是 /proxy/posts/1，body 来自 jsonplaceholder',
    expect: <>FR1：fallback 反向代理外部 API，body 含 <code style={styles.code}>id: 1</code>。</> },
  { id: 'FR1n', path: '/proxy/posts/abc',
    navHint: '↗ 正则未命中 → 404',
    expect: <>FR1：正则段未命中 → 404。</> },
]

// 条件用例（只能 fetch）
const CONDITIONAL_CASES = [
  { id: 'H6', path: '/api/headers', cookies: { debug: 'on' },
    focusHeaders: ['X-Debug-Mode', 'X-Debug-Source'],
    expect: <>has cookie debug=on → 注入 <code style={styles.code}>X-Debug-Mode: enabled</code>。</> },
  { id: 'H6n', path: '/api/headers',
    focusHeaders: ['X-Debug-Mode'],
    expect: <>未带 cookie → <code style={styles.code}>X-Debug-Mode</code> 不应出现。</> },
  { id: 'H7', path: '/api/headers', headers: { 'x-tenant': 'acme' },
    focusHeaders: ['X-Tenant-Resolved', 'Vary'],
    expect: <>has header → 注入 <code style={styles.code}>X-Tenant-Resolved: acme</code>。</> },
  { id: 'H7n', path: '/api/headers',
    focusHeaders: ['X-Tenant-Resolved'],
    expect: <>未带 header → 不应出现。</> },
  { id: 'H9', path: '/api/secure/data',
    focusHeaders: ['WWW-Authenticate', 'X-Auth-Required'],
    expect: <>未带 Authorization → 401 + <code style={styles.code}>WWW-Authenticate</code>。</> },
  { id: 'H9n', path: '/api/secure/data', headers: { authorization: 'Bearer xyz' },
    focusHeaders: ['WWW-Authenticate', 'X-Auth-Required'],
    expect: <>带 Authorization → 200，挑战头不再下发。</> },
  { id: 'P5', path: '/isr?preview=1',
    focusHeaders: ['X-Preview-Mode', 'Cache-Control', 'X-Render-Mode'],
    expect: <>has query preview=1 → 注入 <code style={styles.code}>X-Preview-Mode</code> + no-store。</> },
]

// ============== 表格容器 ==============
function CaseTable({ cases, RowComponent }) {
  return (
    <table style={styles.table}>
      <colgroup>
        <col style={{ width: 60 }} />
        <col style={{ width: '38%' }} />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th style={styles.th}>Method</th>
          <th style={styles.th}>路径</th>
          <th style={styles.th}>预期效果 / 结果</th>
        </tr>
      </thead>
      <tbody>
        {cases.map((c) => <RowComponent key={c.id} {...c} />)}
      </tbody>
    </table>
  )
}

// 一键运行所有 fetch 用例（仅 API 与条件用例，导航类不能批量打开）
function RunAllFetch({ cases, label }) {
  const [running, setRunning] = useState(false)
  const [summary, setSummary] = useState(null)
  async function onClick() {
    setRunning(true)
    let ok = 0, bad = 0
    for (const c of cases) {
      const r = await runFetch(c)
      if (r.ok && r.status < 500) ok++
      else bad++
      setSummary({ done: ok + bad, total: cases.length, ok, bad })
    }
    setRunning(false)
  }
  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        onClick={onClick}
        disabled={running}
        style={{ ...styles.btn, width: 'auto', padding: '5px 12px', fontWeight: 600 }}
      >
        {running ? `运行中 ${summary?.done || 0}/${summary?.total || 0}` : label}
      </button>
      {summary && !running && (
        <span style={{ marginLeft: 8, fontSize: 11, color: '#475569' }}>
          fetch 完成：{summary.ok} ok · {summary.bad} fail/CORS。详情请逐行点击 Run。
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
        <code style={styles.code}>rewrites</code> 的可点击测试看板。
      </p>
      <p style={styles.small}>
        交互规则：<strong>② API</strong> 点击 Run 内联展示响应；
        <strong>③ Redirects / ④ Rewrites</strong>{' '}
        默认在新标签页 <strong>直接跳转</strong>，地址栏 URL +
        响应 body 即可观察重定向 / 重写效果；条件用例（cookie / header）链接无法表达，自动降级 fetch；
        <strong>⑤ 条件用例</strong> 全部 fetch。所有请求自动带{' '}
        <code style={styles.code}>X-SKIP-TOKEN: eop-1022</code>。完整规范见{' '}
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
        <h2 style={styles.h2}>② API 端点（fetch + 内联结果）</h2>
        <CaseTable cases={API_CASES} RowComponent={FetchRow} />
        <RunAllFetch cases={API_CASES} label="▶ Run all API cases" />
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>③ Redirects（默认在新标签页跳转）</h2>
        <p style={styles.small}>
          点击链接 → 浏览器跟随 3xx → 新标签页地址栏会显示最终 URL。body 是目标端点返回的 JSON，
          其中 <code style={styles.code}>endpoint</code> 字段说明实际命中的路由。需要 cookie/header 触发的几条会标"fetch"按钮。
        </p>
        <CaseTable cases={REDIRECT_CASES} RowComponent={SmartRow} />
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>④ Rewrites（默认在新标签页跳转）</h2>
        <p style={styles.small}>
          点击链接 → 新标签页地址栏 <strong>不变</strong>，但 body 是被重写到的目标端点。
          对比地址栏与 body 中的 <code style={styles.code}>endpoint</code> 字段即可确认重写命中。
        </p>
        <CaseTable cases={REWRITE_CASES} RowComponent={SmartRow} />
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>⑤ 条件用例（has / missing：cookie · header · query）</h2>
        <p style={styles.small}>
          这一组依赖请求头 / cookie / query 触发，链接无法直接表达，必须用 fetch 即时注入。
        </p>
        <CaseTable cases={CONDITIONAL_CASES} RowComponent={FetchRow} />
        <RunAllFetch cases={CONDITIONAL_CASES} label="▶ Run all conditional cases" />
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
          严格断言 307/308 状态码与 Location；任意用例失败则进程退出码非 0。
        </p>
      </section>
    </main>
  )
}
