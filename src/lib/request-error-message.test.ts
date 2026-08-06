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

    // SERVER_ERROR_MESSAGE 本身就是 i18n.t 的结果，跟自己比对不出"key 没翻译成功、
    // 原样吐回 key"这种回归——顺带断言真实译文，双重保险。
    expect(SERVER_ERROR_MESSAGE).toBe('服务暂时异常，请稍后再试')
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

    // SERVICE_UNAVAILABLE_MESSAGE 是 i18n key（供 tCommon 查表），不是译文本身——
    // 断言里再传一遍这个 key 会让"key 查不到、原样吐回 key"和"真的翻译成功"两种
    // 结果长得一样，测试就失去了意义（2026-08-06 common.json 嵌套 key 漏加前缀的
    // 回归就是被这种自证式断言放过的）。这里改成断言真实译文。
    expect(getRequestErrorMessage(error)).toBe('服务暂不可用，请稍后再试')
    expect(getRequestErrorMessage(error)).not.toBe(SERVICE_UNAVAILABLE_MESSAGE)
    expect(isNotFoundError(error)).toBe(true)
  })

  it('maps HTTP 404 to service-unavailable copy', () => {
    const error = Object.assign(new Error('Not Found'), {
      response: { status: 404 },
    })

    expect(getRequestErrorMessage(error)).toBe('服务暂不可用，请稍后再试')
    expect(getRequestErrorMessage(error)).not.toBe(SERVICE_UNAVAILABLE_MESSAGE)
    expect(isNotFoundError(error)).toBe(true)
  })
})
