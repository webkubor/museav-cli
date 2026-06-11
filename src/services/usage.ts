/**
 * 用量分析（§十二）
 * 路由：/usage
 * API：GET /usage/summary、/usage/series、/usage/rankings/*
 */
import { get } from '@/lib/request'
import type { UsageSeriesParams, UsageSummaryParams, UsageRankingsParams } from '@/interfaces/usage'
import type { UsageSeries, UsageSummary, UsageRankings } from '@/types'

export function getUsageSummary(params?: UsageSummaryParams) {
  return get<UsageSummary>('usage/summary', params)
}

export function getUsageSeries(params?: UsageSeriesParams) {
  return get<UsageSeries>('usage/series', params)
}

export function getUsageRankingsModels(params?: UsageRankingsParams) {
  return get<UsageRankings>('usage/rankings/models', params)
}

export function getUsageRankingsApiKeys(params?: UsageRankingsParams) {
  return get<UsageRankings>('usage/rankings/api-keys', params)
}
