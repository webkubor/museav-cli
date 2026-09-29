import { describe, expect, it } from 'vitest'
import { buildHandoffSummary, type ChatItem } from './use-support'

/**
 * 人工交接摘要（PRD §8.6 + §10，prd#996）。
 *
 * 钉死两件事：**该带的带上**（页面、最近提问、已尝试回答次数，客服不用从头问一遍），
 * **不该带的绝不带**（回答正文、以及 sensitive.Hit 命中的那条消息 —— §10 明确
 * API Key / Token / 密码不得进入交接摘要）。
 * 这条链路在浏览器里抓不到请求体（请求层不走原生 fetch body，CDP 也要额外取），
 * 所以用纯函数测试把契约钉在这里，比抓包可靠。
 */
function msg(partial: Partial<ChatItem> & Pick<ChatItem, 'role' | 'content'>): ChatItem {
  return { id: Math.random().toString(36), createdAt: Date.now(), ...partial }
}

describe('buildHandoffSummary', () => {
  it('带上页面、最近提问和已尝试回答次数', () => {
    const out = buildHandoffSummary([
      msg({ role: 'user', content: '怎么创建 API Key' }),
      msg({ role: 'assistant', content: '这是一段不该出现在摘要里的回答正文' }),
      msg({ role: 'user', content: '还是报 401' }),
      msg({ role: 'assistant', content: '另一段回答正文' }),
    ], '/dashboard?tab=usage')

    expect(out).toContain('页面：/dashboard?tab=usage')
    expect(out).toContain('已尝试智能回答 2 次')
    expect(out).toContain('- 怎么创建 API Key')
    expect(out).toContain('- 还是报 401')
    // 负控：回答正文一个字都不能进摘要
    expect(out).not.toContain('不该出现在摘要里')
    expect(out).not.toContain('另一段回答正文')
  })

  it('sensitive.Hit 命中的提问被剔除（§10：凭据不得进入交接摘要）', () => {
    const out = buildHandoffSummary([
      // fixture 故意不写成真 key 的形状：agentGuard 会把它当凭据拦下提交（已被拦过一次）。
      // 这条测的是「sensitiveHit 为 true 就剔除」，与字符串长什么样无关。
      msg({ role: 'user', content: 'MY-FAKE-CREDENTIAL-FIXTURE', sensitiveHit: true }),
      msg({ role: 'user', content: '调用一直失败' }),
    ], '/models')

    expect(out).toContain('- 调用一直失败')
    expect(out).not.toContain('MY-FAKE-CREDENTIAL-FIXTURE')
  })

  it('没有任何回答时如实说明，不写成 0 次', () => {
    const out = buildHandoffSummary([msg({ role: 'user', content: '在吗' })], '/')
    expect(out).toContain('未获得智能回答')
    expect(out).not.toContain('已尝试智能回答')
  })

  it('只取最近 6 条提问，整体不超过 800 字', () => {
    const many = Array.from({ length: 10 }, (_, i) => msg({ role: 'user', content: `问题${i}` }))
    const out = buildHandoffSummary(many, '/')
    expect(out).not.toContain('问题3')
    expect(out).toContain('问题4')
    expect(out).toContain('问题9')

    const long = buildHandoffSummary(
      Array.from({ length: 6 }, () => msg({ role: 'user', content: 'x'.repeat(300) })),
      '/',
    )
    expect(long.length).toBeLessThanOrEqual(800)
  })
})
