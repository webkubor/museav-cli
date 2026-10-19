import { describe, expect, it } from 'vitest'
import { buildHandoffContext, isBareHandoffRequest, type ChatItem } from './use-support'

/**
 * 人工交接上文（PRD §8.6 + §10，prd#996、modelgo_prd#1388）。
 *
 * 钉死三件事：**按 agent 认的字段给**（last_user_text 生成工单描述、transcript 进快照——
 * 此前发的 summary 字段 agent 不认，工单只剩通用描述）；**挑对那一句**（闸门下最后一句常是
 * 裸「转人工」，描述要用此前的具体问题）；**不该带的绝不带**（回答正文、sensitive.Hit 命中的消息）。
 * 这条链路在浏览器里抓不到请求体（请求层不走原生 fetch body，CDP 也要额外取），
 * 所以用纯函数测试把契约钉在这里，比抓包可靠。
 */
function msg(partial: Partial<ChatItem> & Pick<ChatItem, 'role' | 'content'>): ChatItem {
  return { id: Math.random().toString(36), createdAt: Date.now(), ...partial }
}

describe('isBareHandoffRequest', () => {
  it.each(['转人工', '人工客服', '还是转人工吧', '麻烦帮我转人工，谢谢', '找客服！'])('%s 只是在要人工', (text) => {
    expect(isBareHandoffRequest(text)).toBe(true)
  })
  it.each(['转人工，怎么创建 API Key', '账单金额不对', '转人工 429', 'req_abcdef123 调用失败'])('%s 带了具体问题', (text) => {
    expect(isBareHandoffRequest(text)).toBe(false)
  })
})

describe('buildHandoffContext', () => {
  it('last_user_text 跳过裸「转人工」，取最近一条具体问题', () => {
    const out = buildHandoffContext([
      msg({ role: 'user', content: '转人工' }),
      msg({ role: 'assistant', content: '请先描述问题', answerStatus: 'handoff_needs_question' }),
      msg({ role: 'user', content: '转人工，怎么创建 API Key' }),
      msg({ role: 'assistant', content: '这是一段不该出现在上文里的回答正文', answerStatus: 'answered' }),
      msg({ role: 'user', content: '转人工' }),
    ])
    expect(out.last_user_text).toBe('转人工，怎么创建 API Key')
  })

  it('transcript 只带用户提问与回答状态，不带回答正文', () => {
    const out = buildHandoffContext([
      msg({ role: 'user', content: '怎么创建 API Key' }),
      msg({ role: 'assistant', content: '这是一段不该出现在上文里的回答正文', answerStatus: 'answered' }),
      msg({ role: 'user', content: '还是报 401' }),
      msg({ role: 'assistant', content: '另一段回答正文', answerStatus: 'insufficient_evidence' }),
    ])
    expect(out.transcript).toEqual([
      { role: 'user', content: '怎么创建 API Key' },
      { role: 'assistant', answer_status: 'answered' },
      { role: 'user', content: '还是报 401' },
      { role: 'assistant', answer_status: 'insufficient_evidence' },
    ])
    expect(JSON.stringify(out)).not.toContain('回答正文')
  })

  it('sensitive.Hit 命中的提问被剔除（§10：凭据不得进入交接上文）', () => {
    const out = buildHandoffContext([
      msg({ role: 'user', content: '调用一直失败' }),
      // fixture 故意不写成真 key 的形状：agentGuard 会把它当凭据拦下提交（已被拦过一次）。
      // 这条测的是「sensitiveHit 为 true 就剔除」，与字符串长什么样无关。
      msg({ role: 'user', content: 'MY-FAKE-CREDENTIAL-FIXTURE 还是失败', sensitiveHit: true }),
    ])
    expect(out.last_user_text).toBe('调用一直失败')
    expect(JSON.stringify(out)).not.toContain('MY-FAKE-CREDENTIAL-FIXTURE')
  })

  it('从没说过具体问题时不给 last_user_text', () => {
    const out = buildHandoffContext([msg({ role: 'user', content: '转人工' }), msg({ role: 'user', content: '在吗' })])
    expect(out.last_user_text).toBeUndefined()
  })

  it('只取最近 6 条提问，每条截到 200 字', () => {
    const many = Array.from({ length: 10 }, (_, i) => msg({ role: 'user', content: `问题${i}` }))
    const contents = buildHandoffContext(many).transcript.map((e) => ('content' in e ? e.content : ''))
    expect(contents).toEqual(['问题4', '问题5', '问题6', '问题7', '问题8', '问题9'])

    const long = buildHandoffContext([msg({ role: 'user', content: 'x'.repeat(300) })])
    expect(long.last_user_text).toHaveLength(200)
    expect(long.transcript[0]).toEqual({ role: 'user', content: 'x'.repeat(200) })
  })
})
