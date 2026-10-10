/**
 * 首冲赠金报价的纯逻辑（prd46#1240）。
 *
 * 真值只认服务端报价，前端不算赠金、不写死比例：
 * - 接口不存在（后端未落地，404 / 40401）→ 'unavailable'，弹框退回普通充值，不展示任何赠金承诺
 * - 其他失败 → 'error'，展示重试，且不允许凭旧值下单
 * - 无资格 / 活动未生效 / 赠金为 0 → 不展示赠金
 */
import type { RechargeQuote } from '@/services/billing'

export type QuoteStatus = 'unavailable' | 'loading' | 'error' | 'ok'

/** 后端还没有报价接口：HTTP 404 或业务码 40401 */
export function isQuoteUnavailableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: unknown; response?: { status?: unknown } }
  return e.code === 40401 || e.response?.status === 404
}

export function quoteStatusOf(query: { isFetching: boolean; isError: boolean; error: unknown }): QuoteStatus {
  if (query.isError) return isQuoteUnavailableError(query.error) ? 'unavailable' : 'error'
  if (query.isFetching) return 'loading'
  return 'ok'
}

/** 报价是否真的带赠金：有资格 + 活动生效 + 赠金 > 0 */
export function hasBonus(quote: RechargeQuote | undefined): quote is RechargeQuote {
  return !!quote && quote.eligible && quote.activity_active && Number(quote.bonus_amount) > 0
}

/** 金额按数值比较（"500" 与 "500.00" 视为同一档） */
export function sameAmount(a: string, b: string): boolean {
  const x = Number(a)
  const y = Number(b)
  return Number.isFinite(x) && Number.isFinite(y) && x === y
}

export function findQuote(items: RechargeQuote[] | undefined, amount: string): RechargeQuote | undefined {
  return items?.find((q) => sameAmount(q.amount, amount))
}

/** 下单前复校验：资格、活动状态、赠金或到账任一变化，都要求用户重新确认 */
export function quoteChanged(shown: RechargeQuote | undefined, fresh: RechargeQuote | undefined): boolean {
  if (shown && fresh && (shown.eligible !== fresh.eligible || shown.activity_active !== fresh.activity_active)) return true
  const showBonus = hasBonus(shown)
  const freshBonus = hasBonus(fresh)
  if (showBonus !== freshBonus) return true
  if (!showBonus || !freshBonus) return false
  return !sameAmount(shown.bonus_amount, fresh.bonus_amount) || !sameAmount(shown.credited_total, fresh.credited_total)
}
