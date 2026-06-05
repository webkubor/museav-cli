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

// ─── 排行榜 ───────────────────────────────────────

/** 排行榜单行（rank/score 为字符串，meta 为周期消费额） */
export interface RankingApiItem {
  rank: string
  name: string
  meta: string
  score: string
}

export interface RankingsResponse {
  /** 租户周期内模型调用量 Top3（真实 observer 聚合） */
  models: RankingApiItem[]
  /** 平台暂无 skills 数据源，恒为空数组——前端按空态隐藏卡片 */
  skills: RankingApiItem[]
}

/** GET /tenants/:tenantId/overview/rankings — Dashboard 排行榜（#98） */
export function getRankings(tenantId: string, period: '7d' | '30d' = '30d') {
  return get<RankingsResponse>(`tenants/${tenantId}/overview/rankings`, { period })
}
