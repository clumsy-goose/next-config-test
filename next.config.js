/** @type {import('next').NextConfig} */

/**
 * 受信任的外部代理目标白名单（fallback rewrite 用）。
 * 写死可信公网域名，防止 SSRF。
 */
const TRUSTED_PROXY_ORIGIN = 'https://jsonplaceholder.typicode.com'

const nextConfig = {
  reactStrictMode: true,

  /* ======================================================================
   * Headers（自定义响应头）
   * 覆盖：
   *   - 全站通用安全头
   *   - 静态资源长缓存（含 immutable）
   *   - CORS 头
   *   - 命名通配 :path*
   *   - 命名段 + 正则 :id(\\d+)
   *   - has: header / cookie / query
   *   - missing: header
   *   - 业务自定义头
   *   - no-store / SWR 等多种 Cache-Control
   * ==================================================================== */
  async headers() {
    return [
      // H1) 全站基础安全头
      {
        source: '/:path*',
        headers: [
          { key: 'X-Powered-By-Test', value: 'next-config-test' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },

      // H2) 静态资产长缓存（命名通配 + immutable）
      {
        source: '/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
          { key: 'X-Asset-Tier', value: 'static-immutable' },
        ],
      },

      // H3) CORS 通用响应头
      {
        source: '/api/cors/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization, X-Requested-With',
          },
          { key: 'Access-Control-Max-Age', value: '600' },
          { key: 'X-CORS-Enabled', value: '1' },
        ],
      },

      // H4) 业务头：仅给 /api/headers 端点附加
      {
        source: '/api/headers',
        headers: [
          { key: 'X-Endpoint', value: 'headers-inspector' },
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'X-Custom-Trace-Id', value: 'trace-static-001' },
        ],
      },

      // H5) 正则段：/api/products/:id(\d+)
      {
        source: '/api/products/:id(\\d{1,})',
        headers: [
          { key: 'X-Product-Endpoint', value: 'v1' },
          { key: 'Cache-Control', value: 'public, s-maxage=60' },
        ],
      },

      // H6) has cookie：debug=on -> 下发调试头
      {
        source: '/api/:path*',
        has: [{ type: 'cookie', key: 'debug', value: 'on' }],
        headers: [
          { key: 'X-Debug-Mode', value: 'enabled' },
          { key: 'X-Debug-Source', value: 'cookie' },
        ],
      },

      // H7) has header：x-tenant=acme -> 下发租户头
      {
        source: '/api/:path*',
        has: [{ type: 'header', key: 'x-tenant', value: 'acme' }],
        headers: [
          { key: 'X-Tenant-Resolved', value: 'acme' },
          { key: 'Vary', value: 'x-tenant' },
        ],
      },

      // H8) has query：?preview=1 -> 下发预览头
      {
        source: '/isr',
        has: [{ type: 'query', key: 'preview', value: '1' }],
        headers: [
          { key: 'X-Preview-Mode', value: 'isr-preview' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },

      // H9) missing header：未带 authorization -> 附加 401 挑战头
      {
        source: '/api/secure/:path*',
        missing: [{ type: 'header', key: 'authorization' }],
        headers: [
          { key: 'WWW-Authenticate', value: 'Bearer realm="api"' },
          { key: 'X-Auth-Required', value: '1' },
        ],
      },

      // H10) /api/cached：固定 SWR 缓存策略
      {
        source: '/api/cached',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=30, stale-while-revalidate=60',
          },
          { key: 'X-Cache-Strategy', value: 'swr' },
        ],
      },

      // H11) /ssr：禁缓存
      {
        source: '/ssr',
        headers: [
          { key: 'Cache-Control', value: 'no-store, must-revalidate' },
          { key: 'X-Render-Mode', value: 'ssr' },
        ],
      },
      // H12) /ssg
      {
        source: '/ssg',
        headers: [{ key: 'X-Render-Mode', value: 'ssg' }],
      },
      // H13) /isr
      {
        source: '/isr',
        headers: [{ key: 'X-Render-Mode', value: 'isr' }],
      },
      // H14) /csr
      {
        source: '/csr',
        headers: [{ key: 'X-Render-Mode', value: 'csr' }],
      },
    ]
  },

  /* ======================================================================
   * Redirects（重定向）：3xx，地址栏 URL 改变
   * 覆盖：
   *   - permanent (308) / temporary (307)
   *   - 命名通配 :path*
   *   - 命名段 + 正则 :id(\\d+)
   *   - has: query / cookie / header / host
   *   - missing: cookie / header
   *   - 跨域外链
   *   - 透传 / 重写 query
   * ==================================================================== */
  async redirects() {
    return [
      // R1) 永久重定向：/home -> /（308）
      { source: '/home', destination: '/', permanent: true },

      // R2) 临时重定向 + 命名段：/old-products/123 -> /api/products/123（307）
      {
        source: '/old-products/:id',
        destination: '/api/products/:id',
        permanent: false,
      },

      // R3) 多段通配 + 永久：/legacy-api/:path* -> /api/v1/:path*
      {
        source: '/legacy-api/:path*',
        destination: '/api/v1/:path*',
        permanent: true,
      },

      // R4) has query：/search?legacy=true -> /api/health
      {
        source: '/search',
        has: [{ type: 'query', key: 'legacy', value: 'true' }],
        destination: '/api/health',
        permanent: false,
      },

      // R5) missing cookie：/account/* 没有 session -> /api/auth/login
      {
        source: '/account/:path*',
        missing: [{ type: 'cookie', key: 'session' }],
        destination: '/api/auth/login',
        permanent: false,
      },

      // R6) has host：www.example.com 收敛到 example.com
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.example.com' }],
        destination: 'https://example.com/:path*',
        permanent: true,
      },

      // R7) 命名段 + 正则：/u/:id(\d+) -> /api/products/:id
      {
        source: '/u/:id(\\d{1,})',
        destination: '/api/products/:id',
        permanent: false,
      },

      // R8) 透传 query：/docs/:section -> /api/help/:section?from=docs
      {
        source: '/docs/:section',
        destination: '/api/help/:section?from=docs',
        permanent: false,
      },

      // R9) 跨域外链跳转：/go/github -> https://github.com/vercel/next.js
      {
        source: '/go/github',
        destination: 'https://github.com/vercel/next.js',
        permanent: true,
      },

      // R10) has header：x-redirect-test=1 -> /api/health
      {
        source: '/trigger-redirect',
        has: [{ type: 'header', key: 'x-redirect-test', value: '1' }],
        destination: '/api/health',
        permanent: false,
      },

      // R11) missing header：/private/* 无 x-api-key -> /api/auth/login
      {
        source: '/private/:path*',
        missing: [{ type: 'header', key: 'x-api-key' }],
        destination: '/api/auth/login',
        permanent: false,
      },
    ]
  },

  /* ======================================================================
   * Rewrites（重写）：URL 不变，内部转发
   * 三阶段：beforeFiles / afterFiles / fallback
   * 覆盖：
   *   - 通配前缀剥离
   *   - has: header / cookie / query
   *   - 正则段
   *   - 友好别名
   *   - 反向代理外部白名单
   * ==================================================================== */
  async rewrites() {
    return {
      beforeFiles: [
        // BR1) /api/v1/* -> /api/*
        { source: '/api/v1/:path*', destination: '/api/:path*' },

        // BR2) has header x-canary=always -> beta
        {
          source: '/api/greeting',
          has: [{ type: 'header', key: 'x-canary', value: 'always' }],
          destination: '/api/beta/greeting',
        },
        // BR3) has cookie canary=true -> beta
        {
          source: '/api/greeting',
          has: [{ type: 'cookie', key: 'canary', value: 'true' }],
          destination: '/api/beta/greeting',
        },
        // BR4) has query beta=1 -> beta
        {
          source: '/api/greeting',
          has: [{ type: 'query', key: 'beta', value: '1' }],
          destination: '/api/beta/greeting',
        },
      ],
      afterFiles: [
        // AR1) /healthz -> /api/health
        { source: '/healthz', destination: '/api/health' },
        // AR2) /status -> /api/v2/status
        { source: '/status', destination: '/api/v2/status' },
        // AR3) /shop/:id(\d+) -> /api/products/:id
        {
          source: '/shop/:id(\\d{1,})',
          destination: '/api/products/:id',
        },
        // AR4) /echo-it -> /api/echo?from=alias（保留原 query 自动合并）
        { source: '/echo-it', destination: '/api/echo?from=alias' },
      ],
      fallback: [
        // FR1) /proxy/posts/:id -> 受信任白名单外部 API
        {
          source: '/proxy/posts/:id(\\d{1,})',
          destination: `${TRUSTED_PROXY_ORIGIN}/posts/:id`,
        },
      ],
    }
  },
}

module.exports = nextConfig
