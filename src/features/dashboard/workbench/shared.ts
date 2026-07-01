/**
 * 工作台（总览）共享类型与工具
 * view: enterprise=企业视图（组织口径）| mine=我的视图（PRD 隐藏成员排行；数据 TODO account_id）
 * granularity: 趋势/明细的时间粒度
 */
export type WorkbenchView = 'enterprise' | 'mine'
export type Granularity = 'day' | 'month'
export type TrendMetric = 'requests' | 'spend' | 'tokens'

/**
 * 按粒度算查询区间：
 * - day  → 最近 30 天
 * - month→ 最近 12 个月（含当月）
 */
export function rangeForGranularity(granularity: Granularity) {
  const to = new Date()
  const from = new Date()
  if (granularity === 'month') {
    from.setMonth(from.getMonth() - 11)
    from.setDate(1)
  } else {
    from.setDate(from.getDate() - 29)
  }
  return { from: from.toISOString(), to: to.toISOString() }
}

/** 大数缩写：1.2M / 3.4K / 56 */
export function abbreviateNumber(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return Math.round(n).toLocaleString()
}
