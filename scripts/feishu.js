// 飞书自定义机器人告警模块（HMAC-SHA256 签名）
const crypto = require('crypto')
const https = require('https')

function sign(secret, timestamp) {
  const stringToSign = `${timestamp}\n${secret}`
  return crypto.createHmac('sha256', stringToSign).update('').digest('base64')
}

function sendAlert({ webhookUrl, secret, title, content, level = 'warning', timeoutMs = 10000 }) {
  return new Promise((resolve, reject) => {
    const timestamp = Math.floor(Date.now() / 1000)
    const body = JSON.stringify({
      timestamp: String(timestamp),
      sign: sign(secret, timestamp),
      msg_type: 'interactive',
      card: {
        config: { wide_screen_mode: true },
        header: {
          title: { tag: 'plain_text', content: title },
          template: level === 'critical' ? 'red' : level === 'info' ? 'blue' : 'orange'
        },
        elements: [
          { tag: 'div', text: { tag: 'lark_md', content } },
          { tag: 'note', elements: [{ tag: 'plain_text', content: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) }] }
        ]
      }
    })
    const url = new URL(webhookUrl)
    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'huolongguoBot-monitor/1.0'
      }
    }, (res) => {
      let chunks = ''
      res.on('data', (d) => chunks += d)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(chunks)
          if (parsed.code === 0 || parsed.StatusCode === 0) return resolve(parsed)
          reject(new Error(`Feishu rejected: ${chunks}`))
        } catch (e) {
          reject(new Error(`Feishu invalid response: ${chunks}`))
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Feishu webhook timeout')))
    req.write(body)
    req.end()
  })
}

module.exports = { sendAlert }
