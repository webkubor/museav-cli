import { describe, expect, it } from 'vitest'
import { ModelGoApiError, SERVER_ERROR_MESSAGE } from '@/lib/request'
import { getRequestErrorMessage, SERVICE_UNAVAILABLE_MESSAGE, isNotFoundError } from '@/lib/request-error-message'

describe('request error message', () => {
  it('hides backend 5xx business messages from users', () => {
    const error = new ModelGoApiError({
      code: 50001,
      msg: 'panic: upstream nil pointer',
      request_id: 'req_1',
      data: null,
    })

    expect(error.message).toBe(SERVER_ERROR_MESSAGE)
    expect(error.rawMessage).toBe('panic: upstream nil pointer')
    expect(getRequestErrorMessage(error)).toBe(SERVER_ERROR_MESSAGE)
  })

  it('keeps normal business errors readable', () => {
    const error = new ModelGoApiError({
      code: 40901,
      msg: '邮箱已注册',
      request_id: 'req_2',
      data: null,
    })

    expect(getRequestErrorMessage(error)).toContain('邮箱已注册')
  })

  it('hides HTTP 5xx transport errors from users', () => {
    const error = Object.assign(new Error('Internal Server Error'), {
      response: { status: 502 },
    })

    expect(getRequestErrorMessage(error)).toBe(SERVER_ERROR_MESSAGE)
  })

  it('maps 40401 (resource/route not found) to service-unavailable copy', () => {
    const error = new ModelGoApiError({
      code: 40401,
      msg: 'resource not found',
      request_id: 'req_3',
      data: null,
    })

    expect(getRequestErrorMessage(error)).toBe(SERVICE_UNAVAILABLE_MESSAGE)
    expect(isNotFoundError(error)).toBe(true)
  })

  it('maps HTTP 404 to service-unavailable copy', () => {
    const error = Object.assign(new Error('Not Found'), {
      response: { status: 404 },
    })

    expect(getRequestErrorMessage(error)).toBe(SERVICE_UNAVAILABLE_MESSAGE)
    expect(isNotFoundError(error)).toBe(true)
  })
})
