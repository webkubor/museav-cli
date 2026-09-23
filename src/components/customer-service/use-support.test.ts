/**
 * 客服浮层交接状态回归测试。
 * 路由：全站客服浮层
 * API：POST /support/handoff、POST /support/handoff/cancel
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { askSupportMock, requestHandoffMock, cancelHandoffMock, requestErrorMock, authState } = vi.hoisted(() => ({
  askSupportMock: vi.fn(),
  requestHandoffMock: vi.fn(),
  cancelHandoffMock: vi.fn(),
  requestErrorMock: vi.fn(),
  authState: { account: null as null | { account_id: string }, isLoading: true },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/store/auth', () => ({
  useAuthStore: (selector: (state: typeof authState) => unknown) => selector(authState),
}))
vi.mock('@/services/support', () => ({
  askSupport: askSupportMock,
  cancelHandoff: cancelHandoffMock,
  endHandoff: vi.fn(),
  getSupportTicket: vi.fn(),
  listTicketMessages: vi.fn(),
  rateAnswer: vi.fn(),
  rateTicket: vi.fn(),
  replyTicketMessage: vi.fn(),
  reopenTicket: vi.fn(),
  requestHandoff: requestHandoffMock,
  submitSupportFeedback: vi.fn(),
}))
vi.mock('@/lib/app-toast', () => ({ appToast: { requestError: requestErrorMock } }))
vi.mock('@/lib/track', () => ({ trackEvent: vi.fn() }))
vi.mock('./use-support-events', () => ({ useSupportEvents: vi.fn() }))
vi.mock('./session-id', () => ({ getOrCreateSupportSessionId: () => 'session-1', clearSupportSessionId: vi.fn() }))

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
})
