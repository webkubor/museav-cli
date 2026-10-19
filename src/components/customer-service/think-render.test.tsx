/**
 * 智能客服助手回答的 <think> 显示侧防线（#1124）。
 *
 * QA 注入的畸形模型输出：一条完整 <think> 推理块后紧跟正文，且正文里带
 * "I'll help you" 这类合法英文句子。渲染前必须把标签与推理内容整段去掉，
 * 同时**逐字保留**正文（含那句英文）—— 后端已在答案边界做同一件事
 * （modelgo-agent pkg/support/loop/reasoning.go），这里是前端再兜一层。
 *
 * 反向守卫：用户消息与人工客服消息一律**不做**抽取，原样展示。
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ChatItem } from './use-support'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { MessageBubble } from './index'

afterEach(cleanup)

/** QA 实测注入的原始模型输出（推理块 + 英文过渡语 + 中文最终答复）。 */
const QA_PAYLOAD = "<think>reasoning</think>I'll help you…QA最终答复正文"

function renderBubbleText(role: ChatItem['role'], content: string): string {
  const { container } = render(
    <MessageBubble
      msg={{ id: 'msg', role, content, createdAt: 0 }}
      onRate={vi.fn()}
    />,
  )
  return container.textContent ?? ''
}

it('助手回答：去掉 <think> 标签与推理，保留最终正文和合法英文', () => {
  const text = renderBubbleText('assistant', QA_PAYLOAD)
  expect(text).not.toContain('<think')
  expect(text).not.toContain('</think')
  expect(text).not.toContain('reasoning')
  expect(text).toContain("I'll help you…QA最终答复正文")
})

it('用户消息：不做抽取，think 原文原样保留', () => {
  const text = renderBubbleText('user', QA_PAYLOAD)
  expect(text).toContain('reasoning')
  expect(text).toContain('<think>')
})

it('人工客服消息：不做抽取，think 原文原样保留', () => {
  const text = renderBubbleText('agent', QA_PAYLOAD)
  expect(text).toContain('reasoning')
  expect(text).toContain('<think>')
})
