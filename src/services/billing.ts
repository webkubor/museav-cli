/**
 * 计费与交易（§十、§十一）
 * 路由：/billing
 * API：GET /tenants/:tenantId/balance、GET|POST /tenants/:tenantId/recharges、
 * GET /tenants/:tenantId/recharges/:orderNo、POST /tenants/:tenantId/recharges/:orderNo/cancel、
 * POST /tenants/:tenantId/promo-codes/redeem
 */
import { get, post } from '@/lib/request'
import type {
  RechargeListParams,
} from '@/interfaces/billing'
import type {
  BalanceInfo,
  CreateRechargeRequest,
  CursorPage,
  Money,
  RechargeCreated,
  RechargeOrder,
  RedeemPromoRequest,
  RedeemPromoResult,
} from '@/types'

// ─── 余额 ─────────────────────────────────────────

/** 查询 tenant 余额（含 reserved / available / low_balance_threshold） */
export function getBalance(tenantId: string) {
  return get<BalanceInfo>(`tenants/${tenantId}/balance`)
}

/** 余额细分：主余额 / 赠送余额 / 奖励余额（账单页三卡 + 模型体验免费额度复用） */
export interface BalanceBreakdown {
  main: Money
  gift: Money
  reward: Money
}

/**
 * GET /tenants/:tenantId/balance/breakdown — 余额细分。
 * ⚠️ 后端 balance 接口暂未细分该三项：DEV 返回占位值，后端补全后移除 isMock 分支。
 */
export function getBalanceBreakdown(tenantId: string): Promise<BalanceBreakdown> {
  if (import.meta.env.DEV) {
    return Promise.resolve({
      main: { amount: '1250.50', currency: 'CNY' },
      gift: { amount: '220.00', currency: 'CNY' },
      reward: { amount: '1420.00', currency: 'CNY' },
    })
  }
  return get<BalanceBreakdown>(`tenants/${tenantId}/balance/breakdown`)
}

// ─── 充值订单 ─────────────────────────────────────

/** 创建充值订单（支付宝 / 微信 / Stripe） */
export function createRecharge(tenantId: string, body: CreateRechargeRequest) {
  return post<RechargeCreated>(`tenants/${tenantId}/recharges`, body)
}

/** 查询单个充值订单详情 */
export function getRecharge(tenantId: string, orderNo: string) {
  return get<RechargeOrder>(`tenants/${tenantId}/recharges/${orderNo}`)
}

/** 列出充值订单 */
export function listRecharges(tenantId: string, params?: RechargeListParams) {
  return get<CursorPage<RechargeOrder>>(`tenants/${tenantId}/recharges`, params)
}

/** 取消未支付订单 */
export function cancelRecharge(tenantId: string, orderNo: string) {
  return post<null>(`tenants/${tenantId}/recharges/${orderNo}/cancel`, {})
}

// ─── Promo Code ───────────────────────────────────

/** 兑换 Promo Code（余额增加，返回兑换金额和余额变更后值） */
export function redeemPromoCode(tenantId: string, body: RedeemPromoRequest) {
  return post<RedeemPromoResult>(`tenants/${tenantId}/promo-codes/redeem`, body)
}
