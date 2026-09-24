import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { SupportTicketSummary } from '@/interfaces/support'

const { listTickets } = vi.hoisted(() => ({ listTickets: vi.fn() }))
vi.mock('@/services/support', () => ({ listSupportTickets: listTickets }))
vi.mock('@/store/auth', () => ({ useAuthStore: (select: (state: { account: object }) => unknown) => select({ account: {} }) }))
vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: vi.fn() }, useTranslation: () => ({ t: (key: string) => key }) }))

import { TicketsList } from './tickets'

const ticket: SupportTicketSummary = {
  ticket_id: 'FB-20260923-001',
  ticket_type: 'feedback',
  display_type: '问题反馈',
  status: 'pending',
  status_label: '等待客服受理',
  title: '模型调用失败',
  description: '模型调用失败，请帮忙排查',
  latest_visible_message: '模型调用失败，请帮忙排查',
  unread_count: 1,
  created_at: '2026-09-23T10:00:00Z',
  updated_at: '2026-09-23T10:00:00Z',
}

beforeEach(() => listTickets.mockReset())

it('renders all five ticket row elements using the agent latest-visible-message response', async () => {
  listTickets.mockResolvedValue({ items: [ticket], next_cursor: null, has_more: false })
  render(<TicketsList onSelect={vi.fn()} onClose={vi.fn()} />)

  const row = await screen.findByRole('button', { name: /FB-20260923-001/ })
  expect(row).toHaveTextContent('问题反馈')
  expect(row).toHaveTextContent('等待客服受理')
  expect(row).toHaveTextContent('模型调用失败')
  expect(row).toHaveTextContent('模型调用失败，请帮忙排查')
  expect(row).toHaveTextContent('FB-20260923-001')
  expect(row).toHaveTextContent('common.customerService.tickets.unread')
  expect(row.querySelector('[title="模型调用失败，请帮忙排查"]')).toBeInTheDocument()
})

it('falls back to the legacy preview when the agent field is absent', async () => {
  listTickets.mockResolvedValue({ items: [{ ...ticket, latest_visible_message: undefined, latest_message_preview: '旧接口摘要' }], next_cursor: null, has_more: false })
  render(<TicketsList onSelect={vi.fn()} onClose={vi.fn()} />)
  expect(await screen.findByText('旧接口摘要')).toBeInTheDocument()
})
