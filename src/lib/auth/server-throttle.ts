/**
 * 服务端限流/冷却提示的读取（shared/modelgo_prd#721）
 * 路由：/login、/signup、手机号登录
 * API 来源：任意鉴权接口的错误响应；判定与秒数**都来自服务端**
 */

import { ModelGoApiError } from '@/lib/request'

/** 服务端限流码（web-api apperror.CodeRateLimited）。 */
const RATE_LIMITED = 42901
/** 短信发送过于频繁（web-api apperror.CodeSMSTooFrequent）。 */
const SMS_TOO_FREQUENT = 42902

interface FieldError {
  field?: string
  message?: string
}

/**
 * throttleMessage 从错误里取出"该等多久"的提示，取不到就返回 null。
 *
 * 为什么由服务端说：这套冷却原本长在前端 localStorage 里（front-guard），对攻击者零作用
 * （换隐私窗口/清数据/直接打接口都绕过），却比服务端更严 —— 多出来的严格全落在真实用户头上。
 * 判定挪进风控模块之后，秒数由服务端算并随 details.retry_after 下发，前端只负责显示。
 *
 * 句子直接用服务端给的：它已经按 Accept-Language 渲染过（数字走 Param，中英都带秒数），
 * 前端再拼一遍就会出现两份需要同步的文案。
 */
export function throttleMessage(err: unknown): string | null {
  if (!(err instanceof ModelGoApiError)) return null
  if (err.code !== RATE_LIMITED && err.code !== SMS_TOO_FREQUENT) return null

  const data = err.data as { field_errors?: FieldError[] } | undefined
  const retryAfter = data?.field_errors?.find((f) => f.field === 'retry_after')
  if (retryAfter?.message) return retryAfter.message
  // 没给秒数时回落到 code 对应的消息 —— 不自己造一个数字：0 秒的倒计时比没有倒计时更糟。
  return err.rawMessage || null
}

/** isThrottled 只回答"这是不是被限流了"，用于分支（例如不要再把它记成密码错误）。 */
export function isThrottled(err: unknown): boolean {
  return err instanceof ModelGoApiError && (err.code === RATE_LIMITED || err.code === SMS_TOO_FREQUENT)
}
