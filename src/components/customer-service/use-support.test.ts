/**
 * 客服浮层交接状态回归测试。
 * 路由：全站客服浮层
 * API：POST /support/handoff、POST /support/handoff/cancel
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { askSupportMock, askSupportStreamMock, requestHandoffMock, cancelHandoffMock, requestErrorMock, toastErrorMock, getSupportTicketMock, supplementTicketMock, markTicketReadMock, listTicketMessagesMock, replyTicketMessageMock, createSessionMock, authState, uploadSupportAttachmentMock, attachSupportTicketAttachmentMock, submitSupportFeedbackMock } = vi.hoisted(() => {
  const askSupportMock = vi.fn()
  // The hook consumes /support/ask as SSE: askSupportStream calls onFrame for
  // the status/answer/done frames. Tests keep configuring askSupportMock's
  // resolved value, and this adapter turns it into an answer frame.
  const askSupportStreamMock = vi.fn(async (_body: unknown, onFrame: (frame: { type: string; stage?: string; data?: unknown }) => void) => {
    const resp = await askSupportMock()
    onFrame({ type: 'status', stage: 'retrieving' })
    onFrame({ type: 'answer', data: resp })
    onFrame({ type: 'done' })
  })
  return {
    askSupportMock,
    askSupportStreamMock,
    requestHandoffMock: vi.fn(),
    cancelHandoffMock: vi.fn(),
    requestErrorMock: vi.fn(),
    toastErrorMock: vi.fn(),
    getSupportTicketMock: vi.fn(),
    supplementTicketMock: vi.fn(),
    markTicketReadMock: vi.fn(),
    listTicketMessagesMock: vi.fn(),
    replyTicketMessageMock: vi.fn(),
    createSessionMock: vi.fn(),
    uploadSupportAttachmentMock: vi.fn(),
    attachSupportTicketAttachmentMock: vi.fn(),
    submitSupportFeedbackMock: vi.fn(),
    authState: { account: null as null | { account_id: string }, isLoading: true },
  }
})

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/store/auth', () => ({
  useAuthStore: (selector: (state: typeof authState) => unknown) => selector(authState),
}))
vi.mock('@/services/support', () => ({
  askSupport: askSupportMock,
  askSupportStream: askSupportStreamMock,
  attachSupportTicketAttachment: attachSupportTicketAttachmentMock,
  cancelHandoff: cancelHandoffMock,
  createSupportSession: createSessionMock,
  endHandoff: vi.fn(),
  getSupportTicket: getSupportTicketMock,
  listTicketMessages: listTicketMessagesMock,
  markTicketRead: markTicketReadMock,
  rateAnswer: vi.fn(),
  rateTicket: vi.fn(),
  replyTicketMessage: replyTicketMessageMock,
  reopenTicket: vi.fn(),
  requestHandoff: requestHandoffMock,
  submitSupportFeedback: submitSupportFeedbackMock,
  supplementTicket: supplementTicketMock,
  uploadSupportAttachment: uploadSupportAttachmentMock,
}))
vi.mock('@/lib/app-toast', () => ({ appToast: { requestError: requestErrorMock, error: toastErrorMock } }))
vi.mock('@/lib/track', () => ({ trackEvent: vi.fn() }))
vi.mock('./use-support-events', () => ({ useSupportEvents: vi.fn() }))
vi.mock('./session-id', () => ({
  getOrCreateSupportSessionId: () => 'session-1',
  clearSupportSessionId: vi.fn(),
  peekSupportSessionId: () => localStorage.getItem('mg:cs_cid'),
  replaceSupportSessionId: (id: string | null) => {
    const next = id || `cs-local-${Math.random().toString(36).slice(2)}`
    localStorage.setItem('mg:cs_cid', next)
    return next
  },
}))

import { ModelGoApiError } from '@/lib/request'
import { useSupport } from './use-support'

describe('useSupport · 取消人工排队', () => {
  beforeEach(() => {
    authState.account = null
    authState.isLoading = true
    askSupportMock.mockReset()
    requestHandoffMock.mockReset().mockResolvedValue({
      service_mode: 'live',
      ticket_id: 'ticket-1',
      status: 'pending',
    })
    cancelHandoffMock.mockReset().mockResolvedValue(undefined)
    requestErrorMock.mockReset()
  })

  it('取消失败保留排队态，成功重试后恢复问答输入', async () => {
    const { result } = renderHook(() => useSupport())
    await act(async () => result.current.startHandoff())
    expect(result.current.mode.kind).toBe('queuing')

    cancelHandoffMock.mockRejectedValueOnce(new Error('cancel failed'))
    await act(async () => result.current.cancelActiveHandoff())
    expect(result.current.mode.kind).toBe('queuing')
    expect(result.current.isCancellingHandoff).toBe(false)
    expect(requestErrorMock).toHaveBeenCalledOnce()

    await act(async () => result.current.cancelActiveHandoff())
    expect(result.current.mode).toEqual({ kind: 'chat' })
    expect(result.current.showComposer).toBe(true)
  })

  it('同一工单的取消请求进行中时忽略重复点击', async () => {
    const { result } = renderHook(() => useSupport())
    await act(async () => result.current.startHandoff())
    let finishCancel: () => void = () => {}
    cancelHandoffMock.mockImplementationOnce(() => new Promise<void>((resolve) => { finishCancel = resolve }))

    let firstCancel: Promise<void> = Promise.resolve()
    await act(async () => {
      firstCancel = result.current.cancelActiveHandoff()
      await Promise.resolve()
      await result.current.cancelActiveHandoff()
      expect(cancelHandoffMock).toHaveBeenCalledOnce()
      finishCancel()
      await firstCancel
    })

    expect(result.current.mode.kind).toBe('chat')
  })
})

describe('useSupport · agent-detected human handoff', () => {
  beforeEach(() => {
    authState.account = { account_id: 'account-1' }
    authState.isLoading = false
    askSupportMock.mockReset()
    requestHandoffMock.mockReset().mockResolvedValue({ service_mode: 'live', ticket_id: 'ticket-1', status: 'pending' })
    requestErrorMock.mockReset()
  })

  it('hands off once when the answer explicitly identifies human_handoff, preserving the conversation', async () => {
    askSupportMock.mockResolvedValue({ answer: '正在为您转接', answer_status: 'intent', intent: 'human_handoff', suggest_handoff: true })
    const { result } = renderHook(() => useSupport())
    await act(async () => result.current.ask('帮我接个人工'))

    expect(askSupportMock).toHaveBeenCalledOnce()
    expect(requestHandoffMock).toHaveBeenCalledOnce()
    expect(result.current.mode.kind).toBe('queuing')
    expect(result.current.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'system'])
  })

  it('does not escalate a generic handoff suggestion or feedback intent', async () => {
    askSupportMock.mockResolvedValueOnce({ answer: '可转人工', answer_status: 'suggest_handoff', intent: 'general', suggest_handoff: true })
      .mockResolvedValueOnce({ answer: '请反馈', answer_status: 'intent', intent: 'feedback', suggest_handoff: true })
    const { result } = renderHook(() => useSupport())
    await act(async () => result.current.ask('这个问题能解决吗'))
    await act(async () => result.current.ask('我想反馈问题'))
    expect(requestHandoffMock).not.toHaveBeenCalled()
    expect(result.current.mode.kind).toBe('chat')
  })

  it('gates anonymous explicit handoff without creating a ticket', async () => {
    authState.account = null
    askSupportMock.mockResolvedValue({ answer: '请登录', answer_status: 'needs_login', intent: 'human_handoff' })
    const { result } = renderHook(() => useSupport())
    await act(async () => result.current.ask('我想联系真人'))
    expect(requestHandoffMock).not.toHaveBeenCalled()
    expect(result.current.messages.at(-1)?.content).toBe('common.customerService.loginRequired.handoff')
  })

  it('does not start a second handoff while the first request is pending', async () => {
    askSupportMock.mockResolvedValue({ answer: '马上转接', answer_status: 'intent', intent: 'human_handoff' })
    let release: (value: unknown) => void = () => {}
    requestHandoffMock.mockImplementation(() => new Promise((resolve) => { release = resolve }))
    const { result } = renderHook(() => useSupport())
    await act(async () => {
      const first = result.current.ask('帮我找真人客服')
      await Promise.resolve()
      await result.current.ask('再问一次')
      expect(requestHandoffMock).toHaveBeenCalledOnce()
      release({ service_mode: 'live', ticket_id: 'ticket-1', status: 'pending' })
      await first
    })
    expect(result.current.mode.kind).toBe('queuing')
  })

  it('uses the existing failure path and allows retry', async () => {
    askSupportMock.mockResolvedValue({ answer: '正在转接', answer_status: 'intent', intent: 'human_handoff' })
    requestHandoffMock.mockRejectedValueOnce(new Error('handoff failed'))
    const { result } = renderHook(() => useSupport())
    await act(async () => result.current.ask('真人帮忙'))
    expect(requestErrorMock).toHaveBeenCalledOnce()
    expect(result.current.mode.kind).toBe('chat')
    await act(async () => result.current.ask('还是需要真人'))
    expect(requestHandoffMock).toHaveBeenCalledTimes(2)
  })

  it('uses the existing async-ticket mode mapping', async () => {
    askSupportMock.mockResolvedValue({ answer: '转接中', answer_status: 'intent', intent: 'human_handoff' })
    requestHandoffMock.mockResolvedValue({ service_mode: 'async', ticket_id: 'ticket-2' })
    const { result } = renderHook(() => useSupport())
    await act(async () => result.current.ask('需要真人帮忙'))
    expect(requestHandoffMock).toHaveBeenCalledOnce()
    expect(result.current.mode.kind).toBe('chat')
  })

  it('discards a late answer after switching accounts without handing off as the new account', async () => {
    let resolveAsk: (value: unknown) => void = () => {}
    askSupportMock.mockImplementationOnce(() => new Promise((resolve) => { resolveAsk = resolve }))
    const { result, rerender } = renderHook(() => useSupport())
    let pending: Promise<void> = Promise.resolve()
    await act(async () => { pending = result.current.ask('帮我联系同事') })
    await act(async () => {
      authState.account = { account_id: 'account-2' }
      rerender()
    })
    await act(async () => {
      resolveAsk({ answer: '正在转接旧账号', answer_status: 'intent', intent: 'human_handoff' })
      await pending
    })
    expect(requestHandoffMock).not.toHaveBeenCalled()
    expect(result.current.messages).toEqual([])
    expect(result.current.isAsking).toBe(false)
  })

  it('includes the triggering question once in the handoff summary', async () => {
    askSupportMock.mockResolvedValue({ answer: '正在转接', answer_status: 'intent', intent: 'human_handoff' })
    const { result } = renderHook(() => useSupport())
    await act(async () => result.current.ask('请帮我联系值班同事'))
    const summary = requestHandoffMock.mock.calls[0][0].summary as string
    expect(summary.match(/请帮我联系值班同事/g)).toHaveLength(1)
    expect(result.current.messages.filter((message) => message.role === 'user')).toHaveLength(1)
  })

  it('does not include a sensitive triggering question in the handoff summary', async () => {
    askSupportMock.mockResolvedValue({ answer: '转接中', answer_status: 'intent', intent: 'human_handoff', sensitive: { Hit: true, Kind: 'secret' } })
    const { result } = renderHook(() => useSupport())
    await act(async () => result.current.ask('请处理我的 token: secret-value'))
    expect(requestHandoffMock).toHaveBeenCalledOnce()
    expect(requestHandoffMock.mock.calls[0][0].summary).not.toContain('secret-value')
  })

  it.each(['success', 'failure'])('ignores an old handoff %s after switching accounts without changing the new conversation', async (outcome) => {
    let resolveHandoff: (value: unknown) => void = () => {}
    let rejectHandoff: (reason: Error) => void = () => {}
    requestHandoffMock.mockImplementationOnce(() => new Promise((resolve, reject) => {
      resolveHandoff = resolve
      rejectHandoff = reject
    }))
    const { result, rerender } = renderHook(() => useSupport())
    let pending: Promise<void> = Promise.resolve()
    await act(async () => { pending = result.current.startHandoff() })
    expect(requestHandoffMock).toHaveBeenCalledOnce()

    await act(async () => {
      authState.account = { account_id: 'account-2' }
      rerender()
    })
    askSupportMock.mockResolvedValueOnce({ answer: '新账号回答', answer_status: 'answered' })
    await act(async () => {
      await result.current.ask('新账号的问题')
    })
    // Leave the new account in a recognizable chat state before the old request settles.
    expect(result.current.messages.map((message) => message.content)).toContain('新账号的问题')
    await act(async () => {
      if (outcome === 'success') resolveHandoff({ service_mode: 'live', ticket_id: 'old-ticket', status: 'pending' })
      else rejectHandoff(new Error('old account handoff failed'))
      await pending
    })
    expect(result.current.mode.kind).toBe('chat')
    expect(result.current.messages.some((message) => message.content.includes('handoff'))).toBe(false)
    expect(requestErrorMock).not.toHaveBeenCalled()
  })

  it('includes a direct regex handoff question once in the summary', async () => {
    const { result } = renderHook(() => useSupport())
    await act(async () => result.current.ask('转人工处理我的账单'))
    expect(askSupportMock).not.toHaveBeenCalled()
    const summary = requestHandoffMock.mock.calls[0][0].summary as string
    expect(summary.match(/转人工处理我的账单/g)).toHaveLength(1)
    expect(result.current.messages.filter((message) => message.role === 'user')).toHaveLength(1)
  })

  it('excludes a direct handoff question containing a token from the summary', async () => {
    const { result } = renderHook(() => useSupport())
    await act(async () => result.current.ask('转人工处理我的 token: secret-value'))
    expect(requestHandoffMock).toHaveBeenCalledOnce()
    expect(requestHandoffMock.mock.calls[0][0].summary).not.toContain('secret-value')
  })

  it('does not create another handoff when a pending ask returns after manual handoff succeeds', async () => {
    let resolveAsk: (value: unknown) => void = () => {}
    askSupportMock.mockImplementationOnce(() => new Promise((resolve) => { resolveAsk = resolve }))
    const { result } = renderHook(() => useSupport())
    let pending: Promise<void> = Promise.resolve()
    await act(async () => { pending = result.current.ask('能帮我处理吗') })
    await act(async () => result.current.startHandoff())
    expect(result.current.mode.kind).toBe('queuing')
    await act(async () => {
      resolveAsk({ answer: '正在转接', answer_status: 'intent', intent: 'human_handoff' })
      await pending
    })
    expect(requestHandoffMock).toHaveBeenCalledOnce()
    expect(result.current.mode.kind).toBe('queuing')
  })

  it('lets a new account start another handoff while the old request remains pending', async () => {
    let resolveOld: (value: unknown) => void = () => {}
    requestHandoffMock.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
    const { result, rerender } = renderHook(() => useSupport())
    let old: Promise<void> = Promise.resolve()
    await act(async () => { old = result.current.startHandoff() })
    await act(async () => {
      authState.account = { account_id: 'account-2' }
      rerender()
    })
    await act(async () => result.current.startHandoff())
    expect(requestHandoffMock).toHaveBeenCalledTimes(2)
    expect(result.current.mode).toMatchObject({ kind: 'queuing', ticketId: 'ticket-1' })
    await act(async () => {
      resolveOld({ service_mode: 'live', ticket_id: 'old-ticket', status: 'pending' })
      await old
    })
    expect(result.current.mode).toMatchObject({ kind: 'queuing', ticketId: 'ticket-1' })
  })

  it('releases an anonymous pending ask when login changes null to an account', async () => {
    authState.account = null
    let resolveAsk: (value: unknown) => void = () => {}
    askSupportMock.mockImplementationOnce(() => new Promise((resolve) => { resolveAsk = resolve }))
      .mockResolvedValueOnce({ answer: '新账号回答', answer_status: 'answered' })
    const { result, rerender } = renderHook(() => useSupport())
    let pending: Promise<void> = Promise.resolve()
    await act(async () => { pending = result.current.ask('匿名问题') })
    await act(async () => {
      authState.account = { account_id: 'account-2' }
      rerender()
    })
    expect(result.current.isAsking).toBe(false)
    expect(result.current.messages).toEqual([])
    await act(async () => result.current.ask('登录后的问题'))
    expect(askSupportMock).toHaveBeenCalledTimes(2)
    await act(async () => {
      resolveAsk({ answer: '迟到的匿名回答', answer_status: 'answered' })
      await pending
    })
    expect(result.current.messages.map((message) => message.content)).toEqual(['登录后的问题', '新账号回答'])
  })
})

describe('useSupport · 补充问题描述 (#1119)', () => {
  const detailOf = (id: string, canSupplement = true, version = 1) => ({
    ticket_id: id,
    version,
    ticket_type: 'feedback' as const,
    status: 'pending',
    created_at: '2026-09-24T08:00:00Z',
    updated_at: '2026-09-24T08:00:00Z',
    capabilities: { can_reopen: false, can_create_followup: false, can_supplement: canSupplement },
  })

  beforeEach(() => {
    authState.account = { account_id: 'acc-1' }
    authState.isLoading = false
    getSupportTicketMock.mockReset().mockImplementation(async (id: string) => detailOf(id))
    supplementTicketMock.mockReset()
    toastErrorMock.mockReset()
    requestErrorMock.mockReset()
  })

  async function openDetail(result: { current: ReturnType<typeof useSupport> }, id: string) {
    act(() => result.current.go({ kind: 'tickets' }))
    await act(async () => result.current.openTicketDetail(id))
  }

  it('a late supplement response for ticket A does not overwrite ticket B opened meanwhile', async () => {
    const { result } = renderHook(() => useSupport())
    await openDetail(result, 'FB-A')

    let finish: (v: unknown) => void = () => {}
    supplementTicketMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    let pending: Promise<string> = Promise.resolve('')
    act(() => { pending = result.current.supplementSelectedTicket('补充A') })

    await openDetail(result, 'FB-B')
    expect(result.current.ticketDetail?.ticket_id).toBe('FB-B')

    await act(async () => {
      finish({ ...detailOf('FB-A'), supplements: [{ id: 'sup_FB-A_0', content: '补充A', created_at: '2026-09-24T08:01:00Z' }] })
      expect(await pending).toBe('ok')
    })
    expect(result.current.ticketDetail?.ticket_id).toBe('FB-B')
  })

  const apiError = (msg: string, code = 40001) => new ModelGoApiError({ code, msg } as ConstructorParameters<typeof ModelGoApiError>[0])
  // 线上真实形状（2026-09-24 test 实测）：agent 的 4001 经 web-api 包成 40001，机器码在 field_errors 里
  const wrappedError = (supportCode: string) => new ModelGoApiError({
    code: 40001,
    msg: 'request validation failed',
    data: { field_errors: [{ field: '_root', message: supportCode }] },
  } as ConstructorParameters<typeof ModelGoApiError>[0])

  it.each([
    ['wrapped by web-api into field_errors', () => wrappedError('support.invalid_transition')],
    ['as the raw msg', () => apiError('support.invalid_transition')],
  ])('invalid_transition (%s) on a now-closed ticket: refreshes, says so, and reports closed', async (_shape, makeError) => {
    const { result } = renderHook(() => useSupport())
    await openDetail(result, 'FB-A')

    supplementTicketMock.mockRejectedValueOnce(makeError())
    getSupportTicketMock.mockResolvedValueOnce(detailOf('FB-A', false))
    let outcome: string = ''
    await act(async () => { outcome = await result.current.supplementSelectedTicket('补充A') })

    expect(outcome).toBe('closed')
    expect(toastErrorMock).toHaveBeenCalledWith('common.customerService.ticket.supplementClosed')
    expect(requestErrorMock).not.toHaveBeenCalled()
    expect(result.current.ticketDetail?.capabilities.can_supplement).toBe(false)
  })

  it('other failures keep the request-error path and refresh in the background', async () => {
    const { result } = renderHook(() => useSupport())
    await openDetail(result, 'FB-A')
    getSupportTicketMock.mockClear()

    const timeout = new Error('timeout of 30000ms exceeded')
    supplementTicketMock.mockRejectedValueOnce(timeout)
    let outcome: string = ''
    await act(async () => { outcome = await result.current.supplementSelectedTicket('补充A') })

    expect(outcome).toBe('failed')
    expect(requestErrorMock).toHaveBeenCalledWith(timeout, 'common.customerService.ticket.supplementFailed')
    expect(toastErrorMock).not.toHaveBeenCalled()
    // 超时的 POST 可能已写入：刷新一次，让那条补充出现在列表里
    expect(getSupportTicketMock).toHaveBeenCalledWith('FB-A')
  })

  it('a failure that lands after leaving the ticket shows nothing', async () => {
    const { result } = renderHook(() => useSupport())
    await openDetail(result, 'FB-A')

    let fail: (e: unknown) => void = () => {}
    supplementTicketMock.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject }))
    let pending: Promise<string> = Promise.resolve('')
    act(() => { pending = result.current.supplementSelectedTicket('补充A') })
    act(() => result.current.go({ kind: 'tickets' }))

    await act(async () => {
      fail(new Error('network'))
      expect(await pending).toBe('failed')
    })
    expect(requestErrorMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it('a late background refresh does not undo the retry that succeeded meanwhile', async () => {
    const { result } = renderHook(() => useSupport())
    await openDetail(result, 'FB-A')

    // 第一次：超时失败，后台刷新挂起（读到的是写入前的旧详情）
    let finishRefresh: (v: unknown) => void = () => {}
    supplementTicketMock.mockRejectedValueOnce(new Error('timeout of 30000ms exceeded'))
    getSupportTicketMock.mockImplementationOnce(() => new Promise((resolve) => { finishRefresh = resolve }))
    await act(async () => { await result.current.supplementSelectedTicket('补充A') })

    // 第二次：重试成功
    const withSupplement = { ...detailOf('FB-A', true, 2), supplements: [{ id: 'sup_FB-A_0', content: '补充A', created_at: '2026-09-24T08:01:00Z' }] }
    supplementTicketMock.mockResolvedValueOnce(withSupplement)
    await act(async () => { await result.current.supplementSelectedTicket('补充A') })
    expect(result.current.ticketDetail?.supplements).toHaveLength(1)

    // 旧刷新这时才回来，不能把刚补上的那条抹掉
    await act(async () => { finishRefresh(detailOf('FB-A', true, 1)) })
    expect(result.current.ticketDetail?.supplements).toHaveLength(1)
  })

  it('leaving the ticket while the invalid_transition refresh is in flight shows nothing', async () => {
    const { result } = renderHook(() => useSupport())
    await openDetail(result, 'FB-A')

    let finishRefresh: (v: unknown) => void = () => {}
    supplementTicketMock.mockRejectedValueOnce(wrappedError('support.invalid_transition'))
    getSupportTicketMock.mockImplementationOnce(() => new Promise((resolve) => { finishRefresh = resolve }))
    let pending: Promise<string> = Promise.resolve('')
    await act(async () => { pending = result.current.supplementSelectedTicket('补充A') })
    act(() => result.current.go({ kind: 'tickets' }))

    await act(async () => {
      finishRefresh(detailOf('FB-A', false))
      expect(await pending).toBe('failed')
    })
    expect(toastErrorMock).not.toHaveBeenCalled()
    expect(requestErrorMock).not.toHaveBeenCalled()
  })

  it('other 4xx business codes show the PRD copy instead of the raw support.* code', async () => {
    const { result } = renderHook(() => useSupport())
    await openDetail(result, 'FB-A')

    supplementTicketMock.mockRejectedValueOnce(apiError('support.version_conflict'))
    let outcome = ''
    await act(async () => { outcome = await result.current.supplementSelectedTicket('补充A') })

    expect(outcome).toBe('failed')
    expect(toastErrorMock).toHaveBeenCalledWith('common.customerService.ticket.supplementFailed')
    expect(requestErrorMock).not.toHaveBeenCalled()
  })

  it('two supplement responses arriving out of order keep the newer ticket version', async () => {
    const { result } = renderHook(() => useSupport())
    await openDetail(result, 'FB-A')

    let finishFirst: (v: unknown) => void = () => {}
    supplementTicketMock.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve }))
    let first: Promise<string> = Promise.resolve('')
    act(() => { first = result.current.supplementSelectedTicket('补充A') })

    const two = [
      { id: 'sup_FB-A_0', content: '补充A', created_at: '2026-09-24T08:01:00Z' },
      { id: 'sup_FB-A_1', content: '补充B', created_at: '2026-09-24T08:01:05Z' },
    ]
    supplementTicketMock.mockResolvedValueOnce({ ...detailOf('FB-A', true, 3), supplements: two })
    await act(async () => { await result.current.supplementSelectedTicket('补充B') })

    await act(async () => {
      finishFirst({ ...detailOf('FB-A', true, 2), supplements: two.slice(0, 1) })
      await first
    })
    expect(result.current.ticketDetail?.supplements).toHaveLength(2)
  })

  it('40401 goes to requestError instead of being read as a support.* code', async () => {
    const { result } = renderHook(() => useSupport())
    await openDetail(result, 'FB-A')

    const notFound = apiError('support.ticket_not_found', 40401)
    supplementTicketMock.mockRejectedValueOnce(notFound)
    await act(async () => { await result.current.supplementSelectedTicket('补充A') })

    expect(requestErrorMock).toHaveBeenCalledWith(notFound, 'common.customerService.ticket.supplementFailed')
    expect(toastErrorMock).not.toHaveBeenCalled()
  })
})

describe('useSupport · 反馈附件上传与关联', () => {
  beforeEach(() => {
    authState.account = { account_id: 'account-1' }
    authState.isLoading = false
    uploadSupportAttachmentMock.mockReset()
    attachSupportTicketAttachmentMock.mockReset()
    submitSupportFeedbackMock.mockReset()
    requestErrorMock.mockReset()
  })

  it('有附件时先上传再关联到工单', async () => {
    uploadSupportAttachmentMock.mockResolvedValue({
      object_ref: 'oss://modelgo-public/experience/support/acc-1/a.png',
      file_name: 'a.png',
      mime_type: 'image/png',
      size_bytes: 3,
    })
    submitSupportFeedbackMock.mockResolvedValue({ ticket_id: 'FB-20260924-0001', status: 'pending', status_label: '等待客服受理' })
    attachSupportTicketAttachmentMock.mockResolvedValue(undefined)

    const { result } = renderHook(() => useSupport())
    const file = new File(['png'], 'a.png', { type: 'image/png' })
    let ok = false
    await act(async () => {
      ok = await result.current.submitFeedback({ category: 'bug', description: '上传的截图看不到' }, file)
    })

    expect(ok).toBe(true)
    expect(uploadSupportAttachmentMock).toHaveBeenCalledOnce()
    expect(attachSupportTicketAttachmentMock).toHaveBeenCalledWith(
      'FB-20260924-0001',
      expect.objectContaining({ object_ref: 'oss://modelgo-public/experience/support/acc-1/a.png', file_name: 'a.png', mime_type: 'image/png' }),
    )
  })

  it('附件上传失败则中止提交、不建单', async () => {
    uploadSupportAttachmentMock.mockRejectedValue(new Error('upload boom'))
    const { result } = renderHook(() => useSupport())
    let ok = true
    await act(async () => {
      ok = await result.current.submitFeedback({ category: 'bug', description: 'x' }, new File(['png'], 'a.png', { type: 'image/png' }))
    })
    expect(ok).toBe(false)
    expect(submitSupportFeedbackMock).not.toHaveBeenCalled()
    expect(requestErrorMock).toHaveBeenCalledOnce()
  })

  it('建单成功但关联失败时仍返回成功（回执照常）', async () => {
    uploadSupportAttachmentMock.mockResolvedValue({ object_ref: 'oss://bkt/x', file_name: 'a.png', mime_type: 'image/png', size_bytes: 3 })
    submitSupportFeedbackMock.mockResolvedValue({ ticket_id: 'FB-2', status: 'pending' })
    attachSupportTicketAttachmentMock.mockRejectedValue(new Error('attach boom'))

    const { result } = renderHook(() => useSupport())
    let ok = false
    await act(async () => {
      ok = await result.current.submitFeedback({ category: 'bug', description: 'x' }, new File(['png'], 'a.png', { type: 'image/png' }))
    })
    expect(ok).toBe(true)
    expect(requestErrorMock).toHaveBeenCalledOnce()
  })

  it('无附件时不触碰上传/关联', async () => {
    submitSupportFeedbackMock.mockResolvedValue({ ticket_id: 'FB-3', status: 'pending' })
    const { result } = renderHook(() => useSupport())
    await act(async () => {
      await result.current.submitFeedback({ category: 'bug', description: 'x' })
    })
    expect(uploadSupportAttachmentMock).not.toHaveBeenCalled()
    expect(attachSupportTicketAttachmentMock).not.toHaveBeenCalled()
  })

  it('建单响应没有工单号时跳过关联，不发畸形请求', async () => {
    uploadSupportAttachmentMock.mockResolvedValue({ object_ref: 'oss://bkt/x', file_name: 'a.png', mime_type: 'image/png', size_bytes: 3 })
    submitSupportFeedbackMock.mockResolvedValue({ status: 'pending' })
    const { result } = renderHook(() => useSupport())
    let ok = false
    await act(async () => {
      ok = await result.current.submitFeedback({ category: 'bug', description: 'x' }, new File(['png'], 'a.png', { type: 'image/png' }))
    })
    expect(ok).toBe(true)
    expect(attachSupportTicketAttachmentMock).not.toHaveBeenCalled()
    expect(requestErrorMock).not.toHaveBeenCalled()
  })
})

describe('useSupport · 服务记录已读 (#1154)', () => {
  beforeEach(() => {
    authState.account = { account_id: 'acc-1' }
    authState.isLoading = false
    markTicketReadMock.mockReset().mockResolvedValue({ unread_count: 0 })
    listTicketMessagesMock.mockReset().mockResolvedValue({ items: [], next_cursor: null, has_more: false })
    getSupportTicketMock.mockReset()
  })
  const base = {
    version: 1, status: 'processing', created_at: '2026-09-24T08:00:00Z', updated_at: '2026-09-24T08:00:00Z',
    latest_message_seq: 5, read_message_seq: 3, unread_count: 2,
    capabilities: { can_reopen: false, can_create_followup: false },
  }
  async function open(result: { current: ReturnType<typeof useSupport> }, id: string) {
    act(() => result.current.go({ kind: 'tickets' }))
    await act(async () => result.current.openTicketDetail(id))
  }

  it('marks a feedback ticket read up to its latest seq as soon as the detail opens', async () => {
    getSupportTicketMock.mockResolvedValue({ ...base, ticket_id: 'FB-1', ticket_type: 'feedback' })
    const { result } = renderHook(() => useSupport())
    await open(result, 'FB-1')
    await waitFor(() => expect(markTicketReadMock).toHaveBeenCalledWith('FB-1', 5))
    await waitFor(() => expect(result.current.ticketDetail?.unread_count).toBe(0))
  })

  it('does not mark an async human ticket read on open — only once the latest message is seen', async () => {
    getSupportTicketMock.mockResolvedValue({ ...base, ticket_id: 'CS-1', ticket_type: 'human_support', service_mode: 'async' })
    const { result } = renderHook(() => useSupport())
    await open(result, 'CS-1')
    expect(listTicketMessagesMock).toHaveBeenCalledWith('CS-1')
    expect(markTicketReadMock).not.toHaveBeenCalled()

    act(() => result.current.markSelectedTicketSeen())
    await waitFor(() => expect(markTicketReadMock).toHaveBeenCalledWith('CS-1', 5))
  })
})

describe('useSupport · 转异步详情回复 (#1152)', () => {
  beforeEach(() => {
    authState.account = { account_id: 'acc-1' }
    authState.isLoading = false
    getSupportTicketMock.mockReset().mockResolvedValue({
      ticket_id: 'CS-9', ticket_type: 'human_support', service_mode: 'async', status: 'processing', version: 2,
      created_at: '2026-09-28T03:00:00Z', updated_at: '2026-09-28T03:00:00Z',
      capabilities: { can_reopen: false, can_create_followup: false, can_reply: true },
    })
    listTicketMessagesMock.mockReset().mockResolvedValue({ items: [], next_cursor: null, has_more: false })
    // agent PostMessage 真实回包：UserReply 的输出，不是一条 SupportMessage
    replyTicketMessageMock.mockReset().mockResolvedValue({ ticket: { ticket_id: 'CS-9', version: 3 }, message: { id: 'srv-1', seq: 6 } })
  })

  it('shows what the user typed even though the reply response is a ticket+message wrapper', async () => {
    const { result } = renderHook(() => useSupport())
    act(() => result.current.go({ kind: 'tickets' }))
    await act(async () => result.current.openTicketDetail('CS-9'))
    // 发送后服务端列表还是空（模拟延迟一致），本地那条必须带着内容留在屏上
    listTicketMessagesMock.mockResolvedValue({ items: [], next_cursor: null, has_more: false })
    await act(async () => { expect(await result.current.replySelectedTicket('还是 429')).toBe(true) })
    expect(result.current.ticketMessages.at(-1)).toMatchObject({ role: 'user', content: '还是 429' })
  })
})

describe('useSupport · 实时人工被客服结束 (#1134)', () => {
  beforeEach(() => {
    authState.account = { account_id: 'acc-1' }
    authState.isLoading = false
    requestHandoffMock.mockReset().mockResolvedValue({ service_mode: 'live', ticket_id: 'CS-LIVE', status: 'pending' })
    getSupportTicketMock.mockReset()
  })

  it('enters the ended state with a rating card when the backend keeps service_mode=live but status=resolved', async () => {
    const { useSupportEvents } = await import('./use-support-events')
    const pushEvent = async () => {
      const cb = vi.mocked(useSupportEvents).mock.calls.at(-1)![2]
      await act(async () => { await cb({ events: [{ id: 'e', ticket_id: 'CS-LIVE', version: 9, type: 'x' }] }) })
    }
    const base = { ticket_id: 'CS-LIVE', ticket_type: 'human_support', service_mode: 'live', version: 1, created_at: '', updated_at: '', capabilities: { can_reopen: false, can_create_followup: false } }
    const { result } = renderHook(() => useSupport())
    await act(async () => result.current.startHandoff())
    expect(result.current.mode.kind).toBe('queuing')

    getSupportTicketMock.mockResolvedValue({ ...base, status: 'processing', assignee_display_name: '王恩博' })
    await pushEvent()
    expect(result.current.mode.kind).toBe('human')

    // 2026-09-28 test 实测：客服 resolve 后 service_mode 仍是 live
    getSupportTicketMock.mockResolvedValue({ ...base, status: 'resolved', status_label: '已解决', assignee_display_name: '王恩博' })
    await pushEvent()
    expect(result.current.mode.kind).toBe('humanEnded')
    expect(result.current.messages.some((m) => m.kind === 'rating_card' && m.ratingCard?.ticketId === 'CS-LIVE')).toBe(true)
  })
})

describe('useSupport · 新会话', () => {
  beforeEach(() => {
    authState.account = { account_id: 'acc-1' }
    authState.isLoading = false
    localStorage.setItem('mg:cs_cid', 'cs-old')
    createSessionMock.mockReset()
    askSupportMock.mockReset().mockResolvedValue({ answer_id: 'a1', answer: '旧会话的回答', status: 'answered' })
  })

  async function withOneMessage() {
    const { result } = renderHook(() => useSupport())
    await act(async () => { await result.current.ask('第一个问题') })
    expect(result.current.messages.length).toBeGreaterThan(0)
    return result
  }

  it('asks the backend for a new session (passing the old id), then clears the chat', async () => {
    createSessionMock.mockResolvedValue({ session_id: 'cs-from-server' })
    const result = await withOneMessage()
    await act(async () => result.current.startNewSession())
    expect(createSessionMock).toHaveBeenCalledWith('cs-old')
    expect(localStorage.getItem('mg:cs_cid')).toBe('cs-from-server')
    expect(result.current.messages).toEqual([])
    expect(result.current.mode.kind).toBe('chat')
  })

  it('falls back to a locally generated session id while the endpoint is not deployed (404)', async () => {
    createSessionMock.mockRejectedValue(Object.assign(new Error('nf'), { response: { status: 404 } }))
    const result = await withOneMessage()
    await act(async () => result.current.startNewSession())
    const id = localStorage.getItem('mg:cs_cid')
    expect(id).toMatch(/^cs-/)
    expect(id).not.toBe('cs-old')
    expect(result.current.messages).toEqual([])
    expect(requestErrorMock).not.toHaveBeenCalled()
  })

  it('keeps the conversation when the endpoint fails for another reason', async () => {
    createSessionMock.mockRejectedValue(Object.assign(new Error('down'), { response: { status: 503 } }))
    const result = await withOneMessage()
    const before = result.current.messages.length
    await act(async () => result.current.startNewSession())
    expect(localStorage.getItem('mg:cs_cid')).toBe('cs-old')
    expect(result.current.messages.length).toBe(before)
  })

  it('drops an answer that arrives after the reset instead of writing it into the new chat', async () => {
    createSessionMock.mockResolvedValue({ session_id: 'cs-new' })
    let finish: (v: unknown) => void = () => {}
    askSupportMock.mockImplementationOnce(() => new Promise((r) => { finish = r }))
    const { result } = renderHook(() => useSupport())
    act(() => { void result.current.ask('慢问题') })
    // 等转圈这一刻有一条用户消息在屏上
    await act(async () => {})
    await act(async () => result.current.startNewSession())
    await act(async () => { finish({ answer_id: 'late', answer: '迟到的回答', status: 'answered' }) })
    expect(result.current.messages.some((m) => m.content.includes('迟到的回答'))).toBe(false)
  })
})

describe('useSupport · 新会话不打断在途转人工（review 补审）', () => {
  beforeEach(() => {
    authState.account = { account_id: 'acc-1' }
    authState.isLoading = false
    localStorage.setItem('mg:cs_cid', 'cs-old')
    createSessionMock.mockReset().mockResolvedValue({ session_id: 'cs-new' })
    askSupportMock.mockReset().mockResolvedValue({ answer_id: 'a1', answer: '回答', status: 'answered' })
  })

  it('ignores 新会话 while a handoff request is in flight, so the handoff is neither orphaned nor blocked forever', async () => {
    let finishHandoff: (v: unknown) => void = () => {}
    requestHandoffMock.mockReset().mockImplementationOnce(() => new Promise((r) => { finishHandoff = r }))
    const { result } = renderHook(() => useSupport())
    await act(async () => { await result.current.ask('先问一句') })

    act(() => { void result.current.startHandoff() })
    await act(async () => result.current.startNewSession())
    // 在途转人工期间不换会话、不清对话
    expect(createSessionMock).not.toHaveBeenCalled()
    expect(localStorage.getItem('mg:cs_cid')).toBe('cs-old')
    expect(result.current.messages.length).toBeGreaterThan(0)

    await act(async () => { finishHandoff({ service_mode: 'live', ticket_id: 'CS-1', status: 'pending' }) })
    expect(result.current.mode.kind).toBe('queuing')
  })
})

it('reports the same read seq only once even if the response still says unread (no /read loop)', async () => {
  authState.account = { account_id: 'acc-1' }
  authState.isLoading = false
  markTicketReadMock.mockReset().mockResolvedValue({ unread_count: 2 }) // 异常回包：标完仍有未读
  listTicketMessagesMock.mockReset().mockResolvedValue({ items: [], next_cursor: null, has_more: false })
  getSupportTicketMock.mockReset().mockResolvedValue({
    ticket_id: 'CS-R', ticket_type: 'human_support', service_mode: 'async', status: 'processing', version: 1,
    latest_message_seq: 4, read_message_seq: 1, unread_count: 3, created_at: '', updated_at: '',
    capabilities: { can_reopen: false, can_create_followup: false },
  })
  const { result } = renderHook(() => useSupport())
  act(() => result.current.go({ kind: 'tickets' }))
  await act(async () => result.current.openTicketDetail('CS-R'))
  for (let i = 0; i < 3; i++) {
    await act(async () => { result.current.markSelectedTicketSeen() })
  }
  expect(markTicketReadMock).toHaveBeenCalledTimes(1)
})

it('reverse order: 转人工 while 新会话 is in flight is refused, then works once the new session is done (review 二审)', async () => {
  authState.account = { account_id: 'acc-1' }
  authState.isLoading = false
  localStorage.setItem('mg:cs_cid', 'cs-old')
  askSupportMock.mockReset().mockResolvedValue({ answer_id: 'a1', answer: '回答', status: 'answered' })
  let finishSession: (v: unknown) => void = () => {}
  createSessionMock.mockReset().mockImplementationOnce(() => new Promise((r) => { finishSession = r }))
  requestHandoffMock.mockReset().mockResolvedValue({ service_mode: 'live', ticket_id: 'CS-9', status: 'pending' })
  const { result } = renderHook(() => useSupport())
  await act(async () => { await result.current.ask('先问一句') })

  act(() => { void result.current.startNewSession() })
  await act(async () => { await result.current.startHandoff() })
  // 新会话在途：转人工不发出，不会产生孤儿单
  expect(requestHandoffMock).not.toHaveBeenCalled()

  await act(async () => { finishSession({ session_id: 'cs-new' }) })
  expect(localStorage.getItem('mg:cs_cid')).toBe('cs-new')
  // 新会话完成后转人工照常可用（旧写法这里会被永久锁死）
  await act(async () => { await result.current.startHandoff() })
  expect(requestHandoffMock).toHaveBeenCalledTimes(1)
  expect(result.current.mode.kind).toBe('queuing')
})

it('drops a new-session response that arrives after switching account, so B never inherits A’s session id (review 三审)', async () => {
  authState.account = { account_id: 'acc-A' }
  authState.isLoading = false
  localStorage.setItem('mg:cs_cid', 'cs-A-old')
  askSupportMock.mockReset().mockResolvedValue({ answer_id: 'a1', answer: '回答', status: 'answered' })
  let finishSession: (v: unknown) => void = () => {}
  createSessionMock.mockReset().mockImplementationOnce(() => new Promise((r) => { finishSession = r }))
  const { result, rerender } = renderHook(() => useSupport())
  await act(async () => { await result.current.ask('A 的问题') })
  act(() => { void result.current.startNewSession() })

  authState.account = { account_id: 'acc-B' }
  rerender()
  await act(async () => {})
  await act(async () => { finishSession({ session_id: 'cs-issued-for-A' }) })
  expect(localStorage.getItem('mg:cs_cid')).not.toBe('cs-issued-for-A')
})

it('a fast double click on 新会话 only calls the endpoint once', async () => {
  authState.account = { account_id: 'acc-1' }
  authState.isLoading = false
  askSupportMock.mockReset().mockResolvedValue({ answer_id: 'a1', answer: '回答', status: 'answered' })
  createSessionMock.mockReset().mockResolvedValue({ session_id: 'cs-x' })
  const { result } = renderHook(() => useSupport())
  await act(async () => { await result.current.ask('问一句') })
  await act(async () => { void result.current.startNewSession(); void result.current.startNewSession() })
  expect(createSessionMock).toHaveBeenCalledTimes(1)
})

it('A’s late new-session response does not release B’s in-flight new session (review 四审)', async () => {
  authState.account = { account_id: 'acc-A' }
  authState.isLoading = false
  askSupportMock.mockReset().mockResolvedValue({ answer_id: 'a1', answer: '回答', status: 'answered' })
  const finishers: ((v: unknown) => void)[] = []
  createSessionMock.mockReset().mockImplementation(() => new Promise((r) => { finishers.push(r) }))
  requestHandoffMock.mockReset().mockResolvedValue({ service_mode: 'live', ticket_id: 'CS-B', status: 'pending' })
  const { result, rerender } = renderHook(() => useSupport())
  await act(async () => { await result.current.ask('A 的问题') })
  act(() => { void result.current.startNewSession() })          // A 发起（finishers[0]）

  authState.account = { account_id: 'acc-B' }
  rerender(); await act(async () => {})
  await act(async () => { await result.current.ask('B 的问题') })
  act(() => { void result.current.startNewSession() })          // B 发起（finishers[1]）
  await act(async () => { finishers[0]({ session_id: 'cs-for-A' }) }) // A 晚到

  // B 的新会话仍在途：再点不重复发、转人工仍被挡
  await act(async () => { void result.current.startNewSession() })
  expect(createSessionMock).toHaveBeenCalledTimes(2)
  await act(async () => { await result.current.startHandoff() })
  expect(requestHandoffMock).not.toHaveBeenCalled()
  expect(result.current.startingNewSession).toBe(true)
})

// prd46#1171 —— 补审判定不阻塞发车、留待后续的 UI 项。判定口径：用户有没有得到反馈。
describe('prd46#1171 · 在途与切号不吞用户操作', () => {
  beforeEach(() => {
    authState.account = { account_id: 'acc-1' }
    authState.isLoading = false
    localStorage.setItem('mg:cs_cid', 'cs-old')
    requestErrorMock.mockReset()
    askSupportMock.mockReset().mockResolvedValue({ answer_id: 'a1', answer: '回答', status: 'answered' })
    requestHandoffMock.mockReset().mockResolvedValue({ service_mode: 'live', ticket_id: 'CS-7', status: 'pending' })
  })

  // #1171-1：在途时输入「转人工」原本静默 return —— 用户消息已上屏，入口却毫无反应
  it('在途时输入「转人工」给出系统提示，而不是静默丢弃', async () => {
    let finishSession: (v: unknown) => void = () => {}
    createSessionMock.mockReset().mockImplementationOnce(() => new Promise((r) => { finishSession = r }))
    const { result } = renderHook(() => useSupport())

    act(() => { void result.current.startNewSession() })
    await act(async () => { await result.current.ask('转人工') })

    expect(requestHandoffMock).not.toHaveBeenCalled()
    const roles = result.current.messages.map((m) => m.role)
    expect(roles).toContain('user')
    expect(result.current.messages.some((m) => m.content === 'common.customerService.handoffBusy')).toBe(true)
    await act(async () => { finishSession({ session_id: 'cs-new' }) })
  })

  // #1171-2：后端判定的 human_handoff 被新会话在途挡下，随后新会话失败 → 转人工彻底消失
  it('自动转人工被新会话挡下、且该新会话随后失败时，补出「请稍后重试转人工」', async () => {
    let rejectSession: (r: unknown) => void = () => {}
    createSessionMock.mockReset().mockImplementationOnce(() => new Promise((_r, rej) => { rejectSession = rej }))
    askSupportMock.mockReset().mockResolvedValue({
      answer_id: 'a2', answer: '正在为您转接', status: 'intent', intent: 'human_handoff', suggest_handoff: true,
    })
    const { result } = renderHook(() => useSupport())

    act(() => { void result.current.startNewSession() })
    await act(async () => { await result.current.ask('找人工') })
    // 在途被挡：只留系统提示，不发请求
    expect(requestHandoffMock).not.toHaveBeenCalled()
    expect(result.current.messages.some((m) => m.content === 'common.customerService.handoffBusy')).toBe(true)

    await act(async () => { rejectSession(Object.assign(new Error('down'), { response: { status: 503 } })) })
    expect(result.current.messages.some((m) => m.content === 'common.customerService.handoffRetryLater')).toBe(true)
  })

  // 同一个记账标记不能在成功路径上冒出来：新会话成功就没有「重试转人工」这回事
  it('新会话成功时不补重试提示（记账标记不得泄漏到下一次失败）', async () => {
    let finishSession: (v: unknown) => void = () => {}
    createSessionMock.mockReset().mockImplementationOnce(() => new Promise((r) => { finishSession = r }))
    askSupportMock.mockReset().mockResolvedValue({
      answer_id: 'a3', answer: '正在为您转接', status: 'intent', intent: 'human_handoff', suggest_handoff: true,
    })
    const { result } = renderHook(() => useSupport())

    act(() => { void result.current.startNewSession() })
    await act(async () => { await result.current.ask('找人工') })
    await act(async () => { finishSession({ session_id: 'cs-new' }) })
    expect(result.current.messages).toEqual([])

    // 紧接着再来一次失败的新会话：不得出现上一轮遗留的重试提示
    createSessionMock.mockRejectedValueOnce(Object.assign(new Error('down'), { response: { status: 503 } }))
    await act(async () => { void result.current.startNewSession() })
    expect(result.current.messages.some((m) => m.content === 'common.customerService.handoffRetryLater')).toBe(false)
  })

  // #1171-4：此前只覆盖了成功路径，切号 + 非 404 失败这一支没有用例
  it('切号后旧账号的新会话失败不弹 toast、不留提示', async () => {
    let rejectSession: (r: unknown) => void = () => {}
    createSessionMock.mockReset().mockImplementationOnce(() => new Promise((_r, rej) => { rejectSession = rej }))
    const { result, rerender } = renderHook(() => useSupport())
    await act(async () => { await result.current.ask('A 的问题') })
    act(() => { void result.current.startNewSession() })

    authState.account = { account_id: 'acc-B' }
    rerender(); await act(async () => {})
    await act(async () => { rejectSession(Object.assign(new Error('down'), { response: { status: 503 } })) })

    expect(requestErrorMock).not.toHaveBeenCalled()
    expect(result.current.messages.some((m) => m.content === 'common.customerService.handoffRetryLater')).toBe(false)
  })
})
