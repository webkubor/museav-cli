import type { Money } from './account'

export interface BalanceInfo {
  balance: Money
  reserved: Money
  available: Money
  low_balance_threshold: Money
}

export interface BillingMoneyStatsResponse {
  available_balance: Money
  frozen_balance: Money
  monthly_spend: Money
}

export interface CreateRechargeRequest {
  amount: string
  currency: string
  channel: 'alipay' | 'wechat' | 'stripe'
  return_url?: string
  promo_code?: string
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
