/**
 * 计费与交易（§十、§十一）
 * 路由：/billing、/billing/transactions
 * API：GET /tenants/:tenantId/balance、POST /tenants/:tenantId/recharges、POST /tenants/:tenantId/promo-codes/redeem、
 * GET /tenants/:tenantId/transactions、GET /tenants/:tenantId/billing/transactions、
 * POST /tenants/:tenantId/transactions/:id/refund、GET /tenants/:tenantId/transactions/:id/invoice
 */
import { get, post } from '@/lib/request'
import type {
  BillingTransactionListParams,
  InvoiceUrlResponse,
  RechargeListParams,
  TransactionListParams,
} from '@/interfaces/billing'
import type {
  BalanceInfo,
  CreateRechargeRequest,
  CursorPage,
  RechargeCreated,
  RechargeOrder,
  RedeemPromoRequest,
  RedeemPromoResult,
  RefundRequest,
  TransactionItem,
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

// ─── 交易记录 ─────────────────────────────────────

/** 列出 tenant 交易记录 */
export function listTransactions(tenantId: string, params?: TransactionListParams) {
  return get<CursorPage<TransactionItem>>(`tenants/${tenantId}/transactions`, params)
}

/** 列出账单页专用流水：仅包含充值和主动退款，不混入模型用量扣费/预扣费。 */
export function listBillingTransactions(tenantId: string, params?: BillingTransactionListParams) {
  return get<CursorPage<TransactionItem>>(`tenants/${tenantId}/billing/transactions`, params)
}

/**
 * 申请退款（仅 type=recharge 且 refundable=true 的记录可申请，走人工审核）。
 */
export function requestRefund(tenantId: string, transactionId: string, body: RefundRequest) {
  return post<null>(`tenants/${tenantId}/transactions/${transactionId}/refund`, body)
}

/**
 * 获取发票（302 重定向到 PDF，或返回 { invoice_url }）。
 * 前端可直接用 `window.open` 打开返回的 URL。
 */
export function getInvoiceUrl(
  tenantId: string,
  transactionId: string
): Promise<InvoiceUrlResponse> {
  return get<InvoiceUrlResponse>(`tenants/${tenantId}/transactions/${transactionId}/invoice`)
}
