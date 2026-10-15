import type { Money } from './account'

/**
 * 余额（GET /tenants/:id/balance）。
 *
 * ⚠️ 四个字段全部可选：真源是生成类型 `CreditsBalance`（generated-api-types.ts:
 * `available?: CreditsMoney` 等），后端对新租户/无余额场景会**整个字段不给**
 * （2026-10-15 prd46#1342：账单页 `balance.available.amount` 因此抛
 * `TypeError: Cannot read properties of undefined (reading 'amount')`，
 * 被 ErrorBoundary 兜成渲染报错）。这里写成必填会让 TS 放过这类访问。
 */
export interface BalanceInfo {
  balance?: Money
  reserved?: Money
  available?: Money
  low_balance_threshold?: Money
}

export interface BillingMoneyStatsResponse {
  available_balance: Money
  frozen_balance: Money
  monthly_spend: Money
}

export interface CreateRechargeRequest {
  amount: string
  currency: string
  channel: 'alipay' | 'wechat' | 'stripe' | 'stripe_wechat' | 'stripe_alipay'
  return_url?: string
  promo_code?: string
  /** 首冲赠金报价快照 id（prd46#1240 / #1237）；有报价时随单提交，后端按快照结算 */
  quote_id?: string
}

export interface RechargeCreated {
  order_no: string
  status: 'pending'
  payment: {
    channel: string
    qr_code_url?: string
    redirect_url?: string
  }
  expires_at: string
}

export interface RechargeOrder {
  order_no: string
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded'
  amount: string
  currency: string
  channel: string
  source?: string
  channel_label?: string
  promo_code: string | null
  credited_amount: string
  paid_at: string | null
  invoice_url: string | null
}

export interface RedeemPromoRequest {
  code: string
}

export interface RedeemPromoResult {
  credited: Money
  balance_after: Money
}
