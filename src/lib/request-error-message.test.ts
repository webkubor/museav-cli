import { describe, expect, it } from 'vitest'
import { ModelGoApiError, SERVER_ERROR_MESSAGE } from '@/lib/request'
import { getRequestErrorMessage } from '@/lib/request-error-message'

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
})
