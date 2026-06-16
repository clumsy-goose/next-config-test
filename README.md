# next-config-test

A Next.js 15 (App Router) project that exercises:

- **ISR / SSR / CSR / SSG** rendering modes
- Comprehensive **`headers()` / `redirects()` / `rewrites()`** configurations in `next.config.js`
- 13+ **API endpoints** covering each config branch
- A **test specification** (`TEST_SPEC.md`) describing the expected outcome of every endpoint
- A **dependency-free test runner** (`test-runner.mjs`) that exercises every case against a deployed URL

## Project layout

```
next-config-test/
├── next.config.js        # all headers/redirects/rewrites configs
├── package.json
├── TEST_SPEC.md          # expected behavior for every endpoint
├── test-runner.mjs       # node test-runner.mjs <BASE_URL>
└── src/app/
    ├── layout.js
    ├── page.js
    ├── ssr/page.js       # SSR (force-dynamic)
    ├── ssg/page.js       # SSG (force-static)
    ├── isr/page.js       # ISR (revalidate=10)
    ├── csr/page.js       # CSR (use client + useEffect fetch)
    └── api/
        ├── hello/route.js
        ├── echo/route.js
        ├── headers/route.js
        ├── health/route.js
        ├── greeting/route.js
        ├── beta/greeting/route.js
        ├── products/[id]/route.js
        ├── auth/login/route.js
        ├── v2/status/route.js
        ├── cors/data/route.js
        ├── secure/data/route.js
        ├── cached/route.js
        └── help/[section]/route.js
```

## Quick start

```bash
cd next-config-test
npm install
npm run build
npm run start          # http://localhost:3000

# in another shell:
node test-runner.mjs http://localhost:3000
```

After deployment:

```bash
node test-runner.mjs https://your-app.example.com
```

## What's tested

See [`TEST_SPEC.md`](./TEST_SPEC.md) for the full matrix. Coverage summary:

- 14 distinct `headers` rules (global / `:path*` / regex / `has` cookie+header+query / `missing` header / per-endpoint cache strategies)
- 11 distinct `redirects` rules (308/307, named segments, `:path*`, regex `:id(\d+)`, `has` query/cookie/header/host, `missing` cookie/header, query passthrough, external)
- 9 distinct `rewrites` rules across `beforeFiles` / `afterFiles` / `fallback`, including header/cookie/query gating, regex segments, alias paths, query injection, and a whitelisted reverse proxy

The test runner outputs per-case `PASS/FAIL` and exits non-zero on any failure.
