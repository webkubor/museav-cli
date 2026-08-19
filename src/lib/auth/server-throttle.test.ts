import { describe, expect, it } from 'vitest'

import { ModelGoApiError } from '@/lib/request'
import { isThrottled, throttleMessage } from './server-throttle'

// 冷却的判定与秒数都来自服务端（shared/modelgo_prd#721）。前端只负责显示 —— 曾经它自己算，
// 存在 localStorage 里：对攻击者零作用（换隐私窗口/清数据/直接打接口都绕过），却比服务端更严。
function apiError(code: number, msg: string, fieldErrors?: unknown) {
  return new ModelGoApiError({
    code,
    msg,
    data: fieldErrors ? { field_errors: fieldErrors } : undefined,
  } as never)
}

describe('server-throttle (#721)', () => {
  it('优先用服务端给的 retry_after 句子（已按语言渲染，含秒数）', () => {
    const err = apiError(42901, '请求过于频繁', [
      { field: 'retry_after', message: '请 92 秒后再试' },
    ])
    expect(throttleMessage(err)).toBe('请 92 秒后再试')
  })

  it('服务端没给秒数时回落到它的消息，**不自己造数字**', () => {
    const err = apiError(42901, '请求过于频繁')
    expect(throttleMessage(err)).toBe('请求过于频繁')
  })

  it('短信发送过频也认（42902）', () => {
    const err = apiError(42902, '验证码发送太频繁', [
      { field: 'retry_after', message: '请 45 秒后再试' },
    ])
    expect(throttleMessage(err)).toBe('请 45 秒后再试')
  })

  it('不是限流的错误一律返回 null，别把密码错误说成"太频繁"', () => {
    expect(throttleMessage(apiError(40102, '邮箱或密码错误'))).toBeNull()
    expect(throttleMessage(new Error('boom'))).toBeNull()
    expect(throttleMessage(undefined)).toBeNull()
  })

  it('isThrottled 只回答是不是限流', () => {
    expect(isThrottled(apiError(42901, 'x'))).toBe(true)
    expect(isThrottled(apiError(40102, 'x'))).toBe(false)
  })
})
