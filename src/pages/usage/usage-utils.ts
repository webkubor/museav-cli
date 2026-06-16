import type { DateRangeValue } from '@/components/ui/DateRangePicker'

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

/**
 * 后端只返回有数据的天（稀疏），导致"近 N 天"直方图只画出几根柱。
 * 在 [from, to] 区间内按天补齐缺失的天（count=0），让分布与时间范围一致。
 * 仅在确有数据时补齐；完全无数据返回空数组以保留"暂无数据"空态。
 */
export function densifyDailyBuckets(
  buckets: { bucket_start: string; count: number }[],
  fromISO: string,
  toISO: string,
): { bucket_start: string; count: number }[] {
  if (!buckets.length) return []
  const byDay = new Map(buckets.map((b) => [b.bucket_start.slice(0, 10), b.count]))
  const from = new Date(fromISO)
  const to = new Date(toISO)
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return buckets
  const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()))
  const out: { bucket_start: string; count: number }[] = []
  let guard = 0
  while (cur <= end && guard < 400) {
    const key = cur.toISOString().slice(0, 10)
    out.push({ bucket_start: `${key}T00:00:00Z`, count: byDay.get(key) ?? 0 })
    cur.setUTCDate(cur.getUTCDate() + 1)
    guard++
  }
  return out
}
