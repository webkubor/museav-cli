import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({ t: (key: string, o?: { name?: string; no?: string }) => (o?.no ? `${o.name} · 工号 ${o.no}` : key) }),
}))

import { HandoffHeaderStatus } from './human-chat'

const noop = () => {}

it('shows only the agent name when no employee number comes down — no dangling「· 工号」', () => {
  render(<HandoffHeaderStatus mode={{ kind: 'human', ticketId: 'CS-1', agentName: '王恩博' }} onCancel={noop} onEnd={noop} />)
  expect(screen.getByText('王恩博')).toBeInTheDocument()
  expect(screen.queryByText(/工号/)).not.toBeInTheDocument()
})

it('keeps the full「姓名 · 工号」line when the number exists', () => {
  render(<HandoffHeaderStatus mode={{ kind: 'human', ticketId: 'CS-1', agentName: '王恩博', agentNo: '1024' }} onCancel={noop} onEnd={noop} />)
  expect(screen.getByText('王恩博 · 工号 1024')).toBeInTheDocument()
})

it('rating card shows just the agent name when there is no employee number — no trailing「·」', async () => {
  const { RatingCard } = await import('./human-chat')
  render(<RatingCard item={{ id: 'r', role: 'system', content: '', createdAt: 0, kind: 'rating_card', ratingCard: { ticketId: 'CS-1', agentName: '王恩博' } }} onSubmit={noop} onSkip={noop} />)
  expect(screen.getByText('王恩博')).toBeInTheDocument()
  expect(screen.queryByText(/·/)).not.toBeInTheDocument()
})
