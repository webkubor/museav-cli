/**
 * 图表按天数据补齐工具。
 *
 * 后端的 histogram / series 接口只返回「有数据的天」（稀疏），直接渲染会让
 * “近 N 天”图只画出有数据的那几根柱/点。本工具在 [from, to] 区间内按天补齐缺失的天，
 * 缺失天用 makeEmpty 生成 0 值，使分布与时间范围一致。
 *
 * 仅在确有数据时补齐；空数组原样返回（保留“暂无数据”空态）。
 * 仅适用于按天（day）粒度。
 */
export function densifyDailyBuckets<T extends { bucket_start: string }>(
  buckets: T[],
  fromISO: string,
  toISO: string,
  makeEmpty: (bucketStart: string) => T,
): T[] {
  if (!buckets.length) return buckets
  const byDay = new Map(buckets.map((b) => [b.bucket_start.slice(0, 10), b]))
  const from = new Date(fromISO)
  const to = new Date(toISO)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return buckets
  const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()))
  const out: T[] = []
  let guard = 0
  while (cur <= end && guard < 400) {
    const key = cur.toISOString().slice(0, 10)
    out.push(byDay.get(key) ?? makeEmpty(`${key}T00:00:00Z`))
    cur.setUTCDate(cur.getUTCDate() + 1)
    guard++
  }
  return out
}
