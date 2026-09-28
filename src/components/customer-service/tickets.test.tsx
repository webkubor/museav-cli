import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { SupportTicketDetail, SupportTicketSummary } from '@/interfaces/support'

// account 要是稳定引用：每次渲染给新对象会让列表的 effect（依赖 account）反复重拉
const { listTickets, account } = vi.hoisted(() => ({ listTickets: vi.fn(), account: {} }))
vi.mock('@/services/support', () => ({ listSupportTickets: listTickets }))
vi.mock('@/store/auth', () => ({ useAuthStore: (select: (state: { account: object }) => unknown) => select({ account }) }))
vi.mock('@/lib/timezone', () => ({ resolveTimeZone: () => 'America/New_York' }))
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({ t: (key: string, opts?: { time?: string }) => (opts?.time ? `${key}:${opts.time}` : key) }),
}))

import { TicketDetailView, TicketsList } from './tickets'

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

const feedbackDetail: SupportTicketDetail = {
  ...ticket,
  capabilities: { can_reopen: false, can_create_followup: false, can_supplement: true },
  supplements: [{ id: 'sup_FB-20260923-001_0', content: '第一次补充\n第二行', created_at: '2026-09-23T16:05:00Z' }],
}

function renderDetail(detail: SupportTicketDetail, onSupplement = vi.fn().mockResolvedValue('ok')) {
  render(<TicketDetailView detail={detail} onBack={vi.fn()} onReopen={vi.fn()} onRate={vi.fn()} onSupplement={onSupplement} />)
  return onSupplement
}

it('renders each supplement under the description with a 补充 · MM-DD HH:mm stamp (#1119)', () => {
  renderDetail(feedbackDetail)
  // 用户显示时区 America/New_York（EDT，UTC-4）：16:05Z → 12:05
  expect(screen.getByText('common.customerService.ticket.supplementAt:09-23 12:05')).toBeInTheDocument()
  expect(screen.getByText(/第一次补充/)).toHaveTextContent('第一次补充 第二行')
})

it('submits a trimmed supplement and closes the form on success (#1119)', async () => {
  const onSupplement = renderDetail(feedbackDetail)
  fireEvent.click(screen.getByRole('button', { name: 'common.customerService.ticket.supplement' }))
  const submit = screen.getByRole('button', { name: 'common.customerService.ticket.supplementSubmit' })
  expect(submit).toBeDisabled()

  fireEvent.change(screen.getByRole('textbox', { name: 'common.customerService.ticket.supplement' }), { target: { value: '  补充复现步骤  ' } })
  fireEvent.click(submit)
  // 提交中锁住输入框与取消：成功会清空，点提交后再补打的字不能被静默吞掉
  expect(screen.getByRole('textbox', { name: 'common.customerService.ticket.supplement' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'common.cancel' })).toBeDisabled()

  await waitFor(() => expect(onSupplement).toHaveBeenCalledWith('补充复现步骤'))
  await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument())
  expect(screen.getByRole('button', { name: 'common.customerService.ticket.supplement' })).toBeInTheDocument()
})

it('keeps the typed text when the supplement fails so the user can retry (#1119)', async () => {
  const onSupplement = renderDetail(feedbackDetail, vi.fn().mockResolvedValue('failed'))
  fireEvent.click(screen.getByRole('button', { name: 'common.customerService.ticket.supplement' }))
  const box = screen.getByRole('textbox', { name: 'common.customerService.ticket.supplement' })
  fireEvent.change(box, { target: { value: '会失败的补充' } })
  fireEvent.click(screen.getByRole('button', { name: 'common.customerService.ticket.supplementSubmit' }))

  await waitFor(() => expect(onSupplement).toHaveBeenCalled())
  await waitFor(() => expect(screen.getByRole('button', { name: 'common.customerService.ticket.supplementSubmit' })).not.toBeDisabled())
  expect(box).toHaveValue('会失败的补充')
})

it('hides the supplement entry once the ticket can no longer take one', () => {
  renderDetail({ ...feedbackDetail, capabilities: { ...feedbackDetail.capabilities, can_supplement: false } })
  expect(screen.queryByRole('button', { name: 'common.customerService.ticket.supplement' })).not.toBeInTheDocument()
})

it('collapses the form when the ticket can no longer take a supplement (#1119)', async () => {
  const onSupplement = renderDetail(feedbackDetail, vi.fn().mockResolvedValue('closed'))
  fireEvent.click(screen.getByRole('button', { name: 'common.customerService.ticket.supplement' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'common.customerService.ticket.supplement' }), { target: { value: '工单已结' } })
  fireEvent.click(screen.getByRole('button', { name: 'common.customerService.ticket.supplementSubmit' }))

  await waitFor(() => expect(onSupplement).toHaveBeenCalled())
  await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument())
})

it('shows the guidance line under an empty list, and a different line for an empty search (#1149)', async () => {
  listTickets.mockResolvedValue({ items: [], next_cursor: null, has_more: false })
  render(<TicketsList onSelect={vi.fn()} onClose={vi.fn()} />)
  expect(await screen.findByText('common.customerService.tickets.empty')).toBeInTheDocument()
  expect(screen.getByText('common.customerService.tickets.emptyHint')).toBeInTheDocument()

  fireEvent.change(screen.getByPlaceholderText('common.customerService.tickets.searchPlaceholder'), { target: { value: 'CS-404' } })
  fireEvent.keyDown(screen.getByPlaceholderText('common.customerService.tickets.searchPlaceholder'), { key: 'Enter' })
  expect(await screen.findByText('common.customerService.tickets.emptySearch')).toBeInTheDocument()
  expect(screen.queryByText('common.customerService.tickets.emptyHint')).not.toBeInTheDocument()
})

it('renders a load failure as an alert with a reload button instead of the empty state (#1150)', async () => {
  listTickets.mockRejectedValueOnce(Object.assign(new Error('boom'), { response: { status: 500 } }))
  listTickets.mockResolvedValueOnce({ items: [ticket], next_cursor: null, has_more: false })
  render(<TicketsList onSelect={vi.fn()} onClose={vi.fn()} />)

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('common.customerService.tickets.loadFailed')
  expect(screen.queryByText('common.customerService.tickets.empty')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'common.customerService.tickets.reload' }))
  expect(await screen.findByRole('button', { name: /FB-20260923-001/ })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('replaces the endless loading line with an inaccessible notice when the detail 404s (#1151)', () => {
  const onBack = vi.fn()
  render(<TicketDetailView detail={null} error={Object.assign(new Error('nf'), { response: { status: 404 } })} onRetry={vi.fn()} onBack={onBack} onReopen={vi.fn()} onRate={vi.fn()} onSupplement={vi.fn()} />)
  expect(screen.queryByText('common.customerService.tickets.loading')).not.toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('common.customerService.tickets.unavailable')
  fireEvent.click(screen.getByRole('button', { name: 'common.customerService.tickets.backToList' }))
  expect(onBack).toHaveBeenCalled()
})

it('offers a reload, not a dead end, when the detail fails for a transient reason (#1151)', () => {
  const onRetry = vi.fn()
  render(<TicketDetailView detail={null} error={Object.assign(new Error('down'), { response: { status: 503 } })} onRetry={onRetry} onBack={vi.fn()} onReopen={vi.fn()} onRate={vi.fn()} onSupplement={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'common.customerService.tickets.reload' }))
  expect(onRetry).toHaveBeenCalled()
})
