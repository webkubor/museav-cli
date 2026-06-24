import { describe, expect, it } from 'vitest'
import { ModelGoApiError } from '@/lib/request'
import { formatDiagnosticsForCopy, getServerErrorDiagnostics } from '@/lib/error-diagnostics'

describe('server error diagnostics', () => {
  it('extracts diagnostics from 5xx business errors', () => {
    const error = new ModelGoApiError({
      code: 50001,
      msg: 'panic: upstream nil pointer',
      request_id: 'req-123',
      trace_id: 'trace-abc',
      data: null,
    })
    error.path = 'v1/api-keys'

    const diag = getServerErrorDiagnostics(error)
    expect(diag).not.toBeNull()
    expect(diag!.requestId).toBe('req-123')
    expect(diag!.traceId).toBe('trace-abc')
    expect(diag!.code).toBe(50001)
    expect(diag!.path).toBe('v1/api-keys')
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

  it('returns null for non-5xx transport errors', () => {
    const error = Object.assign(new Error('Bad Request'), {
      response: { status: 400, headers: new Headers() },
    })
    expect(getServerErrorDiagnostics(error)).toBeNull()
  })

  it('formats a copyable block with ids, version and build', () => {
    const block = formatDiagnosticsForCopy({
      requestId: 'req-123',
      traceId: 'trace-abc',
      code: 50001,
      path: 'v1/api-keys',
      page: '/workspace/x/api-keys',
      version: '1.2.3',
      build: 'abc1234',
      time: '2026-06-24 10:00:00',
    })

    expect(block).toContain('请求 ID：req-123')
    expect(block).toContain('Trace ID：trace-abc')
    expect(block).toContain('错误码：50001')
    expect(block).toContain('接口：v1/api-keys')
    expect(block).toContain('版本：v1.2.3 (abc1234)')
    expect(block).toContain('时间：2026-06-24 10:00:00')
  })
})
