/**
 * 免费模型门槛错误码识别（需求方 #833 场景一/三，后端 note 15550 的两个码）。
 * 三种到达形状都要认得：带数字码的 ModelGoApiError、SSE 非 2xx 只剩文本的 Error、
 * web-api 归类外层码 + 上游原文塞在 field_errors 里；同时钉住「不是门槛错误就返回 null」。
 */
import { describe, expect, it } from 'vitest'
import { ModelGoApiError } from '@/lib/request'
import { detectFreeModelGate } from './free-model-gate'

describe('detectFreeModelGate（#833）', () => {
  it('数字码 4291 → 日限额；4032 → 余额门槛', () => {
    expect(detectFreeModelGate(new ModelGoApiError({ code: 4291, msg: '今日免费调用已达上限' }))).toBe('daily_limit')
    expect(detectFreeModelGate(new ModelGoApiError({ code: 4032, msg: '余额不足' }))).toBe('balance_required')
  })

  it('SSE 非 2xx 只剩文本：原因串在 message 里也能认出（下划线与空格写法同判）', () => {
    expect(detectFreeModelGate(new Error('free_model_daily_limit_reached'))).toBe('daily_limit')
    expect(detectFreeModelGate(new Error('Free model daily limit reached (1000/day)'))).toBe('daily_limit')
    expect(detectFreeModelGate(new Error('free_model_balance_required'))).toBe('balance_required')
  })

  it('网关原样透传的两句固定英文人话（web-api 不包信封、metadata.reason 已丢）也能认出', () => {
    expect(detectFreeModelGate(new Error("today's free-model quota has been reached; please try again after midnight Beijing time or switch to another model"))).toBe('daily_limit')
    expect(detectFreeModelGate(new Error('this free model requires the account to keep available balance above zero; please top up to continue'))).toBe('balance_required')
    // #1091：网关文案若改为点明主余额，仍能认出
    expect(detectFreeModelGate(new Error('this free model requires the account to keep main balance above zero; please top up to continue'))).toBe('balance_required')
  })

  it('网关整段信封被当成字符串（历史消息 error 摘录）时按 metadata.reason 判', () => {
    const body = JSON.stringify({ error: { code: 429, message: 'quota exceeded', metadata: { reason: 'free_model_daily_limit_reached', app_error_id: 4291 } } })
    expect(detectFreeModelGate(body)).toBe('daily_limit')
  })

  it('web-api 归类外层码 40033 + 上游原文塞在 field_errors 里', () => {
    const err = new ModelGoApiError({
      code: 40033,
      msg: '模型调用被拒绝',
      data: { field_errors: [{ field: 'model', message: '{"code":4291,"type":"free_model_daily_limit_reached"}' }] },
    })
    expect(detectFreeModelGate(err)).toBe('daily_limit')
  })

  it('持久化的信封字符串（历史消息 error 字段）也按数字码判', () => {
    expect(detectFreeModelGate(JSON.stringify({ code: 4291, msg: 'limit' }))).toBe('daily_limit')
  })

  it('无关错误一律 null：#914 的限频 429、上游 5xx、普通网络错误、空值', () => {
    expect(detectFreeModelGate(new ModelGoApiError({ code: 42901, msg: 'rate_limit exceeded' }))).toBeNull()
    expect(detectFreeModelGate(new ModelGoApiError({ code: 40031, msg: '上游服务暂不可用' }))).toBeNull()
    expect(detectFreeModelGate(new Error('HTTP 502'))).toBeNull()
    expect(detectFreeModelGate(null)).toBeNull()
    expect(detectFreeModelGate(undefined)).toBeNull()
  })

  it('#1091 收窄识别串后的反例：同样以「the account」开头但与余额无关的错误人话不误判', () => {
    expect(detectFreeModelGate(new Error('please verify the account identity before continuing'))).toBeNull()
    expect(detectFreeModelGate(new Error('the account has been suspended pending review'))).toBeNull()
  })
})
