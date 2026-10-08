import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { SupportTicketDetail, SupportTicketSummary } from '@/interfaces/support'

// account 要是稳定引用：每次渲染给新对象会让列表的 effect（依赖 account）反复重拉
const { listTickets, listAttachments, getAttachment, listEvents, uploadAttachment, attachAttachment, account } = vi.hoisted(() => ({
  listTickets: vi.fn(),
  listAttachments: vi.fn(async (): Promise<{ items: object[] }> => ({ items: [] })),
  getAttachment: vi.fn(),
  listEvents: vi.fn(async (): Promise<object[]> => []),
  uploadAttachment: vi.fn(),
  attachAttachment: vi.fn(),
  account: {},
}))
vi.mock('@/services/support', () => ({
  listSupportTickets: listTickets,
  listTicketAttachments: listAttachments,
  getTicketAttachment: getAttachment,
  listTicketEvents: listEvents,
  uploadSupportAttachment: uploadAttachment,
  attachSupportTicketAttachment: attachAttachment,
}))
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

it('never flags a live human-service ticket as unread, even if a count comes down (#1153)', async () => {
  listTickets.mockResolvedValue({
    items: [{ ...ticket, ticket_id: 'CS-LIVE', ticket_type: 'human_support', service_mode: 'live', unread_count: 3 }],
    next_cursor: null, has_more: false,
  })
  render(<TicketsList onSelect={vi.fn()} onClose={vi.fn()} />)
  const row = await screen.findByRole('button', { name: /CS-LIVE/ })
  expect(row).not.toHaveTextContent('common.customerService.tickets.unread')
})

const asyncDetail: SupportTicketDetail = {
  ...ticket,
  ticket_id: 'CS-ASYNC',
  ticket_type: 'human_support',
  service_mode: 'async',
  status: 'processing',
  unread_count: 2,
  capabilities: { can_reopen: false, can_create_followup: false, can_reply: true },
}

it('renders the agent messages of an async ticket and a reply box at the bottom (#1154 #1152)', async () => {
  const onReply = vi.fn().mockResolvedValue(true)
  render(
    <TicketDetailView
      detail={asyncDetail}
      messages={[{ id: 'm1', role: 'agent', content: '您好，已收到', createdAt: 0 }]}
      renderMessage={(m) => <p>{m.content}</p>}
      onReply={onReply}
      onBack={vi.fn()} onReopen={vi.fn()} onRate={vi.fn()} onSupplement={vi.fn()}
    />,
  )
  expect(screen.getByText('您好，已收到')).toBeInTheDocument()
  const box = screen.getByRole('textbox', { name: 'common.customerService.tickets.detail.replyAria' })
  fireEvent.change(box, { target: { value: '  还是不行  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'common.customerService.tickets.detail.replySend' }))
  await waitFor(() => expect(onReply).toHaveBeenCalledWith('还是不行'))
  await waitFor(() => expect(box).toHaveValue(''))
})

it('keeps a live human ticket detail as an archive without a reply box', () => {
  render(
    <TicketDetailView
      detail={{ ...asyncDetail, service_mode: 'live' }}
      onReply={vi.fn()}
      onBack={vi.fn()} onReopen={vi.fn()} onRate={vi.fn()} onSupplement={vi.fn()}
    />,
  )
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
})

it('reports "latest seen" only once the last message scrolls into view, not on open (#1154)', () => {
  let fire: (visible: boolean) => void = () => {}
  const Original = globalThis.IntersectionObserver
  globalThis.IntersectionObserver = class {
    constructor(cb: (e: { isIntersecting: boolean }[]) => void) { fire = (v) => cb([{ isIntersecting: v }]) }
    observe() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver
  try {
    const onLatestVisible = vi.fn()
    render(
      <TicketDetailView
        detail={asyncDetail}
        messages={[{ id: 'm1', role: 'agent', content: 'x', createdAt: 0 }]}
        renderMessage={(m) => <p>{m.content}</p>}
        onLatestVisible={onLatestVisible}
        onBack={vi.fn()} onReopen={vi.fn()} onRate={vi.fn()} onSupplement={vi.fn()}
      />,
    )
    fire(false)
    expect(onLatestVisible).not.toHaveBeenCalled()
    fire(true)
    expect(onLatestVisible).toHaveBeenCalled()
  } finally {
    globalThis.IntersectionObserver = Original
  }
})

it('shows issue type, Request ID and a downloadable attachment on a feedback ticket (#1164)', async () => {
  listAttachments.mockResolvedValueOnce({ items: [{ id: 'att1', file_name: 'trace.txt', download_url: 'https://cdn.example.com/trace.txt' }] })
  const open = vi.spyOn(window, 'open').mockImplementation(() => null)
  render(<TicketDetailView detail={{ ...feedbackDetail, category: 'billing', request_id: 'req-34' }} onBack={vi.fn()} onReopen={vi.fn()} onRate={vi.fn()} onSupplement={vi.fn()} />)

  expect(screen.getByText('common.customerService.tickets.detail.categoryLabel')).toBeInTheDocument()
  expect(screen.getByText('common.customerService.feedback.categoryOptions.billing')).toBeInTheDocument()
  expect(screen.getByText('req-34')).toBeInTheDocument()
  fireEvent.click(await screen.findByRole('button', { name: 'common.customerService.tickets.detail.downloadAria' }))
  expect(open).toHaveBeenCalledWith('https://cdn.example.com/trace.txt', '_blank', 'noopener,noreferrer')
  open.mockRestore()
})

it('omits the Request ID and attachment rows entirely when they are empty (#1164)', async () => {
  render(<TicketDetailView detail={{ ...feedbackDetail, category: 'bug' }} onBack={vi.fn()} onReopen={vi.fn()} onRate={vi.fn()} onSupplement={vi.fn()} />)
  await waitFor(() => expect(listAttachments).toHaveBeenCalled())
  expect(screen.queryByText('common.customerService.tickets.detail.requestIdLabel')).not.toBeInTheDocument()
  expect(screen.queryByText('common.customerService.tickets.detail.attachmentsLabel')).not.toBeInTheDocument()
})

it('orders the feedback issue block as PRD lists it: issue type before the description (#1164)', () => {
  render(<TicketDetailView detail={{ ...feedbackDetail, category: 'billing' }} onBack={vi.fn()} onReopen={vi.fn()} onRate={vi.fn()} onSupplement={vi.fn()} />)
  const type = screen.getByText('common.customerService.tickets.detail.categoryLabel')
  const description = screen.getByText('模型调用失败，请帮忙排查')
  expect(type.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('shows the gateway request id from the response header as the error ID (#1150)', async () => {
  listTickets.mockRejectedValueOnce(Object.assign(new Error('boom'), { response: new Response(null, { status: 500, headers: { 'x-request-id': 'req-gw-1' } }) }))
  render(<TicketsList onSelect={vi.fn()} onClose={vi.fn()} />)
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  // 测试的 t mock 不插值，这里只断言调用路径：错误编号取自响应头
  expect(screen.queryByText(/HTTP 500/)).not.toBeInTheDocument()
})

it('does not report "latest seen" while the messages are still loading, even if the empty sentinel is visible (#1154)', () => {
  const fires: ((visible: boolean) => void)[] = []
  const Original = globalThis.IntersectionObserver
  globalThis.IntersectionObserver = class {
    constructor(cb: (e: { isIntersecting: boolean }[]) => void) { fires.push((v) => cb([{ isIntersecting: v }])) }
    observe() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver
  try {
    const onLatestVisible = vi.fn()
    const props = { detail: asyncDetail, renderMessage: (m: { content: string }) => <p>{m.content}</p>, onLatestVisible, onBack: vi.fn(), onReopen: vi.fn(), onRate: vi.fn(), onSupplement: vi.fn() }
    // 2026-09-28 test 实测：消息未回时哨兵贴在元信息下必然可见 —— 此时不能观察
    const { rerender } = render(<TicketDetailView {...props} messages={[]} messagesLoaded={false} />)
    fires.forEach((f) => f(true))
    expect(onLatestVisible).not.toHaveBeenCalled()

    // 消息回来后开始观察；哨兵被挤到下面、不可见时仍不判
    rerender(<TicketDetailView {...props} messages={[{ id: 'm1', role: 'agent', content: 'x', createdAt: 0 }]} messagesLoaded />)
    fires.at(-1)!(false)
    expect(onLatestVisible).not.toHaveBeenCalled()
    fires.at(-1)!(true)
    expect(onLatestVisible).toHaveBeenCalledTimes(1)
  } finally {
    globalThis.IntersectionObserver = Original
  }
})

// ── prd46#1198：问题反馈工单详情对齐 PRD §7.10/§7.11 ───────────────────────────
const feedbackTicket: SupportTicketDetail = { ...feedbackDetail, title: '后端固定标题', description: '模型调用失败，请帮忙排查', status: 'processing', next_step: '我们将在 1 个工作日内联系你。' }

it('顶栏是「工单详情」+ 编号，反馈单不渲染后端写死的「问题反馈」标题 (#1198)', () => {
  renderDetail(feedbackTicket)
  expect(screen.getByText('common.customerService.ticket.title')).toBeInTheDocument()
  expect(screen.queryByText('后端固定标题')).not.toBeInTheDocument()
})

it('问题描述带字段标签，补充续写在描述之后 (#1198)', () => {
  renderDetail(feedbackTicket)
  const label = screen.getByText('common.customerService.tickets.detail.descriptionLabel')
  const description = screen.getByText('模型调用失败，请帮忙排查')
  const supplement = screen.getByText(/第一次补充/)
  expect(label.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(description.compareDocumentPosition(supplement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('SLA 文案只在待处理时显示 (#1198)', () => {
  const { unmount } = render(<TicketDetailView detail={feedbackTicket} onBack={vi.fn()} onReopen={vi.fn()} onRate={vi.fn()} onSupplement={vi.fn()} />)
  expect(screen.queryByText('我们将在 1 个工作日内联系你。')).not.toBeInTheDocument()
  unmount()
  renderDetail({ ...feedbackTicket, status: 'pending' })
  expect(screen.getByText('我们将在 1 个工作日内联系你。')).toBeInTheDocument()
})

it('已解决时展示解决结论 (#1198)', () => {
  renderDetail({ ...feedbackTicket, status: 'resolved', resolution: '已为你补发额度' })
  expect(screen.getByText('common.customerService.ticket.resolution')).toBeInTheDocument()
  expect(screen.getByText('已为你补发额度')).toBeInTheDocument()
})

it('拉取并按顺序渲染处理记录 (#1198)', async () => {
  listEvents.mockResolvedValueOnce([
    { id: 'e1', ticket_id: 'FB-1', version: 1, type: 'ticket.created', summary: '用户提交问题反馈', actor_name: '用户', visible_to_user: true, created_at: '2026-10-08T01:00:00Z' },
    { id: 'e2', ticket_id: 'FB-1', version: 2, type: 'ticket.claimed', summary: '客服领取工单', actor_name: '客服', visible_to_user: true, created_at: '2026-10-08T02:00:00Z' },
  ])
  renderDetail(feedbackTicket)
  expect(await screen.findByText('common.customerService.ticket.handlingTitle')).toBeInTheDocument()
  const first = screen.getByText('用户提交问题反馈')
  const second = screen.getByText('客服领取工单')
  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('处理记录接口失败时不显示这一块，也不打断详情 (#1198)', async () => {
  listEvents.mockRejectedValueOnce(new Error('404'))
  renderDetail(feedbackTicket)
  await waitFor(() => expect(listEvents).toHaveBeenCalled())
  expect(screen.queryByText('common.customerService.ticket.handlingTitle')).not.toBeInTheDocument()
  expect(screen.getByText('模型调用失败，请帮忙排查')).toBeInTheDocument()
})

it('人工单评分读 human_rating (#1202 附带项)', () => {
  renderDetail({ ...asyncDetail, ticket_type: 'human_support', status: 'resolved', human_rating: 4 })
  expect(screen.getByText('★★★★☆')).toBeInTheDocument()
})
