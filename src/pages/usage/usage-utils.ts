/**
 * 用量分析工具函数
 * 路由：/usage
 * API 来源：GET /usage/summary、GET /usage/series、GET /usage/rankings/*
 */

import type { DateRangeValue } from '@/components/ui/DateRangePicker'
import { densifyDailyBuckets as densifyDaily } from '@/lib/chart-buckets'
import { addFromNowISO, endOfLocalDayISO, nowISO, startOfLocalDayISO, userTimeZone } from '@/lib/datetime'

/** 用量趋势支持的指标类型。 */
export type Metric = 'spend' | 'requests' | 'tokens'

/** 用量页快捷时间范围对应天数。 */
export const USAGE_PRESET_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 }

function startOfMonthISO(offset: number) {
  const date = new Date()
  date.setMonth(date.getMonth() + offset, 1)
  date.setHours(0, 0, 0, 0)
  return date.toISOString()
}

function endOfMonthISO(offset: number) {
  const date = new Date()
  date.setMonth(date.getMonth() + offset + 1, 0)
  date.setHours(23, 59, 59, 999)
  return date.toISOString()
}

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

/** 格式化低金额均值，避免小额单次成本全部显示成 0。 */
export function formatAverageMoney(amount: number, symbol: string): string {
  if (!Number.isFinite(amount) || amount <= 0) return `${symbol}0.0000`
  const decimals = amount < 0.0001 ? 6 : 4
  return `${symbol}${amount.toFixed(decimals)}`
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

/** 直方图按天补齐缺失天（count=0）。见 @/lib/chart-buckets。 */
export function densifyDailyBuckets(
  buckets: { bucket_start: string; count: number }[],
  fromISO: string,
  toISO: string,
): { bucket_start: string; count: number }[] {
  return densifyDaily(buckets, fromISO, toISO, (bucket_start) => ({ bucket_start, count: 0 }))
}
