// 首页 - 端点测试入口与预期效果说明
// 同时承担可点击索引 + 文档说明的角色，便于人工抽测每条配置

const styles = {
  main: { maxWidth: 1080, margin: '0 auto', lineHeight: 1.6, color: '#222' },
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
  td: {
    padding: '8px 10px',
    borderBottom: '1px solid #f0f0f0',
    verticalAlign: 'top',
  },
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
    lineHeight: 1.5,
  },
  small: { color: '#666', fontSize: 12 },
}

function Pill({ color, children }) {
  return <span style={{ ...styles.pill, color }}>{children}</span>
}

function Row({ method = 'GET', path, expect, link = true }) {
  return (
    <tr>
      <td style={{ ...styles.td, width: 70 }}>
        <code style={styles.code}>{method}</code>
      </td>
      <td style={{ ...styles.td, width: '38%' }}>
        {link ? (
          <a href={path} target="_blank" rel="noreferrer">
            <code style={styles.code}>{path}</code>
          </a>
        ) : (
          <code style={styles.code}>{path}</code>
        )}
      </td>
      <td style={styles.td}>{expect}</td>
    </tr>
  )
}

function Section({ title, children, note }) {
  return (
    <section style={styles.section}>
      <h2 style={styles.h2}>{title}</h2>
      {note && <p style={styles.small}>{note}</p>}
      {children}
    </section>
  )
}

function Table({ head, children }) {
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={i} style={styles.th}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  )
}

export default function HomePage() {
  return (
    <main style={styles.main}>
      <h1 style={styles.h1}>Next Config Test</h1>
      <p style={styles.lead}>
        ISR / SSR / CSR / SSG 与 <code style={styles.code}>next.config.js</code> 中{' '}
        <code style={styles.code}>headers</code> /{' '}
        <code style={styles.code}>redirects</code> /{' '}
        <code style={styles.code}>rewrites</code>{' '}
        的可点击端点索引与预期效果说明。完整规范见{' '}
        <a href="https://github.com/clumsy-goose/next-config-test/blob/main/TEST_SPEC.md">
          TEST_SPEC.md
        </a>
        ，自动化脚本：
        <code style={styles.code}>node test-runner.mjs &lt;BASE_URL&gt;</code>
      </p>

      <p style={styles.small}>
        ⚠️ 全站响应都会带 H1 安全头：
        <code style={styles.code}>X-Powered-By-Test</code>{' '}
        <code style={styles.code}>X-Content-Type-Options</code>{' '}
        <code style={styles.code}>X-Frame-Options</code>{' '}
        <code style={styles.code}>Referrer-Policy</code>{' '}
        <code style={styles.code}>Strict-Transport-Security</code>
        。如部署网关需要鉴权，请求需带{' '}
        <code style={styles.code}>X-SKIP-TOKEN: eop-1022</code>。
      </p>

      {/* ------------------------------ 渲染模式 ------------------------------ */}
      <Section
        title="① 渲染模式（ISR / SSR / CSR / SSG）"
        note="点开查看页面，DevTools Network 面板可观察响应头中的 X-Render-Mode。"
      >
        <Table head={['Mode', '入口', '预期效果']}>
          <tr>
            <td style={styles.td}>
              <Pill color="#dc2626">SSR</Pill>
            </td>
            <td style={styles.td}>
              <a href="/ssr" target="_blank" rel="noreferrer">
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
              <a href="/ssg" target="_blank" rel="noreferrer">
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
              <a href="/isr" target="_blank" rel="noreferrer">
                <code style={styles.code}>/isr</code>
              </a>{' '}
              ·{' '}
              <a href="/isr?preview=1" target="_blank" rel="noreferrer">
                <code style={styles.code}>/isr?preview=1</code>
              </a>
            </td>
            <td style={styles.td}>
              10s 内访问内容相同，超时下次访问触发后台再生；响应头{' '}
              <code style={styles.code}>X-Render-Mode: isr</code>。带{' '}
              <code style={styles.code}>?preview=1</code> 时额外注入{' '}
              <code style={styles.code}>X-Preview-Mode: isr-preview</code> +{' '}
              <code style={styles.code}>Cache-Control: no-store</code>。
            </td>
          </tr>
          <tr>
            <td style={styles.td}>
              <Pill color="#9333ea">CSR</Pill>
            </td>
            <td style={styles.td}>
              <a href="/csr" target="_blank" rel="noreferrer">
                <code style={styles.code}>/csr</code>
              </a>
            </td>
            <td style={styles.td}>
              初始 HTML 仅显示 <em>Loading on client…</em>，挂载后客户端发起{' '}
              <code style={styles.code}>/api/hello?name=CSR</code>；响应头{' '}
              <code style={styles.code}>X-Render-Mode: csr</code>。
            </td>
          </tr>
        </Table>
      </Section>

      {/* ------------------------------ API 直访 ------------------------------ */}
      <Section
        title="② API 端点（直接访问，不经过 redirect/rewrite）"
        note="可点击直接验证 200/4xx 状态、JSON 字段与端点专属响应头。"
      >
        <Table head={['Method', '路径', '预期效果']}>
          <Row
            path="/api/hello?name=Foo"
            expect={
              <>
                JSON <code style={styles.code}>{`{ message: "Hello, Foo!" }`}</code>。
              </>
            }
          />
          <Row
            method="POST"
            path="/api/hello"
            link={false}
            expect={
              <>
                回显 body：
                <code style={styles.code}>{`curl -X POST -H 'content-type: application/json' -d '{"x":1}' /api/hello`}</code>
                。
              </>
            }
          />
          <Row
            path="/api/echo?k=v"
            expect={
              <>
                回显 query/headers/url；<code style={styles.code}>query.k === "v"</code>。
              </>
            }
          />
          <Row
            path="/api/headers"
            expect={
              <>
                响应头注入：
                <code style={styles.code}>X-Endpoint: headers-inspector</code>、
                <code style={styles.code}>X-Custom-Trace-Id: trace-static-001</code>、
                <code style={styles.code}>Cache-Control: no-store</code>。
              </>
            }
          />
          <Row
            path="/api/health"
            expect={
              <>
                JSON <code style={styles.code}>status: "ok"</code>。
              </>
            }
          />
          <Row
            path="/api/greeting"
            expect={
              <>
                未命中灰度：<code style={styles.code}>channel: "stable"</code>。
              </>
            }
          />
          <Row
            path="/api/products/42"
            expect={
              <>
                响应头：<code style={styles.code}>X-Product-Endpoint: v1</code>、
                <code style={styles.code}>Cache-Control: public, s-maxage=60</code>；
                JSON <code style={styles.code}>product.id === "42"</code>。
              </>
            }
          />
          <Row
            path="/api/products/abc"
            expect={
              <>
                <strong>400</strong>，<code style={styles.code}>error</code> 含
                "Invalid product id"。
              </>
            }
          />
          <Row
            path="/api/v2/status"
            expect={
              <>
                JSON <code style={styles.code}>apiVersion: "v2"</code>。
              </>
            }
          />
          <Row
            path="/api/cors/data"
            expect={
              <>
                响应头：
                <code style={styles.code}>Access-Control-Allow-Origin: *</code>、
                <code style={styles.code}>Access-Control-Allow-Methods: GET, POST, OPTIONS</code>、
                <code style={styles.code}>X-CORS-Enabled: 1</code>。
              </>
            }
          />
          <Row
            path="/api/secure/data"
            expect={
              <>
                无 <code style={styles.code}>Authorization</code> →{' '}
                <strong>401</strong>，响应头{' '}
                <code style={styles.code}>WWW-Authenticate: Bearer realm="api"</code> +{' '}
                <code style={styles.code}>X-Auth-Required: 1</code>。
              </>
            }
          />
          <Row
            path="/api/cached"
            expect={
              <>
                响应头：
                <code style={styles.code}>
                  Cache-Control: public, max-age=30, stale-while-revalidate=60
                </code>{' '}
                +<code style={styles.code}>X-Cache-Strategy: swr</code>。
              </>
            }
          />
          <Row
            path="/api/auth/login"
            expect={
              <>
                JSON <code style={styles.code}>action: "please-login"</code>。
              </>
            }
          />
          <Row
            path="/api/beta/greeting"
            expect={
              <>
                JSON <code style={styles.code}>channel: "beta"</code>。
              </>
            }
          />
          <Row
            path="/api/help/intro?from=docs"
            expect={
              <>
                JSON <code style={styles.code}>section: "intro", from: "docs"</code>。
              </>
            }
          />
        </Table>
      </Section>

      {/* ------------------------------ Redirects ------------------------------ */}
      <Section
        title="③ Redirects（点击会跳转，地址栏 URL 变化）"
        note="浏览器默认跟随 3xx；如需观察 Location 头，请用 curl -I 或 DevTools Network 关闭 Preserve log。脚本里用 redirect: 'manual' 拦截。"
      >
        <Table head={['编号', '入口', '预期 3xx + Location']}>
          <tr>
            <td style={styles.td}>R1</td>
            <td style={styles.td}>
              <a href="/home">
                <code style={styles.code}>/home</code>
              </a>
            </td>
            <td style={styles.td}>
              <Pill color="#dc2626">308</Pill> →{' '}
              <code style={styles.code}>/</code>
            </td>
          </tr>
          <tr>
            <td style={styles.td}>R2</td>
            <td style={styles.td}>
              <a href="/old-products/123">
                <code style={styles.code}>/old-products/123</code>
              </a>
            </td>
            <td style={styles.td}>
              <Pill color="#ea580c">307</Pill> →{' '}
              <code style={styles.code}>/api/products/123</code>
            </td>
          </tr>
          <tr>
            <td style={styles.td}>R3</td>
            <td style={styles.td}>
              <a href="/legacy-api/products/9">
                <code style={styles.code}>/legacy-api/products/9</code>
              </a>
            </td>
            <td style={styles.td}>
              <Pill color="#dc2626">308</Pill> →{' '}
              <code style={styles.code}>/api/v1/products/9</code>{' '}
              <span style={styles.small}>（再被 BR1 重写到 /api/products/9）</span>
            </td>
          </tr>
          <tr>
            <td style={styles.td}>R4</td>
            <td style={styles.td}>
              <a href="/search?legacy=true">
                <code style={styles.code}>/search?legacy=true</code>
              </a>{' '}
              ·{' '}
              <a href="/search">
                <code style={styles.code}>/search</code>
              </a>
            </td>
            <td style={styles.td}>
              带 <code style={styles.code}>legacy=true</code> →{' '}
              <Pill color="#ea580c">307</Pill>{' '}
              <code style={styles.code}>/api/health</code>；不带 → 不重定向。
            </td>
          </tr>
          <tr>
            <td style={styles.td}>R5</td>
            <td style={styles.td}>
              <a href="/account/orders">
                <code style={styles.code}>/account/orders</code>
              </a>
            </td>
            <td style={styles.td}>
              无 <code style={styles.code}>session</code> cookie →{' '}
              <Pill color="#ea580c">307</Pill>{' '}
              <code style={styles.code}>/api/auth/login</code>。
            </td>
          </tr>
          <tr>
            <td style={styles.td}>R7</td>
            <td style={styles.td}>
              <a href="/u/42">
                <code style={styles.code}>/u/42</code>
              </a>{' '}
              ·{' '}
              <a href="/u/abc">
                <code style={styles.code}>/u/abc</code>
              </a>
            </td>
            <td style={styles.td}>
              数字 → <Pill color="#ea580c">307</Pill>{' '}
              <code style={styles.code}>/api/products/42</code>；非数字 → 404。
            </td>
          </tr>
          <tr>
            <td style={styles.td}>R8</td>
            <td style={styles.td}>
              <a href="/docs/intro">
                <code style={styles.code}>/docs/intro</code>
              </a>
            </td>
            <td style={styles.td}>
              <Pill color="#ea580c">307</Pill> →{' '}
              <code style={styles.code}>/api/help/intro?from=docs</code>。
            </td>
          </tr>
          <tr>
            <td style={styles.td}>R9</td>
            <td style={styles.td}>
              <a href="/go/github" rel="noreferrer">
                <code style={styles.code}>/go/github</code>
              </a>
            </td>
            <td style={styles.td}>
              <Pill color="#dc2626">308</Pill> →{' '}
              <code style={styles.code}>https://github.com/vercel/next.js</code>{' '}
              （跨域外链）。
            </td>
          </tr>
          <tr>
            <td style={styles.td}>R10</td>
            <td style={styles.td}>
              <code style={styles.code}>/trigger-redirect</code>{' '}
              <span style={styles.small}>(需 header)</span>
            </td>
            <td style={styles.td}>
              带 <code style={styles.code}>x-redirect-test: 1</code> →{' '}
              <Pill color="#ea580c">307</Pill>{' '}
              <code style={styles.code}>/api/health</code>。见下方 cURL。
            </td>
          </tr>
          <tr>
            <td style={styles.td}>R11</td>
            <td style={styles.td}>
              <a href="/private/dashboard">
                <code style={styles.code}>/private/dashboard</code>
              </a>
            </td>
            <td style={styles.td}>
              无 <code style={styles.code}>x-api-key</code> →{' '}
              <Pill color="#ea580c">307</Pill>{' '}
              <code style={styles.code}>/api/auth/login</code>。
            </td>
          </tr>
        </Table>
      </Section>

      {/* ------------------------------ Rewrites ------------------------------ */}
      <Section
        title="④ Rewrites（URL 不变，body 是被重写后的目标）"
        note="点击后地址栏仍显示原路径，但响应来自目标。"
      >
        <Table head={['编号', '入口', '预期效果']}>
          <Row
            path="/api/v1/health"
            expect={
              <>
                <Pill color="#16a34a">BR1</Pill> 内容同{' '}
                <code style={styles.code}>/api/health</code>，JSON{' '}
                <code style={styles.code}>{`endpoint: "/api/health"`}</code>。
              </>
            }
          />
          <Row
            path="/api/v1/products/7"
            expect={
              <>
                <Pill color="#16a34a">BR1</Pill> 内容同{' '}
                <code style={styles.code}>/api/products/7</code>。
              </>
            }
          />
          <Row
            path="/api/greeting?beta=1"
            expect={
              <>
                <Pill color="#16a34a">BR4</Pill>{' '}
                <code style={styles.code}>channel: "beta"</code>（query 灰度命中）。
              </>
            }
          />
          <Row
            path="/healthz"
            expect={
              <>
                <Pill color="#2563eb">AR1</Pill> 内容同{' '}
                <code style={styles.code}>/api/health</code>。
              </>
            }
          />
          <Row
            path="/status"
            expect={
              <>
                <Pill color="#2563eb">AR2</Pill> 内容同{' '}
                <code style={styles.code}>/api/v2/status</code>。
              </>
            }
          />
          <Row
            path="/shop/55"
            expect={
              <>
                <Pill color="#2563eb">AR3</Pill> 内容同{' '}
                <code style={styles.code}>/api/products/55</code>。
              </>
            }
          />
          <Row
            path="/shop/abc"
            expect={
              <>
                <Pill color="#2563eb">AR3</Pill> 正则段未命中 →{' '}
                <strong>404</strong>。
              </>
            }
          />
          <Row
            path="/echo-it?msg=hi"
            expect={
              <>
                <Pill color="#2563eb">AR4</Pill> JSON{' '}
                <code style={styles.code}>{`pathname: "/api/echo"`}</code>、
                <code style={styles.code}>{`query: { from: "alias", msg: "hi" }`}</code>。
              </>
            }
          />
          <Row
            path="/proxy/posts/1"
            expect={
              <>
                <Pill color="#9333ea">FR1</Pill> 反向代理外部 jsonplaceholder，
                JSON 包含 <code style={styles.code}>id: 1</code>、
                <code style={styles.code}>title</code>、
                <code style={styles.code}>body</code>。
              </>
            }
          />
          <Row
            path="/proxy/posts/abc"
            expect={
              <>
                <Pill color="#9333ea">FR1</Pill> 正则段未命中 → fallback 不代理 →{' '}
                <strong>404</strong>。
              </>
            }
          />
        </Table>
      </Section>

      {/* ------------------------------ 条件用例（cURL） ------------------------------ */}
      <Section
        title="⑤ 条件用例（需要自定义 header / cookie，链接无法直接触发）"
        note="复制以下命令在终端运行；如部署需鉴权，所有命令请追加 -H 'X-SKIP-TOKEN: eop-1022'。"
      >
        <pre style={styles.pre}>{`# H6 has cookie debug=on  -> 注入 X-Debug-Mode / X-Debug-Source
curl -i -H 'cookie: debug=on' \\
     "$BASE/api/headers"

# H7 has header x-tenant=acme  -> 注入 X-Tenant-Resolved + Vary
curl -i -H 'x-tenant: acme' \\
     "$BASE/api/headers"

# H9 missing authorization  -> 401 + WWW-Authenticate
curl -i "$BASE/api/secure/data"
# H9n 带 Authorization     -> 200 且不再下发 WWW-Authenticate
curl -i -H 'authorization: Bearer xyz' \\
     "$BASE/api/secure/data"

# BR2 灰度: header  -> /api/greeting 返回 beta channel
curl -s -H 'x-canary: always' \\
     "$BASE/api/greeting"
# BR3 灰度: cookie -> /api/greeting 返回 beta channel
curl -s -H 'cookie: canary=true' \\
     "$BASE/api/greeting"

# R10 has header  -> 307 -> /api/health
curl -i -H 'x-redirect-test: 1' \\
     "$BASE/trigger-redirect"

# R5n 带 session cookie  -> 不再被重定向到登录
curl -i -H 'cookie: session=abc' \\
     "$BASE/account/orders"

# R11n 带 x-api-key  -> 不再被重定向
curl -i -H 'x-api-key: k' \\
     "$BASE/private/dashboard"`}</pre>
      </Section>

      {/* ------------------------------ 自动化 ------------------------------ */}
      <Section title="⑥ 一键自动化测试">
        <pre style={styles.pre}>{`# 本地：先 npm run build && npm run start
node test-runner.mjs http://localhost:3000

# 部署后：
node test-runner.mjs https://your-app.example.com`}</pre>
        <p style={styles.small}>
          脚本零依赖，覆盖 50+ 用例，输出{' '}
          <code style={styles.code}>✓ / ✗</code>{' '}
          及失败原因；任意用例失败则进程退出码非 0。详见{' '}
          <a href="https://github.com/clumsy-goose/next-config-test/blob/main/TEST_SPEC.md">
            TEST_SPEC.md
          </a>{' '}
          覆盖矩阵。
        </p>
      </Section>
    </main>
  )
}
