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

/** GET /tenants/:tenantId/balance/breakdown — 余额细分（cash/grant/rebate 三桶，#93） */
export function getBalanceBreakdown(tenantId: string): Promise<BalanceBreakdown> {
  return get<BalanceBreakdown>(`tenants/${tenantId}/balance/breakdown`)
}

// ─── 赠送明细 ─────────────────────────────────────

/** 单条赠金入账记录（grant 桶 journal，#93） */
export interface GiftRecord {
  id: string
  source: string
  amount: string
  currency: string
  credited_at: string
}

export interface GiftRecordsPage {
  items: GiftRecord[]
  page_size: number
  has_more: boolean
  next_cursor: string
}

/** GET /tenants/:tenantId/gift-records — 赠送明细（促销/注册等赠金入账） */
export function listGiftRecords(tenantId: string, params?: { cursor?: string; page_size?: number }) {
  return get<GiftRecordsPage>(`tenants/${tenantId}/gift-records`, params)
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
