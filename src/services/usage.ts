/**
 * 用量分析（§十二）
 * 路由：/usage
 * API：GET /usage/summary、GET /usage/series
 */
import { get } from '@/lib/request'
import type { UsageSeriesParams, UsageSummaryParams } from '@/interfaces/usage'
import type { UsageSeries, UsageSummary } from '@/types'

/** 获取用量汇总指标（三卡 + 可选分组） */
export function getUsageSummary(params?: UsageSummaryParams) {
  return get<UsageSummary>('usage/summary', params)
}

/** 获取用量时间序列（图表数据） */
export function getUsageSeries(params?: UsageSeriesParams) {
  return get<UsageSeries>('usage/series', params)
}
