/**
 * studio-image login —— 设备授权登录（RFC 8628）
 *
 * 流程：CLI 调 /cli-auth/start 拿验证码 → 用户浏览器打开审批页授权
 *      → CLI 轮询 /cli-auth/poll 拿 JWT → 存到 ~/.studio-image.json
 *
 * 之后所有命令用 Bearer JWT 调 API，权限/额度与网页端一致。
 */
import { saveConfig, DEFAULT_BASE_URL } from '../config.js'
import { StudioClient } from '../client.js'

export async function login(opts: { baseUrl?: string }): Promise<void> {
  const baseUrl = (opts.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')

  // 1. 发起设备授权
  process.stderr.write('正在发起授权...\n')
  const startResp = await fetch(`${baseUrl}/api/cli-auth/start`, { method: 'POST' })
  if (!startResp.ok) {
    throw new Error(`发起授权失败: HTTP ${startResp.status}`)
  }
  const start = await startResp.json() as {
    device_code: string
    user_code: string
    verification_uri: string
    expires_in: number
    interval: number
  }

  // 2. 展示验证码和链接，等用户去浏览器授权
  process.stderr.write('\n')
  process.stderr.write('┌──────────────────────────────────────────────────┐\n')
  process.stderr.write('│                                                  │\n')
  process.stderr.write(`│   验证码:  ${start.user_code.padEnd(34)}        │\n`)
  process.stderr.write('│                                                  │\n')
  process.stderr.write('│   请在浏览器打开以下地址，登录并批准授权：        │\n')
  process.stderr.write('│                                                  │\n')
  process.stderr.write('│   ' + start.verification_uri + '\n')
  process.stderr.write('│                                                  │\n')
  process.stderr.write('└──────────────────────────────────────────────────┘\n')
  process.stderr.write('\n等待授权完成...（可随时 Ctrl+C 取消）\n')

  // 3. 轮询直到拿到 token
  const interval = (start.interval || 3) * 1000
  const maxAttempts = Math.floor((start.expires_in || 600) * 1000 / interval)

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(interval)
    const pollResp = await fetch(`${baseUrl}/api/cli-auth/poll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code: start.device_code }),
    })
    if (!pollResp.ok) continue
    const poll = await pollResp.json() as { status: string; token?: string; error?: string }

    if (poll.status === 'approved' && poll.token) {
      saveConfig({ baseUrl, token: poll.token })
      process.stderr.write('\n✅ 登录成功！token 已保存到 ~/.studio-image.json\n')
      await printAffiliation(baseUrl, poll.token)
      process.stderr.write('现在可以出图了：studio-image gen --prompt "一只猫"\n')
      return
    }
    if (poll.status === 'expired') {
      throw new Error('授权已过期，请重新运行 studio-image login')
    }
    // 服务端目前只有 pending → approved 或过期两条路，没有"拒绝"这个动作
    // （浏览器审批页没有拒绝按钮，不批准就是不动，最终走 expired）。
    // 这里仍保留未知状态的兜底，万一以后服务端加了新状态，报错文案不会文不对题。
    if (poll.status !== 'pending') {
      throw new Error(`授权失败: ${poll.error || poll.status || '未知错误'}`)
    }
    // pending：继续等
    process.stderr.write('.')
  }
  throw new Error('等待授权超时，请重新运行 studio-image login')
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 登录后告诉用户账户归属——纯提示，查询失败不影响登录本身 */
async function printAffiliation(baseUrl: string, token: string): Promise<void> {
  try {
    const me = await new StudioClient({ baseUrl, token }).me()
    if (me.brand) {
      process.stderr.write(`账户归属: ${me.brand.name}（该账户由此租户的邀请码注册）\n`)
    } else {
      process.stderr.write('账户归属: 平台用户（不属于任何租户）\n')
    }
  } catch {
    // 查询归属失败不影响登录，静默跳过
  }
}
