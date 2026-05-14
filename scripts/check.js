// 外部探活脚本（黑盒探活）
// 由 GitHub Actions 每 5 分钟调用一次
// 探测：/api/health（应用层）+ /api/health/db（DB 层）
const https = require('https')
const { sendAlert } = require('./feishu')

const WEBHOOK_URL = process.env.FEISHU_WEBHOOK_URL
const WEBHOOK_SECRET = process.env.FEISHU_WEBHOOK_SECRET
const PROD_DOMAIN = process.env.PROD_DOMAIN

if (!WEBHOOK_URL || !WEBHOOK_SECRET || !PROD_DOMAIN) {
  console.error('[FATAL] Missing env: FEISHU_WEBHOOK_URL / FEISHU_WEBHOOK_SECRET / PROD_DOMAIN')
  process.exit(1)
}

const ENDPOINTS = [
  { name: '应用层', path: '/api/health', timeoutMs: 8000, expectStatus: 200 },
  { name: 'DB 层', path: '/api/health/db', timeoutMs: 8000, expectStatus: 200 }
]

function probe({ name, path, timeoutMs, expectStatus }) {
  return new Promise((resolve) => {
    const start = Date.now()
    const url = new URL(PROD_DOMAIN + path)
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'User-Agent': 'huolongguoBot-monitor/1.0', 'Accept': 'application/json' }
    }, (res) => {
      let data = ''
      res.on('data', (c) => data += c)
      res.on('end', () => {
        const durMs = Date.now() - start
        const ok = res.statusCode === expectStatus
        resolve({ name, path, status: res.statusCode, durMs, ok, body: data.slice(0, 200) })
      })
    })
    req.on('error', (e) => {
      resolve({ name, path, status: 0, durMs: Date.now() - start, ok: false, error: e.message })
    })
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      resolve({ name, path, status: 0, durMs: Date.now() - start, ok: false, error: `timeout after ${timeoutMs}ms` })
    })
    req.end()
  })
}

;(async () => {
  const results = []
  for (const ep of ENDPOINTS) {
    const r = await probe(ep)
    results.push(r)
    console.log(`[${r.ok ? 'OK' : 'FAIL'}] ${r.name} ${r.path} status=${r.status} dur=${r.durMs}ms ${r.error || ''}`)
  }

  const failed = results.filter(r => !r.ok)
  if (failed.length === 0) {
    console.log('[ALL OK] all probes passed')
    return
  }

  // 拼装一条飞书告警，包含全部失败项
  const lines = failed.map(r => `- **${r.name}** \`${r.path}\` → 状态=${r.status} 耗时=${r.durMs}ms ${r.error ? `错误=\`${r.error}\`` : ''}${r.body && !r.ok && r.status > 0 ? `\n  响应: \`${r.body}\`` : ''}`)
  const isCritical = failed.length === ENDPOINTS.length || failed.some(r => r.status === 0 || r.status >= 500)

  await sendAlert({
    webhookUrl: WEBHOOK_URL,
    secret: WEBHOOK_SECRET,
    title: isCritical ? '🚨 生产环境探活失败' : '⚠️ 生产环境探活异常',
    content: `**失败接口数**: ${failed.length}/${ENDPOINTS.length}\n${lines.join('\n')}\n\n**建议**: ${failed.some(r => r.path.includes('/db')) ? '检查 MySQL 状态 + 磁盘空间' : '检查 PM2 进程 + Nginx + 服务器整体可达性'}`,
    level: isCritical ? 'critical' : 'warning'
  })
  process.exitCode = 1
})()
