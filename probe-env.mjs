#!/usr/bin/env node
/**
 * probe-env.mjs — 环境签名探针
 *
 * 用法:
 *   node probe-env.mjs <BASE_URL> [<BASE_URL_2> <BASE_URL_3>...]
 *
 * 例:
 *   node probe-env.mjs http://localhost:3010 \
 *                      https://my-app.vercel.app \
 *                      https://my-app.edgeone.cool
 *
 * 输出: 一张并排对比表,显示每个环境对 5 个"行为分歧点"的实际选择。
 *
 * 探测点:
 *   ① afterFiles vs filesystem static (CE2)        public 文件 vs afterFiles
 *   ② afterFiles vs dynamic-route (CE3)            动态 [id] vs afterFiles
 *   ③ afterFiles 段 vs fallback 段顺序 (CE6)        sortRoutes 是否破坏书写顺序
 *   ④ afterFiles vs Edge static function (SIBLING)  ★ 真正的环境差异点
 *   ⑤ AR4 query 透传/注入                          rewrite destination query 行为
 *
 * 输出码:
 *   exit 0 = 全部环境签名一致,或仅本地一份
 *   exit 1 = 出现签名分歧,说明实现差异
 */

const urls = process.argv.slice(2)
if (urls.length === 0) {
  console.error('Usage: node probe-env.mjs <BASE_URL> [<BASE_URL>...]')
  process.exit(2)
}

const C = {
  reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', dim: '\x1b[2m', bold: '\x1b[1m',
}

const SKIP_TOKEN = { 'X-SKIP-TOKEN': 'eop-1022' }

async function http(base, path, opts = {}) {
  const url = base.replace(/\/$/, '') + path
  const init = {
    method: opts.method || 'GET',
    headers: { ...SKIP_TOKEN, ...(opts.headers || {}) },
    redirect: 'follow',
    cache: 'no-store',
  }
  try {
    const res = await fetch(url, init)
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch {}
    return { ok: true, status: res.status, json, text }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}

// 5 个探测点
const PROBES = [
  {
    id: 'CE2',
    name: 'filesystem vs afterFiles',
    description: 'public 文件 vs 同 path 的 afterFiles rewrite',
    path: '/priority/fs-after.txt',
    interpret(r) {
      if (!r.ok) return ['ERROR', r.error]
      if (r.text?.includes('PRIORITY=filesystem')) return ['filesystem 优先', '✓ 与 Next 文档一致']
      if (r.json?.endpoint === '/api/health')      return ['afterFiles 优先', '✗ 违反文档']
      return ['未知', JSON.stringify(r.json || r.text).slice(0, 80)]
    },
  },
  {
    id: 'CE3',
    name: 'afterFiles vs dynamic-route',
    description: '同 path 的 dynamic [id] vs afterFiles rewrite',
    path: '/api/ce3/42',
    interpret(r) {
      if (!r.ok) return ['ERROR', r.error]
      if (r.json?.action === 'please-login')         return ['afterFiles 优先', '✓ 与 Next 文档一致']
      if (r.json?.winner === 'dynamic-route')        return ['dynamic 优先', '✗ 违反文档']
      return ['未知', JSON.stringify(r.json).slice(0, 80)]
    },
  },
  {
    id: 'CE6',
    name: 'afterFiles 段 vs fallback 段',
    description: 'afterFiles 通配 vs fallback 精准 (书写顺序契约)',
    path: '/api/ce6/keep',
    interpret(r) {
      if (!r.ok) return ['ERROR', r.error]
      if (r.json?.action === 'please-login')                  return ['afterFiles 段优先', '✓ 严格按书写顺序']
      if (r.json?.endpoint === '/api/health')                 return ['fallback 段抢跑', '✗ 按 specificity 重排']
      return ['未知', JSON.stringify(r.json).slice(0, 80)]
    },
  },
  {
    id: 'SIBLING',
    name: 'afterFiles vs Edge static function',
    description: '★ 关键环境差异点',
    path: '/api/sibling/edge',
    interpret(r) {
      if (!r.ok) return ['ERROR', r.error]
      if (r.json?.action === 'please-login')   return ['afterFiles 优先', '严格 v3 spec']
      if (r.json?.runtime === 'edge')           return ['Edge function 优先', 'next start 行为']
      return ['未知', JSON.stringify(r.json).slice(0, 80)]
    },
  },
  {
    id: 'AR4',
    name: 'rewrite destination query',
    description: '/echo-it?msg=hi → /api/echo?from=alias',
    path: '/echo-it?msg=hi',
    interpret(r) {
      if (!r.ok) return ['ERROR', r.error]
      if (r.json?.endpoint !== '/api/echo') return ['未到达 /api/echo', `endpoint=${r.json?.endpoint}`]
      const q = r.json.query || {}
      const fromOk = q.from === 'alias'
      const msgOk = q.msg === 'hi'
      if (fromOk && msgOk)   return ['注入+透传',     '✓ 完整 spec 行为']
      if (fromOk && !msgOk)  return ['注入但不透传',  '部分 spec (EdgeOne 行为)']
      if (!fromOk && msgOk)  return ['不注入但透传',  '可疑']
      return ['都丢失', 'standalone server 行为']
    },
  },
]

async function probe(base) {
  const results = []
  for (const p of PROBES) {
    const r = await http(base, p.path, p.opts)
    const [verdict, detail] = p.interpret(r)
    results.push({ id: p.id, verdict, detail, raw: r })
  }
  return results
}

function pad(s, n) {
  s = String(s ?? '')
  if (s.length >= n) return s.slice(0, n - 1) + '…'
  return s + ' '.repeat(n - s.length)
}

function color(s) {
  if (s.includes('✓') || s.includes('严格')) return C.green + s + C.reset
  if (s.includes('✗')) return C.red + s + C.reset
  if (s.includes('ERROR') || s.includes('未知')) return C.red + s + C.reset
  return C.yellow + s + C.reset
}

;(async () => {
  console.log(`${C.bold}${C.cyan}Environment Signature Probe${C.reset}`)
  console.log(`Probing ${urls.length} environment${urls.length > 1 ? 's' : ''}...\n`)

  const allResults = []
  for (const url of urls) {
    process.stdout.write(`${C.dim}…${C.reset} ${url}`)
    const start = Date.now()
    const r = await probe(url)
    const dur = Date.now() - start
    process.stdout.write(`\r${C.green}✓${C.reset} ${url} (${dur}ms)\n`)
    allResults.push({ url, results: r })
  }

  console.log()
  console.log(`${C.bold}== 环境签名对比表 ==${C.reset}`)
  console.log()

  // 表头
  const idCol = 12
  const probeCol = 28
  const verdictCol = 26
  const headerRow = pad('ID', idCol) + pad('行为分歧点', probeCol)
    + urls.map((_, i) => pad(`Env${i + 1}`, verdictCol)).join('')
  console.log(C.bold + headerRow + C.reset)
  console.log('─'.repeat(idCol + probeCol + verdictCol * urls.length))

  for (let i = 0; i < PROBES.length; i++) {
    const p = PROBES[i]
    const row = pad(p.id, idCol) + pad(p.name, probeCol)
      + allResults.map(env => pad(color(env.results[i].verdict), verdictCol + 10)).join('')
    console.log(row)
  }

  console.log()
  console.log(`${C.bold}== Env 索引 ==${C.reset}`)
  urls.forEach((u, i) => console.log(`  Env${i + 1} = ${u}`))

  // 检查签名一致性
  console.log()
  let divergent = 0
  for (let i = 0; i < PROBES.length; i++) {
    const verdicts = allResults.map(env => env.results[i].verdict)
    const uniq = [...new Set(verdicts)]
    if (uniq.length > 1) {
      divergent++
      console.log(`${C.yellow}⚠${C.reset}  ${PROBES[i].id} (${PROBES[i].name}): ${uniq.join(' vs ')}`)
    }
  }

  if (divergent === 0 && urls.length > 1) {
    console.log(`${C.green}✓${C.reset} 全部 ${urls.length} 个环境签名一致`)
  } else if (divergent > 0) {
    console.log(`${C.bold}${C.yellow}发现 ${divergent} 个分歧点${C.reset} - 说明实现间存在行为差异。`)
  }

  console.log()
  console.log(`${C.dim}详细数据:`)
  for (const env of allResults) {
    console.log(`  --- ${env.url} ---`)
    for (const r of env.results) {
      console.log(`    [${r.id}] ${r.verdict}  · ${r.detail}`)
    }
  }
  console.log(C.reset)

  process.exit(divergent > 0 ? 1 : 0)
})().catch(e => {
  console.error('Probe crashed:', e)
  process.exit(2)
})
