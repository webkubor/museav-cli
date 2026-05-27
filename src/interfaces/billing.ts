import type { QueryParams } from '@/types'

/** 充值订单列表查询参数 */
export interface RechargeListParams extends QueryParams {
  status?: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded'
  cursor?: string
  page_size?: number
}
