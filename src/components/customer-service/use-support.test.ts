/**
 * 客服浮层交接状态回归测试。
 * 路由：全站客服浮层
 * API：POST /support/handoff、POST /support/handoff/cancel
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requestHandoffMock, cancelHandoffMock, requestErrorMock } = vi.hoisted(() => ({
  requestHandoffMock: vi.fn(),
  cancelHandoffMock: vi.fn(),
  requestErrorMock: vi.fn(),
}))

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/store/auth', () => ({
  useAuthStore: (selector: (state: { account: null; isLoading: boolean }) => unknown) => selector({ account: null, isLoading: true }),
}))
vi.mock('@/services/support', () => ({
  askSupport: vi.fn(),
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
