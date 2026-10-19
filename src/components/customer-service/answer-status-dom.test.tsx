import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ChatItem } from './use-support'
import zh from '@/locales/zh/common.json'
import en from '@/locales/en/common.json'

const { locale } = vi.hoisted(() => ({ locale: { current: 'zh' as 'zh' | 'en' } }))
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({ t: (key: string) => {
    const translations = locale.current === 'zh' ? zh : en
    const value = key.split('.').reduce<unknown>((entry, part) =>
      entry && typeof entry === 'object' ? (entry as Record<string, unknown>)[part] : undefined, translations)
    return typeof value === 'string' ? value : key
  } }),
}))

import { MessageBubble } from './index'

afterEach(cleanup)

function bubble(status: ChatItem['answerStatus']) {
  render(<MessageBubble msg={{ id: 'answer', role: 'assistant', content: '回答', createdAt: 0, answerStatus: status }} onRate={vi.fn()} />)
  return screen.getByText('回答').parentElement!.parentElement!
}

it.each([['zh', /转人工/], ['en', /human agent/i]] as const)(
  '%s insufficient evidence bubble suggests feedback without a human handoff', (language, handoffText) => {
    locale.current = language
    const answer = bubble('insufficient_evidence')
    expect(answer.textContent).toMatch(/反馈|feedback/i)
    expect(answer.textContent).not.toMatch(handoffText)
    expect(answer.querySelector('button')).toBeNull()
  },
)

// modelgo_prd#1388：气泡里不再有「转人工」按钮，转人工只能在对话里表达、由后端放行。
it.each(['zh', 'en'] as const)('%s bubbles never render a handoff button', (language) => {
  locale.current = language
  for (const status of ['human_handoff', 'suggest_handoff', 'intent', 'handoff_needs_question', 'handoff_pending'] as const) {
    cleanup()
    const answer = bubble(status)
    expect(answer.querySelector('button')).toBeNull()
  }
})
