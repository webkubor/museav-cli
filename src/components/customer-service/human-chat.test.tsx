import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({ t: (key: string, o?: { name?: string; no?: string }) => (o?.no ? `${o.name} · 工号 ${o.no}` : key) }),
}))

import { HandoffHeaderStatus } from './human-chat'

const noop = () => {}

// prd46#1201：人工服务中不向用户展示客服真名/工号，顶栏固定「人工客服」，评价卡不带客服名称
it('人工服务顶栏固定显示「人工客服」，不展示客服姓名与工号 (#1201)', () => {
  render(<HandoffHeaderStatus mode={{ kind: 'human', ticketId: 'CS-1', agentName: '王恩博', agentNo: '1024' }} onCancel={noop} onEnd={noop} />)
  expect(screen.getByText('common.customerService.handoff.entry')).toBeInTheDocument()
  expect(screen.queryByText(/王恩博/)).not.toBeInTheDocument()
  expect(screen.queryByText(/工号/)).not.toBeInTheDocument()
})

it('评价卡不展示客服名称 (#1201)', async () => {
  const { RatingCard } = await import('./human-chat')
  render(<RatingCard item={{ id: 'r', role: 'system', content: '', createdAt: 0, kind: 'rating_card', ratingCard: { ticketId: 'CS-1', agentName: '王恩博', agentNo: '1024' } }} onSubmit={noop} onSkip={noop} />)
  expect(screen.getByText('common.customerService.handoff.rateService')).toBeInTheDocument()
  expect(screen.queryByText(/王恩博/)).not.toBeInTheDocument()
})
