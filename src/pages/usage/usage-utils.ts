import type { DateRangeValue } from '@/components/ui/DateRangePicker'
import { densifyDailyBuckets as densifyDaily } from '@/lib/chart-buckets'

export type Metric = 'spend' | 'requests' | 'tokens'

export const USAGE_PRESET_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 }

export function rangeToDates(range: DateRangeValue): { from: string; to: string } {
  const now = new Date()
  if (range.preset === 'custom' && range.startDate && range.endDate) {
    return {
      from: new Date(`${range.startDate}T00:00:00`).toISOString(),
      to: new Date(`${range.endDate}T23:59:59.999`).toISOString(),
    }
  }
  const days = USAGE_PRESET_DAYS[range.preset ?? '7d'] ?? 7
  return {
    from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString(),
    to: now.toISOString(),
  }
}

export function formatMoney(amount: string, symbol: string): string {
  const num = parseFloat(amount)
  if (isNaN(num)) return `${symbol}0.00`
  return `${symbol}${num.toFixed(4)}`
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/** 直方图按天补齐缺失天（count=0）。见 @/lib/chart-buckets。 */
export function densifyDailyBuckets(
  buckets: { bucket_start: string; count: number }[],
  fromISO: string,
  toISO: string,
): { bucket_start: string; count: number }[] {
  return densifyDaily(buckets, fromISO, toISO, (bucket_start) => ({ bucket_start, count: 0 }))
}
