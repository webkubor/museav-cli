/**
 * 用量分析页查询层：汇总/趋势/排行六组查询 + 派生数据。
 * 路由：/usage
 * API 来源：GET /usage/summary、GET /usage/series、GET /usage/rankings/*
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getUsageSummary,
  getUsageSeries,
  getUsageRankingsModels,
  getUsageRankingsApiKeys,
  getUsageRankingsAccounts,
  getUsageRankingsWorkspaces,
} from '@/services/usage'
import { listWorkspaces } from '@/services/workspaces'
import type { SeriesDataPoint } from '@/types'
import { type Metric, densifyValueSeries } from './usage-utils'

export interface UsageQueryContext {
  activeTenantId: string | null
  commonParams: { from: string; to: string; workspace_id: string | undefined; account_id: string | undefined }
  rangeReady: boolean
  metric: Metric
  from: string
  to: string
}

export function useUsageQueries(ctx: UsageQueryContext) {
  const { activeTenantId, commonParams, rangeReady, metric, from, to } = ctx

  const workspacesQuery = useQuery({
    queryKey: ['workspaces-for-filter', activeTenantId],
    queryFn: () => listWorkspaces(),
    enabled: !!activeTenantId,
    staleTime: 5 * 60 * 1000,
  })
  const workspaceList = useMemo(() => workspacesQuery.data?.items ?? [], [workspacesQuery.data])

  const summaryQuery = useQuery({
    queryKey: ['usage-summary', activeTenantId, commonParams],
    queryFn: () => getUsageSummary(commonParams),
    enabled: !!activeTenantId && rangeReady,
  })

  const seriesQuery = useQuery({
    queryKey: ['usage-series', activeTenantId, commonParams, metric],
    queryFn: () => getUsageSeries({ ...commonParams, metric, granularity: 'day' }),
    enabled: !!activeTenantId && rangeReady,
  })

  const rankingsApiKeysQuery = useQuery({
    queryKey: ['usage-rankings-api-keys', activeTenantId, commonParams],
    queryFn: () => getUsageRankingsApiKeys({ ...commonParams, limit: 10 }),
    enabled: !!activeTenantId && rangeReady,
  })

  const rankingsModelsQuery = useQuery({
    queryKey: ['usage-rankings-models', activeTenantId, commonParams],
    queryFn: () => getUsageRankingsModels({ ...commonParams, limit: 10 }),
    enabled: !!activeTenantId && rangeReady,
  })

  const rankingsAccountsQuery = useQuery({
    queryKey: ['usage-rankings-accounts', activeTenantId, commonParams],
    queryFn: () => getUsageRankingsAccounts({ ...commonParams, limit: 10 }),
    enabled: !!activeTenantId && rangeReady,
  })

  const workspaceSourceQuery = useQuery({
    queryKey: ['usage-source-workspaces', activeTenantId, commonParams],
    queryFn: () => getUsageRankingsWorkspaces({ ...commonParams, limit: 10 }),
    enabled: !!activeTenantId && rangeReady,
  })

  const summary = summaryQuery.data

  const seriesData = useMemo<SeriesDataPoint[]>(() => {
    const points = seriesQuery.data?.groups?.[0]?.points
    if (!points) return []
    const mapped = points.map((point) => ({
      bucket_start: point.bucket_start,
      value: metric === 'spend'
        ? (point.spend?.amount ?? '0')
        : String(metric === 'requests' ? (point.requests ?? 0) : (point.tokens ?? 0)),
    }))
    // 按 from~to 补 0，让曲线覆盖整个所选区间（后端仅返回有数据的天）
    return densifyValueSeries(mapped, from, to)
  }, [metric, seriesQuery.data, from, to])

  return {
    workspacesQuery,
    workspaceList,
    summaryQuery,
    seriesQuery,
    rankingsApiKeysQuery,
    rankingsModelsQuery,
    rankingsAccountsQuery,
    workspaceSourceQuery,
    summary,
    seriesData,
  }
}
