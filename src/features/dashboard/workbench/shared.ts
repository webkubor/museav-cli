/**
 * 工作台（总览）共享类型与工具
 * view: enterprise=企业视图（组织口径）| mine=我的视图（PRD 隐藏成员排行；数据 TODO account_id）
 * granularity: 趋势/明细的时间粒度
 */
export type WorkbenchView = 'enterprise' | 'mine'
export type Granularity = 'day' | 'month'
export type TrendMetric = 'requests' | 'spend' | 'tokens'

/**
 * 指标卡（总请求/总费用/总 Tokens）的统计区间，与卡片 hint 的「今日/本月」逐字对齐：
 * - day  → 今天 00:00（用户本地时区）→ 现在
 * - month→ 当月 1 日 00:00（用户本地时区）→ 现在
 * 与下方趋势图的 rangeForGranularity（30 天/12 个月的画图窗口）刻意不同——
 * 卡片是「当前周期累计」，趋势图是「多周期序列」，混用会让按天视图显示近 30 天总量。
 */
export function metricsRangeForGranularity(granularity: Granularity) {
  const to = new Date()
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  if (granularity === 'month') {
    from.setDate(1)
  }
  return { from: from.toISOString(), to: to.toISOString() }
}

/**
 * 趋势图/排行的取数窗口（画多周期序列用）：
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
