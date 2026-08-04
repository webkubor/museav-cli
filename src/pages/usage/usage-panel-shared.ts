/**
 * 用量面板共享常量与工具函数。
 * 路由：/usage
 */

import type { UsageRankingItem } from '@/types'
import { formatMoney } from './usage-utils'

/** 分布图 Top N，超出折叠成「其他」。 */
export const DIST_TOP_N = 5

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
