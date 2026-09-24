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

function bubble(status: ChatItem['answerStatus'], suggestHandoff = false) {
  render(<MessageBubble msg={{ id: 'answer', role: 'assistant', content: '回答', createdAt: 0, answerStatus: status, suggestHandoff }} onRate={vi.fn()} onStartHandoff={vi.fn()} />)
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

it.each(['zh', 'en'] as const)('%s explicit human handoff keeps its CTA', (language) => {
  locale.current = language
  bubble('human_handoff')
  expect(screen.getByRole('button', { name: language === 'zh' ? zh.common.customerService.answerStatus.handoffCta : en.common.customerService.answerStatus.handoffCta })).toBeTruthy()
})
