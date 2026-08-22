/**
 * 用量分析工具函数
 * 路由：/usage
 * API 来源：GET /usage/summary、GET /usage/series、GET /usage/rankings/*
 */

import type { DateRangeValue } from '@/components/ui/DateRangePicker'
import { densifyDailyBuckets as densifyDaily } from '@/lib/chart-buckets'
import { addFromNowISO, endOfLocalDayISO, endOfMonthISO, nowISO, startOfLocalDayISO, startOfMonthISO, userTimeZone } from '@/lib/datetime'
import type { SeriesDataPoint } from '@/types'

/** 用量趋势支持的指标类型。 */
export type Metric = 'spend' | 'requests' | 'tokens'

/** 用量页快捷时间范围对应天数。 */
export const USAGE_PRESET_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 }

/**
 * /usage 认得的 `?time_range=` 预设值域 —— 深链参数的唯一真源（qa#617）。
 *
 * 提成常量是为了治本单的病根：总览的「查看更多」原先带的是 `granularity=day|month`，
 * 而本页从来只读 `time_range`，那个参数一路没人消费、也没有任何东西会报错，
 * 于是「总览切今日 → 落地页回落本月」这种口径不一致能一直躺着。
 *
 * 上游（总览 timeRangeForGranularity）的产出必须落在这个集合里，该约束由
 * `src/features/dashboard/workbench/shared.test.ts` 断言锁住 —— 只在测试层引用，
 * 不让 features 在运行时依赖 pages。往后加预设改这里一处即可。
 */
export const USAGE_TIME_RANGE_PRESETS = ['today', '7d', '30d', 'thisMonth', 'lastMonth'] as const
export type UsageTimeRangePreset = (typeof USAGE_TIME_RANGE_PRESETS)[number]

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: userTimeZone(),
    year: 'numeric',
  }).format(new Date())
}

/** 将日期选择器状态转换成后端接口需要的 ISO 时间范围。 */
export function rangeToDates(range: DateRangeValue): { from: string; to: string } {
  if (range.preset === 'custom' && range.startDate && range.endDate) {
    // 自定义区间：按用户显示时区取首日起点 ~ 末日终点
    return {
      from: startOfLocalDayISO(range.startDate),
      to: endOfLocalDayISO(range.endDate),
    }
  }
  if (range.preset === 'today') {
    return { from: startOfLocalDayISO(todayKey()), to: nowISO() }
  }
  if (range.preset === 'thisMonth') {
    return { from: startOfMonthISO(0), to: nowISO() }
  }
  if (range.preset === 'lastMonth') {
    return { from: startOfMonthISO(-1), to: endOfMonthISO(-1) }
  }
  const days = USAGE_PRESET_DAYS[range.preset ?? '7d'] ?? 7
  return {
    from: addFromNowISO(-days, 'day'),
    to: nowISO(),
  }
}

/** 金额格式化统一走 @/lib/utils（4 位小数 + 千分位 + 极小值「< symbol0.0001」）。 */
export { formatMoney } from '@/lib/utils'

/** 格式化数字为页面短展示。 */
export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/** 格式化百分比。 */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0.00%'
  return `${value.toFixed(2)}%`
}

/** 格式化毫秒延迟。 */
export function formatLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  return `${Math.round(ms)}ms`
}

/** 多序列趋势的分类色槽（对应 tokens.css --chart-cat-*，已过 dataviz 校验器），超出折叠成「其他」用灰。 */
export const CHART_CAT_COLORS = [
  'var(--chart-cat-1)',
  'var(--chart-cat-2)',
  'var(--chart-cat-3)',
  'var(--chart-cat-4)',
  'var(--chart-cat-5)',
  'var(--chart-cat-6)',
] as const
export const CHART_CAT_MAX = CHART_CAT_COLORS.length
export const CHART_OTHER_COLOR = 'var(--mg-text-4)'

/** 直方图按天补齐缺失天（count=0）。见 @/lib/chart-buckets。 */
export function densifyDailyBuckets(
  buckets: { bucket_start: string; count: number }[],
  fromISO: string,
  toISO: string,
): { bucket_start: string; count: number }[] {
  return densifyDaily(buckets, fromISO, toISO, (bucket_start) => ({ bucket_start, count: 0 }))
}

/** 趋势单序列按天补齐缺失天（value='0'），使曲线覆盖整个 from~to 区间。 */
export function densifyValueSeries(
  points: SeriesDataPoint[],
  fromISO: string,
  toISO: string,
): SeriesDataPoint[] {
  return densifyDaily(points, fromISO, toISO, (bucket_start) => ({ bucket_start, value: '0' }))
}
