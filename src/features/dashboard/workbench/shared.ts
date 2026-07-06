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

/**
 * 上一等长区间（用于指标卡「较上期」涨跌对比）：
 * - day  → 再往前 30 天
 * - month→ 再往前 12 个月（当前区间之前的 12 个月）
 */
export function prevRangeForGranularity(granularity: Granularity) {
  const now = new Date()
  if (granularity === 'month') {
    const curFrom = new Date(now)
    curFrom.setMonth(curFrom.getMonth() - 11)
    curFrom.setDate(1)
    const to = new Date(curFrom)
    to.setDate(0) // 上一区间末 = 当前区间起点的前一天
    const from = new Date(curFrom)
    from.setMonth(from.getMonth() - 12)
    return { from: from.toISOString(), to: to.toISOString() }
  }
  const to = new Date(now)
  to.setDate(to.getDate() - 30)
  const from = new Date(now)
  from.setDate(from.getDate() - 59)
  return { from: from.toISOString(), to: to.toISOString() }
}

/** 涨跌百分比：上期为 0 或无效则返回 undefined（不显示徽章，避免除零/假数据） */
export function computeDelta(current?: number, previous?: number): { value: string; up: boolean } | undefined {
  if (current === undefined || previous === undefined) return undefined
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return undefined
  const pct = ((current - previous) / previous) * 100
  if (!Number.isFinite(pct)) return undefined
  return { value: `${Math.abs(pct).toFixed(1)}%`, up: pct >= 0 }
}

/** 大数缩写：1.2M / 3.4K / 56 */
export function abbreviateNumber(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return Math.round(n).toLocaleString()
}
