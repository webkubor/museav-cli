import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  installGlobalClientErrorReporting,
  reportClientRenderError,
} from '@/lib/client-error-report'

const { trackMock } = vi.hoisted(() => ({ trackMock: vi.fn() }))
vi.mock('@model-go/track', () => ({ track: trackMock, pageView: vi.fn() }))

describe('reportClientRenderError', () => {
  beforeEach(() => {
    trackMock.mockClear()
  })

  it('上报为 client_error:render 事件，带上 message/stack/component_stack', () => {
    const error = new Error('boom')
    reportClientRenderError(error, 'in <Foo>\n  in <Bar>')

    expect(trackMock).toHaveBeenCalledTimes(1)
    const [event, data, top] = trackMock.mock.calls[0]
    expect(event).toBe('client_error:render')
    expect(data.message).toBe('boom')
    expect(data.stack).toContain('Error: boom')
    expect(data.component_stack).toBe('in <Foo>\n  in <Bar>')
    expect(top).toMatchObject({ result: 'fail' })
  })

  it('超长 message/stack 会被截断，避免单条事件过大', () => {
    const error = new Error('x'.repeat(2000))
    reportClientRenderError(error)

    const data = trackMock.mock.calls[0][1]
    expect(data.message.length).toBeLessThan(600)
    expect(data.message.endsWith('…[truncated]')).toBe(true)
  })
})

describe('installGlobalClientErrorReporting', () => {
  beforeEach(() => {
    trackMock.mockClear()
  })

  it('挂上 window.onerror 兜底，上报 client_error:uncaught', () => {
    installGlobalClientErrorReporting()

    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'uncaught boom',
        filename: 'app.js',
        lineno: 10,
        colno: 5,
      }),
    )

    expect(trackMock).toHaveBeenCalledTimes(1)
    const [event, data] = trackMock.mock.calls[0]
    expect(event).toBe('client_error:uncaught')
    expect(data).toMatchObject({ message: 'uncaught boom', source: 'app.js', line: 10, col: 5 })
  })

  it('跨域裸 "Script error." 无 filename 时丢弃，不产生噪音事件', () => {
    trackMock.mockClear()
    window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }))
    expect(trackMock).not.toHaveBeenCalled()
  })

  it('重复调用是幂等的，不会重复挂监听器', () => {
    trackMock.mockClear()
    installGlobalClientErrorReporting()
    installGlobalClientErrorReporting()

    window.dispatchEvent(new ErrorEvent('error', { message: 'once only', filename: 'a.js' }))
    expect(trackMock).toHaveBeenCalledTimes(1)
  })

  it('挂上 unhandledrejection 兜底，上报 client_error:rejection', () => {
    trackMock.mockClear()
    const event = new Event('unhandledrejection') as PromiseRejectionEvent & { reason: unknown }
    Object.defineProperty(event, 'reason', { value: new Error('rejected boom') })
    window.dispatchEvent(event)

    expect(trackMock).toHaveBeenCalledTimes(1)
    const [eventName, data] = trackMock.mock.calls[0]
    expect(eventName).toBe('client_error:rejection')
    expect(data.message).toBe('rejected boom')
  })
})
