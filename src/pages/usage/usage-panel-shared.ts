/**
 * 用量面板共享常量与工具函数。
 * 路由：/usage
 */

import type { UsageRankingItem } from '@/types'
import { formatMoney } from './usage-utils'

/** 排行卡折叠态 Top N，超出折叠成「其他」（PRD 原型 usageRankingDomain.USAGE_RANKING_COLLAPSED_COUNT=5）。 */
export const DIST_TOP_N = 5

/**
 * 饼图折叠态 Top N —— 比排行卡少一档，超出折叠成「其他」。
 * 原型 usageRankingDomain.buildUsageDistributionRows 取 rows.slice(0, 4)，需求方#666 截图
 * 也是「4 条 + 其他」（右侧排行才是 5 条 + 其他）。两处折叠数不同，别再共用一个常量。
 */
export const DONUT_TOP_N = 4

/** 排行卡展开态（#666 查看更多）本地分页每页行数。 */
export const DIST_PAGE_SIZE = 10

/** 分布排行行网格列模板（供 DistributionBarRow 使用）。 */
export const DIST_ROW_GRID = 'grid grid-cols-[minmax(130px,180px)_minmax(120px,1fr)_72px_46px] items-center gap-3'

export function displayRankingName(item: UsageRankingItem): string {
  return item.name || item.key || '—'
}

export function rankingSharePercent(item: UsageRankingItem): number {
  if (typeof item.share_percent !== 'number') return 0
  return Math.max(0, Math.min(100, item.share_percent))
}

export function spendAmount(item: UsageRankingItem): number {
  return parseFloat(item.spend?.amount || '0') || 0
}

export function formatRankingSpend(item: UsageRankingItem, currencySymbol: string): string {
  return item.spend?.amount ? formatMoney(item.spend.amount, currencySymbol) : '—'
}
