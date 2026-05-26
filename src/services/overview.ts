/**
 * Dashboard overview.
 * API: GET /tenants/:tenantId/overview/billing
 */
import { get } from '@/lib/request'
import type { BillingMoneyStatsParams } from '@/interfaces/overview'
import type { BillingMoneyStatsResponse } from '@/types'

/** 获取总览页金额类指标：可用余额、冻结余额、本月消费。 */
export function getBillingMoneyStats(tenantId: string, params?: BillingMoneyStatsParams) {
  return get<BillingMoneyStatsResponse>(`tenants/${tenantId}/overview/billing`, params)
}
