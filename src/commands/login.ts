/**
 * studio-cli login —— 设备授权登录（RFC 8628）
 *
 * 流程：CLI 调 /cli-auth/start 拿验证码 → 用户浏览器打开审批页授权
 *      → CLI 轮询 /cli-auth/poll 拿 JWT → 存到 ~/.studio-cli.json
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
      process.stderr.write('\n✅ 登录成功！token 已保存到 ~/.studio-cli.json\n')
      await printWelcome(baseUrl, poll.token)
      return
    }
    if (poll.status === 'expired') {
      throw new Error('授权已过期，请重新运行 studio-cli login')
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
  throw new Error('等待授权超时，请重新运行 studio-cli login')
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 登录后的欢迎页：识别身份 + 打招呼 + 使用引导 + 联系我 + 绑定说明。查询失败不影响登录本身。 */
async function printWelcome(baseUrl: string, token: string): Promise<void> {
  try {
    const me = await new StudioClient({ baseUrl, token }).me()
    const name = me.nickname || me.email
    // 身份识别：superadmin > admin > 租户成员 > 平台用户
    let identity = '平台用户'
    let greeting = '欢迎使用 MUSE AV 创作中台'
    if (me.role === 'superadmin') {
      identity = '平台超级管理员'
      greeting = '欢迎回来，山鬼映画！平台归你管，出了事找你本人 😄'
    } else if (me.role === 'admin') {
      identity = '平台管理员'
      greeting = `欢迎回来，${name}！`
    } else if (me.brand) {
      identity = `${me.brand.name} 租户成员`
      greeting = `欢迎，${name}！${me.brand.name} 的创作助手已就位`
    } else {
      greeting = `欢迎，${name}！`
    }
    const quota = me.generation_remaining != null ? `${me.generation_remaining} 次` : '不限'
    process.stderr.write(`👋 ${greeting}\n`)
    process.stderr.write(`   账户：${me.email}（${identity}）\n`)
    process.stderr.write(`   已出图 ${me.gen_done || 0} 张 · 剩余额度 ${quota}\n`)
  } catch {
    process.stderr.write('👋 欢迎使用 MUSE AV 创作中台\n')
  }

  process.stderr.write('\n')
  process.stderr.write('┌──────────────────────────────────────────────────────────┐\n')
  process.stderr.write('│  📖 怎么用（常用命令）                                    │\n')
  process.stderr.write('│    studio-cli gen --prompt "英文提示词"    自由出图        │\n')
  process.stderr.write('│    studio-cli gen --skill <技能> --input "描述"  技能出图  │\n')
  process.stderr.write('│    studio-cli gen --template <id> --fields \'{..}\'  模板   │\n')
  process.stderr.write('│    studio-cli skills / templates / reverse    查技能/模板  │\n')
  process.stderr.write('│    studio-cli jobs / whoami                  记录 / 身份   │\n')
  process.stderr.write('│    studio-cli bind-feishu                     绑定飞书      │\n')
  process.stderr.write('└──────────────────────────────────────────────────────────┘\n')
  process.stderr.write('\n🔗 找我 / 支持我：\n')
  process.stderr.write('   · GitHub 给项目点个 ⭐ → https://github.com/webkubor/studio-cli\n')
  process.stderr.write('   · 小红书「山鬼映画」（东方电影美学）→ https://www.xiaohongshu.com/user/profile/5c3c1581000000000501835d\n')
  process.stderr.write('\nℹ️ 绑定说明：\n')
  process.stderr.write('   · 出图 / 技能 / 模板 / 逆向等全部创作功能【不需要】绑定飞书\n')
  process.stderr.write('   · 绑定飞书（bind-feishu）只影响：让 agent 在飞书里认出你的身份\n')
  process.stderr.write('\n现在就可以开始：studio-cli gen --prompt "一只猫"\n')
}
