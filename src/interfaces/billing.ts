import type { QueryParams, TransactionItem } from '@/types'

/** 充值订单列表查询参数 */
export interface RechargeListParams extends QueryParams {
  status?: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded'
  cursor?: string
  page_size?: number
}

/** 交易记录列表查询参数 */
export interface TransactionListParams extends QueryParams {
  /** recharge | consume | refund | adjust_credit | adjust_debit | promo */
  type?: TransactionItem['type']
  /** ISO 时间起止（最长 90 天区间） */
  from?: string
  to?: string
  cursor?: string
  page_size?: number
}

export interface BillingTransactionListParams extends QueryParams {
  /** ISO 时间起止（最长 90 天区间） */
  from?: string
  to?: string
  cursor?: string
  page_size?: number
}

export interface InvoiceUrlResponse {
  invoice_url: string
}
