/**
 * studio-cli bind-feishu —— CLI 绑定飞书（设备码模式，2026-08-15）
 *
 * 流程：CLI 调 /feishu-bind/cli-start（需个人 login token）→ 终端显示验证码 + 授权链接
 *      → 用户在浏览器打开链接（已登录后台）授权飞书 → CLI 轮询 /feishu-bind/cli-poll
 *      → 绑定完成，提示已关联的平台账户数。
 *
 * 一个飞书 open_id 可绑定多个平台账户（owner 的 gmail/163 双 superadmin）：
 * 绑定后 agent 在飞书里能认出你（resolveSpeaker superadmin 优先）。
 * 只支持个人 login 账户；租户 apiKey 身份无法绑定个人飞书。
 */
import { loadConfig, DEFAULT_BASE_URL } from '../config.js'

interface BindStart {
  device_code: string
  user_code: string
  authorize_url: string
  expires_in: number
  interval: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function bindFeishu(opts: { baseUrl?: string }): Promise<void> {
  const baseUrl = (opts.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const cfg = loadConfig()
  if (!cfg.token) {
    throw new Error('绑定飞书需要个人账户登录：先执行 studio-cli login（租户 apiKey 无法绑定个人飞书）')
  }

  process.stderr.write('正在发起飞书绑定...\n')
  const startResp = await fetch(`${baseUrl}/api/feishu-bind/cli-start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}` },
  })
  if (!startResp.ok) {
    const d = await startResp.json().catch(() => ({})) as { error?: string }
    throw new Error(`发起绑定失败: HTTP ${startResp.status} ${d?.error || ''}`)
  }
  const start = await startResp.json() as BindStart

  process.stderr.write('\n')
  process.stderr.write('┌──────────────────────────────────────────────────┐\n')
  process.stderr.write('│                                                  │\n')
  process.stderr.write(`│   验证码:  ${start.user_code.padEnd(34)}        │\n`)
  process.stderr.write('│                                                  │\n')
  process.stderr.write('│   请在浏览器打开以下地址，授权绑定你的飞书：      │\n')
  process.stderr.write('│                                                  │\n')
  process.stderr.write('│   ' + start.authorize_url + '\n')
  process.stderr.write('│                                                  │\n')
  process.stderr.write('└──────────────────────────────────────────────────┘\n')
  process.stderr.write('\n等待授权完成...（可随时 Ctrl+C 取消）\n')

  const interval = (start.interval || 3) * 1000
  const maxAttempts = Math.floor(((start.expires_in || 600) * 1000) / interval)

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(interval)
    const pollResp = await fetch(`${baseUrl}/api/feishu-bind/cli-poll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code: start.device_code }),
    })
    if (!pollResp.ok) continue
    const poll = await pollResp.json() as { status: string; linked_count?: number; error?: string }

    if (poll.status === 'approved') {
      const n = poll.linked_count || 1
      process.stderr.write(`\n✅ 飞书绑定成功！已关联 ${n} 个平台账户。agent 在飞书里能认出你了。\n`)
      return
    }
    if (poll.status === 'expired') {
      throw new Error('绑定请求已过期，请重新执行 studio-cli bind-feishu')
    }
  }
  throw new Error('绑定超时，请重新执行 studio-cli bind-feishu')
}
