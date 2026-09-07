import type { CallLogItem } from '@/types'

/**
 * 缓存命中率（需求方#885）：口径 cache_read /(input + cache_read + cache_write)，
 * 与用量页 usage.Totals.cache_hit_rate 一致。后端 model-logs 详情暂未透传该字段
 * （test swagger logs.Row 无 cache_hit_rate），三个 token 字段齐全故前端按同一口径自算；
 * 后端补字段后改为直读，别两处各算一份。
 * 分母为 0（出图/语音等无 token 计量的调用）返回 null → 显「-」，不用 0% 冒充。
 */
export function cacheHitRate(row: CallLogItem): number | null {
  const { input_tokens: input, cache_read_tokens: read, cache_write_tokens: write } = row.usage
  const denominator = input + read + write
  if (denominator <= 0) return null
  return read / denominator
}

/**
 * 命中率展示：保留 1 位小数；无法计算（分母为 0）显「-」。
 * 缺失占位用半角 `-`，对齐 PRD §7 详情抽屉「字段缺失时展示「-」并避免误导」，
 * 也与同页 formatMaybeDuration / httpStatus 一致。
 */
export function cacheHitRateLabel(row: CallLogItem) {
  const rate = cacheHitRate(row)
  return rate === null ? '-' : `${(rate * 100).toFixed(1)}%`
}

/**
 * 缓存卡 hint 的 Token 量部分，三态照 PRD 原型 getLogDiagnosticMetrics 的缓存卡：
 * 读 > 0 → 读量；只写未读 → 写量；都没有 → 「未读取缓存」。
 * 别退化成只报读量——只写未读的调用会被说成什么都没发生。
 */
export function cacheTokenState(row: CallLogItem): { key: 'read' | 'write' | 'none'; count: number } {
  if (row.usage.cache_read_tokens > 0) return { key: 'read', count: row.usage.cache_read_tokens }
  if (row.usage.cache_write_tokens > 0) return { key: 'write', count: row.usage.cache_write_tokens }
  return { key: 'none', count: 0 }
}

/** 缓存卡只在后端明确回 cache_supported=true 时展示；false / 缺失一律隐藏（需求方#885）。 */
export function isCacheCardVisible(row: CallLogItem): boolean {
  return row.cache_supported === true
}
