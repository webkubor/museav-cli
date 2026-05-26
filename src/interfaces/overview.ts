import type { QueryParams } from '@/types'

export interface BillingMoneyStatsParams extends QueryParams {
  from?: string
  to?: string
}
