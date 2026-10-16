/**
 * 首冲赠金报价的纯逻辑（prd46#1240）。
 *
 * 真值只认服务端报价，前端不算赠金、不写死比例：
 * - 接口不存在（后端未落地，404 / 40401）→ 'unavailable'，弹框退回普通充值，不展示任何赠金承诺
 * - 其他失败 → 'error'，展示重试，且不允许凭旧值下单
 * - 无资格 / 活动未生效 / 赠金为 0 → 不展示赠金
 */
import type { RechargeQuote } from '@/services/billing'

/**
 * 推荐档位（只是快捷入口，赠金以服务端报价为准）。
 *
 * 两站面值完全一致，只有单位符号不同（¥ / $）——2026-10-12 与需求方确认：
 * PRD 原型 BillingRechargeModal（modelgo_prd）只给了一套面值且以 $ 渲染，
 * 产品拍板国内站沿用同一组数值，「单位不一样」。因此这里收敛成一份常量，
 * 币种符号由 formatMoney 的 currencySymbol 负责。
 *
 * #1260：两站最多 5 档，第 6 格固定为「自定义额度」。`.slice(0, 5)` 写在渲染与报价
 * 请求之前，两条路径共用同一个裁剪结果。
 *
 * 1380：导航角标也用这组档位取报价，queryKey 与弹框一致，命中同一份缓存。
 */
export const RECHARGE_PRESETS = ['0.5', '5', '10', '100', '500']

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

/** 下单时报价冲突（过期 / 资格或赠金已变 / 与金额不符）：后端 40912，data.quote 带最新报价（prd46#1238） */
export const QUOTE_CONFLICT_CODE = 40912

function isRechargeQuote(v: unknown): v is RechargeQuote {
  if (!v || typeof v !== 'object') return false
  const q = v as Record<string, unknown>
  return typeof q.amount === 'string' && typeof q.eligible === 'boolean' && typeof q.activity_active === 'boolean'
    && typeof q.bonus_amount === 'string' && typeof q.credited_total === 'string'
}

export function isQuoteConflictError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: unknown }).code === QUOTE_CONFLICT_CODE
}

/** 从 40912 的 data.quote 取最新报价；形状不对返回 undefined（调用方改为重新报价） */
export function quoteFromConflictError(err: unknown): RechargeQuote | undefined {
  if (!isQuoteConflictError(err)) return undefined
  const data = (err as { data?: unknown }).data
  const quote = data && typeof data === 'object' ? (data as { quote?: unknown }).quote : undefined
  return isRechargeQuote(quote) ? quote : undefined
}

/** 用最新报价替换同金额的旧项；列表里没有该金额时原样返回 */
export function replaceQuote(items: RechargeQuote[], quote: RechargeQuote): RechargeQuote[] {
  return items.map((q) => (sameAmount(q.amount, quote.amount) ? quote : q))
}
