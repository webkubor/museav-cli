import { describe, expect, it } from 'vitest'
import { mergeFreshAgentMessages, type ChatItem } from './use-support'
import type { SupportMessage } from '@/interfaces/support'

/**
 * 人工会话拉取客服新消息（CS-20260917-4109）。
 *
 * 后台回复后前台对话框不更新：GET /support/tickets/:id/messages 实测字段是
 * `sender_type`（user/agent），前端却按 PRD 的 `role === 'agent'` 过滤，
 * 客服气泡被整批丢掉。这条用例用那张工单的真实 payload 钉住收口。
 */
function localUser(content: string): ChatItem {
  return { id: crypto.randomUUID(), role: 'user', content, createdAt: Date.now() }
}

describe('mergeFreshAgentMessages', () => {
  it('把 CS-20260917-4109 那种只带 sender_type 的客服回复收进对话框', () => {
    const prev = [localUser('hi')]
    // 工单 CS-20260917-4109 test PG 实测行：seq=4 sender_type=agent content=你好啊
    const items = [
      { id: 'msg_user_1', sender_type: 'user', content: 'hi', created_at: '2026-09-17T11:55:19.529691Z' },
      {
        id: 'msg_1789646137438563200_9',
        sender_type: 'agent',
        content: '你好啊',
        created_at: '2026-09-17T11:55:37.438562Z',
      },
    ] as SupportMessage[]

    const next = mergeFreshAgentMessages(prev, items)

    expect(next).toHaveLength(2)
    expect(next[1]).toMatchObject({
      id: 'msg_1789646137438563200_9',
      role: 'agent',
      content: '你好啊',
    })
    expect(next[1].createdAt).toBe(Date.parse('2026-09-17T11:55:37.438562Z'))
  })

  it('已在本地的客服消息不重复追加；role 字段仍可用', () => {
    const prev: ChatItem[] = [{
      id: 'msg_agent_1',
      role: 'agent',
      content: '先到的',
      createdAt: 1,
    }]
    const items = [
      { id: 'msg_agent_1', role: 'agent', content: '先到的', created_at: '2026-09-17T11:55:37.438562Z' },
      { id: 'msg_agent_2', role: 'agent', content: '后到的', created_at: '2026-09-17T11:56:00Z' },
    ] as SupportMessage[]

    const next = mergeFreshAgentMessages(prev, items)
    expect(next.map((m) => m.id)).toEqual(['msg_agent_1', 'msg_agent_2'])
  })
})
