import { describe, it, expect } from 'vitest'
import { resolveApiErrorDisplay, errorDisplayFields, cleanErrorMessage } from './model-experience-data'
import { ModelGoApiError } from '@/lib/request'

/** qa#549 真实载荷：国际站图片生成，Azure 内容安全拒绝（400），外层码曾误分类为 40031 */
function makeAzureRejection(code: number, msg: string) {
  return new ModelGoApiError({
    code,
    msg,
    request_id: 'f31951e5-b46c-4963-9f73-adc1c0505e80',
    trace_id: 'b13d9c3ce5fa9431fe11223b74a12232',
    data: {
      field_errors: [
        {
          field: 'upstream',
          message:
            '[BadRequestError] Your request was rejected by the safety system. If you believe this is an error, contact us at Azure support ticket and include the request ID 9d05e829-54c4-402d-89b4-eb97a2c0a147. (request_id: chatimagegen-13566ddeba714ca3b4c66801dc3ea013)',
        },
      ],
    },
  })
}

describe('resolveApiErrorDisplay', () => {
  it('40033（其他 4xx，确定性失败）：主文案用外层 msg，不可重试，上游原文降级为详情', () => {
    const err = makeAzureRejection(40033, '请求内容被上游安全策略拒绝，请修改后重试')
    const display = resolveApiErrorDisplay(err)
    expect(display.message).toBe('请求内容被上游安全策略拒绝，请修改后重试')
    expect(display.retryable).toBe(false)
    expect(display.upstreamDetail).toContain('BadRequestError')
    expect(display.upstreamDetail).toContain('Azure support ticket')
    expect(display.requestId).toBe('f31951e5-b46c-4963-9f73-adc1c0505e80')
    expect(display.traceId).toBe('b13d9c3ce5fa9431fe11223b74a12232')
  })

  it('40301（策略/权限拒绝）：同样不可重试', () => {
    const err = makeAzureRejection(40301, '无权限调用该模型')
    expect(resolveApiErrorDisplay(err).retryable).toBe(false)
  })

  it('40032（响应形状不合法）：不可重试', () => {
    const err = makeAzureRejection(40032, '上游响应格式异常')
    expect(resolveApiErrorDisplay(err).retryable).toBe(false)
  })

  it('40031（5xx/传输失败）：可重试，这是唯一"重试可能成功"的档', () => {
    const err = makeAzureRejection(40031, '上游服务暂时不可用，请稍后重试')
    const display = resolveApiErrorDisplay(err)
    expect(display.message).toBe('上游服务暂时不可用，请稍后重试')
    expect(display.retryable).toBe(true)
  })

  it('未知/旧格式错误码：走历史兜底链路，默认按可重试处理（不改变既有行为）', () => {
    const err = new ModelGoApiError({ code: 50012, msg: 'internal error', data: null })
    const display = resolveApiErrorDisplay(err)
    expect(display.retryable).toBe(true)
  })

  it('异步视频轮询终态：message.error 是纯字符串（当前 Swagger 无独立 code 字段），走 cleanErrorMessage 兜底、按可重试处理', () => {
    const display = resolveApiErrorDisplay('rate limit exceeded, please retry')
    expect(display.message).toBe(cleanErrorMessage('rate limit exceeded, please retry'))
    expect(display.retryable).toBe(true)
  })

  it('未来后端把 code 编码进持久化字符串（JSON）时，能识别出确定性失败并禁用重试', () => {
    const stored = JSON.stringify({ code: 40033, msg: '请求内容被上游安全策略拒绝，请修改后重试', request_id: 'req-1' })
    const display = resolveApiErrorDisplay(stored)
    expect(display.retryable).toBe(false)
    expect(display.message).toBe('请求内容被上游安全策略拒绝，请修改后重试')
  })

  it('undefined/空错误：不抛异常，退回发送失败兜底文案', () => {
    expect(resolveApiErrorDisplay(undefined).message).toBe(cleanErrorMessage(undefined))
  })
})

describe('errorDisplayFields', () => {
  it('把 ApiErrorDisplay 摊成 ExperienceMessage 的错误字段', () => {
    const err = makeAzureRejection(40033, '请求内容被上游安全策略拒绝，请修改后重试')
    const fields = errorDisplayFields(resolveApiErrorDisplay(err))
    expect(fields).toEqual({
      error: '请求内容被上游安全策略拒绝，请修改后重试',
      errorDetail: expect.stringContaining('BadRequestError'),
      errorRetryable: false,
      errorRequestId: 'f31951e5-b46c-4963-9f73-adc1c0505e80',
      errorTraceId: 'b13d9c3ce5fa9431fe11223b74a12232',
    })
  })
})
