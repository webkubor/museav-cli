import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ModelGoApiError } from '@/lib/request'
import { getServerErrorDiagnostics, reportHttpServerError, reportServerError } from '@/lib/error-diagnostics'

const { trackMock } = vi.hoisted(() => ({ trackMock: vi.fn() }))
vi.mock('@model-go/track', () => ({ track: trackMock, pageView: vi.fn() }))

describe('server error diagnostics', () => {
  it('extracts diagnostics from 5xx business errors', () => {
    const error = new ModelGoApiError({
      code: 50001,
      msg: 'panic: upstream nil pointer',
      request_id: 'req-123',
      trace_id: 'trace-abc',
      data: null,
    })
    error.path = 'POST /api/v1/api-keys'

    const diag = getServerErrorDiagnostics(error)
    expect(diag).not.toBeNull()
    expect(diag!.requestId).toBe('req-123')
    expect(diag!.traceId).toBe('trace-abc')
    expect(diag!.code).toBe(50001)
    expect(diag!.path).toBe('POST /api/v1/api-keys')
    expect(diag!.version).toBeTruthy()
    expect(diag!.time).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('returns null for normal business errors', () => {
    const error = new ModelGoApiError({
      code: 40901,
      msg: '邮箱已注册',
      request_id: 'req-2',
      data: null,
    })
    expect(getServerErrorDiagnostics(error)).toBeNull()
  })

  it('extracts diagnostics from HTTP 5xx transport errors with response headers', () => {
    const error = Object.assign(new Error('Internal Server Error'), {
      response: {
        status: 502,
        headers: new Headers({ 'x-request-id': 'http-req-9' }),
      },
    })

    const diag = getServerErrorDiagnostics(error)
    expect(diag).not.toBeNull()
    expect(diag!.status).toBe(502)
    expect(diag!.requestId).toBe('http-req-9')
  })

  it('falls back to接口路径 from response.url when gateway 5xx has no request_id', () => {
    // 网关 503（如 PUT /api/v1/account/avatar）：无 x-request-id，但 response.url 有完整地址
    const error = Object.assign(new Error('Service Unavailable'), {
      response: {
        status: 503,
        url: 'http://localhost:5176/api/v1/account/avatar',
        headers: new Headers(),
      },
    })

    const diag = getServerErrorDiagnostics(error)
    expect(diag).not.toBeNull()
    expect(diag!.status).toBe(503)
    expect(diag!.requestId).toBeUndefined()
    expect(diag!.path).toBe('/api/v1/account/avatar')
  })

  it('returns null for non-5xx transport errors', () => {
    const error = Object.assign(new Error('Bad Request'), {
      response: { status: 400, headers: new Headers() },
    })
    expect(getServerErrorDiagnostics(error)).toBeNull()
  })

})

// 500 报错不再弹诊断弹窗给用户看，改成静默上报埋点（trackEvent → @model-go/track 的 track()）。
describe('silent server error reporting (no popup)', () => {
  beforeEach(() => {
    trackMock.mockClear()
  })

  it('reportServerError 把 5xxxx 业务码错误的诊断信息上报为 server_error:5xx 事件，不做任何 UI 弹出', () => {
    const error = new ModelGoApiError({
      code: 50001,
      msg: 'panic: upstream nil pointer',
      request_id: 'req-123',
      trace_id: 'trace-abc',
      data: null,
    })
    error.path = 'POST /api/v1/api-keys'

    reportServerError(error)

    expect(trackMock).toHaveBeenCalledTimes(1)
    const [event, data, top] = trackMock.mock.calls[0]
    expect(event).toBe('server_error:5xx')
    expect(data).toMatchObject({ request_id: 'req-123', trace_id: 'trace-abc', code: 50001, path: 'POST /api/v1/api-keys' })
    expect(top).toMatchObject({ result: 'fail', error_code: '50001' })
  })

  it('普通业务错误不触发上报', () => {
    const error = new ModelGoApiError({ code: 40901, msg: '邮箱已注册', request_id: 'req-2', data: null })
    reportServerError(error)
    expect(trackMock).not.toHaveBeenCalled()
  })

  it('reportHttpServerError 把网关级 HTTP 5xx 上报为同一个事件', () => {
    const response = new Response(null, { status: 503, headers: { 'x-request-id': 'http-req-9' } })
    reportHttpServerError(response)

    expect(trackMock).toHaveBeenCalledTimes(1)
    const [event, data, top] = trackMock.mock.calls[0]
    expect(event).toBe('server_error:5xx')
    expect(data).toMatchObject({ request_id: 'http-req-9', status: 503 })
    expect(top).toMatchObject({ result: 'fail', error_code: '503' })
  })

  it('非 5xx 的 HTTP 响应不触发上报', () => {
    const response = new Response(null, { status: 404 })
    reportHttpServerError(response)
    expect(trackMock).not.toHaveBeenCalled()
  })
})
