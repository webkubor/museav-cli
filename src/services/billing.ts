/**
 * 计费与交易（§十、§十一）
 * 路由：/billing、/billing/transactions
 * API：GET /tenants/:tenantId/balance、POST /tenants/:tenantId/recharges、POST /tenants/:tenantId/promo-codes/redeem、
 * GET /tenants/:tenantId/transactions、GET /tenants/:tenantId/billing/transactions、
 * POST /tenants/:tenantId/transactions/:id/refund、GET /tenants/:tenantId/transactions/:id/invoice
 */
import { get, post } from '@/lib/request'
import type {
  RechargeListParams,
} from '@/interfaces/billing'
import type {
  BalanceInfo,
  CreateRechargeRequest,
  CursorPage,
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
