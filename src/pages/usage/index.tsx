/**
 * 用量分析页
 * 路由：/usage
 * API 来源：GET /usage/summary、GET /usage/series、GET /usage/rankings/*、GET /logs/histogram
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { type DateRangeValue } from '@/components/ui/DateRangePicker'
import {
  getUsageSummary,
  getUsageSeries,
  getUsageRankingsModels,
  getUsageRankingsApiKeys,
  getUsageRankingsAccounts,
  getUsageRankingsWorkspaces,
} from '@/services/usage'
import { listWorkspaces } from '@/services/workspaces'
import { useAuthStore } from '@/store/auth'
import { useTenantRole } from '@/hooks/use-tenant-role'
import { SegmentedToggle } from '@/features/dashboard/workbench/SegmentedToggle'
import { useCurrency } from '@/hooks/use-platform-config'
import { trackPageView } from '@/lib/track'
import type { SeriesDataPoint, UsageRankingItem } from '@/types'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { LuActivity, LuBot, LuDatabase, LuKeyRound, LuRefreshCw, LuWallet, LuUsers } from 'react-icons/lu'
import {
  CostSourcePanel,
  type CostSourceSection,
  ApiKeyRankingPanel,
  ModelDistributionPanel,
  UsageStatCard,
} from './usage-panels'
import { MemberRankingPanel } from './member-ranking-panel'
import {
  type Metric,
  rangeToDates,
  formatMoney,
  formatNumber,
  CHART_CAT_COLORS,
  CHART_CAT_MAX,
  CHART_OTHER_COLOR,
} from './usage-utils'
import {
  Sparkline,
  MetricTab,
  GroupedAreaChart,
  type GroupedSeries,
  type GroupedRow,
} from './usage-charts'
import { UsageFilterPanel } from './usage-filters'

type UsageDimension = 'model' | 'member' | 'apiKey'
type TrendGroupBy = 'none' | 'model' | 'provider' | 'workspace'

/** 用量分析页面入口。 */
export default function UsagePage() {
  const { t } = useTranslation()
  const [timeRange, setTimeRange] = useState<DateRangeValue>({ preset: 'thisMonth' })
  const [metric, setMetric] = useState<Metric>('spend')
  const [filterWorkspaceId, setFilterWorkspaceId] = useState<string>('')

  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const currentAccountId = useAuthStore((s) => s.account?.account_id)
  // 用量统计是租户级页面：默认租户全量，仅受本页筛选器控制；不读工作空间选择器的
  // activeWorkspaceId（PRD §7.3：租户级页面不得被选择器过滤）。
  // 视图切换（对齐原型 + PRD §9）：默认按角色，Owner/Admin=企业视图，其余=我的视图；
  // 我的视图对 owner/admin 传 account_id=self（后端 #328 已支持透传）。
  const { canManage, isEnterprise, isSpaceOwner, ownedWorkspaceIds } = useTenantRole()
  // 从总览「查看更多」带来的上下文：?view= 初始化视图
  const [searchParams] = useSearchParams()
  const viewParam = searchParams.get('view')
  const dimensionParam = searchParams.get('dimension')
  const initialDimension: UsageDimension =
    dimensionParam === 'member' || dimensionParam === 'apiKey' || dimensionParam === 'model'
      ? dimensionParam
      : 'model'
  const [dimension, setDimension] = useState<UsageDimension>(initialDimension)
  // 趋势图分组维度（后端 /usage/series 的 group_by）：none=单条总量曲线，其余=多序列堆叠
  const [trendGroupBy, setTrendGroupBy] = useState<TrendGroupBy>('none')
  const [userView, setUserView] = useState<'enterprise' | 'mine' | 'space' | null>(
    viewParam === 'mine' || viewParam === 'enterprise' || viewParam === 'space' ? viewParam : null,
  )
  // 「空间视图」目前只支持单空间场景（#357 多空间合并裁剪参数待确认，暂不实现），
  // 负责多个空间时不渲染该切换档，避免猜参数硬发请求。
  const canUseSpaceView = isSpaceOwner && ownedWorkspaceIds.length === 1
  const showViewToggle = isEnterprise && canManage
  const showSpaceViewToggle = !showViewToggle && canUseSpaceView
  const view = userView ?? (showViewToggle ? 'enterprise' : canUseSpaceView ? 'space' : 'mine')
  const { symbol: currencySymbol } = useCurrency()

  useEffect(() => {
    trackPageView('usage')
  }, [])

  const usagePresets = [
    { key: 'today', label: t('usage.range.today') },
    { key: '7d', label: t('usage.range.7d') },
    { key: '30d', label: t('usage.range.30d') },
    { key: 'thisMonth', label: t('usage.range.thisMonth') },
    { key: 'lastMonth', label: t('usage.range.lastMonth') },
    { key: 'custom', label: t('usage.range.custom') },
  ]
  const metricLabels: Record<Metric, string> = {
    spend: t('usage.metric.spend'),
    requests: t('usage.metric.requests'),
    tokens: t('usage.metric.tokens'),
  }

  // rangeToDates 内部依赖当前时间，必须只在筛选变化时重算，避免 query key 抖动。
  const { from, to } = useMemo(() => rangeToDates(timeRange), [timeRange])
  const rangeReady = timeRange.preset !== 'custom' || (!!timeRange.startDate && !!timeRange.endDate)
  const scopedAccountId = view === 'mine' ? currentAccountId || undefined : undefined
  // 空间视图（单空间场景）：锁定该负责空间的全员数据，不传 account_id；覆盖手动的工作空间筛选。
  const scopedWorkspaceId = view === 'space' ? ownedWorkspaceIds[0] : filterWorkspaceId || undefined
  const commonParams = useMemo(() => ({
    from,
    to,
    workspace_id: scopedWorkspaceId,
    account_id: scopedAccountId,
  }), [scopedWorkspaceId, from, to, scopedAccountId])

  const workspacesQuery = useQuery({
    queryKey: ['workspaces-for-filter', activeTenantId],
    queryFn: () => listWorkspaces(),
    enabled: !!activeTenantId,
    staleTime: 5 * 60 * 1000,
  })
  const workspaceList = useMemo(() => workspacesQuery.data?.items ?? [], [workspacesQuery.data])

  function handleWorkspaceChange(val: string) {
    setFilterWorkspaceId(val === '__all__' ? '' : val)
  }

  const summaryQuery = useQuery({
    queryKey: ['usage-summary', activeTenantId, commonParams],
    queryFn: () => getUsageSummary(commonParams),
    enabled: !!activeTenantId && rangeReady,
  })

  const seriesQuery = useQuery({
    queryKey: ['usage-series', activeTenantId, commonParams, metric, trendGroupBy],
    queryFn: () => getUsageSeries({ ...commonParams, metric, granularity: 'day', group_by: trendGroupBy }),
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
    return points.map((point) => ({
      bucket_start: point.bucket_start,
      value: metric === 'spend'
        ? (point.spend?.amount ?? '0')
        : String(metric === 'requests' ? (point.requests ?? 0) : (point.tokens ?? 0)),
    }))
  }, [metric, seriesQuery.data])

  // 多序列趋势：把 series.groups 透视成 recharts 行 + 序列元数据。Top6 上色，其余折叠成「其他」。
  const groupedTrend = useMemo<{ rows: GroupedRow[]; series: GroupedSeries[] } | null>(() => {
    if (trendGroupBy === 'none') return null
    const groups = seriesQuery.data?.groups ?? []
    if (groups.length === 0) return { rows: [], series: [] }

    const pointValue = (p: { spend?: { amount?: string }; requests?: number; tokens?: number }) =>
      metric === 'spend' ? Number(p.spend?.amount ?? 0) : Number((metric === 'requests' ? p.requests : p.tokens) ?? 0)
    const groupTotal = (g: (typeof groups)[number]) =>
      metric === 'spend'
        ? Number(g.total?.spend?.amount ?? 0)
        : Number((metric === 'requests' ? g.total?.requests : g.total?.tokens) ?? 0)

    const nameById = new Map(workspaceList.map((w) => [w.workspace_id, w.name]))
    const labelOf = (g: (typeof groups)[number]) =>
      (trendGroupBy === 'workspace' ? nameById.get(g.key) : undefined) || g.label || g.key

    const sorted = [...groups].sort((a, b) => groupTotal(b) - groupTotal(a))
    const top = sorted.slice(0, CHART_CAT_MAX)
    const rest = sorted.slice(CHART_CAT_MAX)

    // dataKey 用合成键 s0/s1…，避免分组 key 含「.」被 recharts 当成嵌套路径
    const series: GroupedSeries[] = top.map((g, i) => ({ key: `s${i}`, label: labelOf(g), color: CHART_CAT_COLORS[i] }))
    const hasOther = rest.length > 0
    if (hasOther) series.push({ key: 'sOther', label: t('usage.chart.groupBy.other'), color: CHART_OTHER_COLOR })

    const valueByKeyBucket = new Map<string, Map<string, number>>()
    const bucketSet = new Set<string>()
    groups.forEach((g) => {
      const m = new Map<string, number>()
      g.points?.forEach((p) => {
        m.set(p.bucket_start, pointValue(p))
        bucketSet.add(p.bucket_start)
      })
      valueByKeyBucket.set(g.key, m)
    })
    const buckets = [...bucketSet].sort()

    const rows: GroupedRow[] = buckets.map((b) => {
      const row: GroupedRow = { bucket_start: b }
      top.forEach((g, i) => {
        row[`s${i}`] = valueByKeyBucket.get(g.key)?.get(b) ?? 0
      })
      if (hasOther) row.sOther = rest.reduce((sum, g) => sum + (valueByKeyBucket.get(g.key)?.get(b) ?? 0), 0)
      return row
    })
    return { rows, series }
  }, [trendGroupBy, seriesQuery.data, metric, workspaceList, t])

  const requestCount = summary?.total.requests ?? 0
  const totalSpend = summary ? formatMoney(summary.total.spend.amount, currencySymbol) : '—'
  const totalRequests = summary ? formatNumber(summary.total.requests) : '—'
  const totalTokens = summary ? formatNumber(summary.total.tokens) : '—'
  const averageLatency = summary?.total.average_latency_ms ? `${Math.round(summary.total.average_latency_ms)}ms` : '—'
  // 三大卡分解数据：成功/失败请求、Token 输入/输出/缓存 + 占比
  const failedRequests = summary ? Math.round(summary.total.requests * summary.total.error_rate) : 0
  const successRequests = requestCount - failedRequests
  const inputTokens = summary?.total.input_tokens ?? 0
  const outputTokens = summary?.total.output_tokens ?? 0
  const cacheTokens = (summary?.total.cache_read_tokens ?? 0) + (summary?.total.cache_write_tokens ?? 0)
  const tokensTotal = summary?.total.tokens ?? 0
  const reqPct = (n: number) => (requestCount > 0 ? (n / requestCount) * 100 : 0)
  const tokPct = (n: number) => (tokensTotal > 0 ? (n / tokensTotal) * 100 : 0)

  const workspaceSourceItems = useMemo<UsageRankingItem[]>(() => {
    const items = workspaceSourceQuery.data?.items ?? []
    // 排行端点的 name/key 可能是 workspace_id，用工作空间列表映射成可读名称
    const nameById = new Map(workspaceList.map((w) => [w.workspace_id, w.name]))
    const total = items.reduce((sum, it) => sum + parseFloat(it.spend?.amount || '0'), 0)
    return items.map((it, index) => {
      const amount = parseFloat(it.spend?.amount || '0')
      return {
        ...it,
        rank: it.rank ?? index + 1,
        name: nameById.get(it.key ?? '') || it.name || it.key,
        // 后端已给 share_percent 时直接用；缺省则按当前区间 spend 占比兜底
        share_percent:
          typeof it.share_percent === 'number' ? it.share_percent : total > 0 ? (amount / total) * 100 : undefined,
      }
    })
  }, [workspaceSourceQuery.data, workspaceList])

  const sourceSections: CostSourceSection[] = [
    {
      title: t('usage.sources.topWorkspace'),
      items: workspaceSourceItems,
      emptyLabel: t('usage.sources.empty'),
    },
    {
      title: t('usage.sources.topApiKey'),
      items: rankingsApiKeysQuery.data?.items ?? [],
      emptyLabel: t('usage.sources.empty'),
    },
    {
      title: t('usage.sources.topModel'),
      items: rankingsModelsQuery.data?.items ?? [],
      emptyLabel: t('usage.sources.empty'),
    },
  ]

  function refetchUsageData() {
    void summaryQuery.refetch()
    void seriesQuery.refetch()
    void rankingsApiKeysQuery.refetch()
    void rankingsModelsQuery.refetch()
    void rankingsAccountsQuery.refetch()
    void workspaceSourceQuery.refetch()
  }

  const dimensionButtons: Array<{ icon: ReactNode; label: string; value: UsageDimension }> = [
    { icon: <LuBot size={14} />, label: t('usage.dimension.model'), value: 'model' },
    { icon: <LuUsers size={14} />, label: t('usage.dimension.member'), value: 'member' },
    { icon: <LuKeyRound size={14} />, label: t('usage.dimension.apiKey'), value: 'apiKey' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('usage.title')}
        description={t('usage.desc')}
        actions={showViewToggle ? (
          <SegmentedToggle<'enterprise' | 'mine'>
            ariaLabel={t('dashboard.workbench.view.enterprise')}
            value={view === 'space' ? 'mine' : view}
            options={[
              { value: 'enterprise', label: t('dashboard.workbench.view.enterprise') },
              { value: 'mine', label: t('dashboard.workbench.view.mine') },
            ]}
            onChange={setUserView}
          />
        ) : showSpaceViewToggle ? (
          <SegmentedToggle<'space' | 'mine'>
            ariaLabel={t('dashboard.workbench.view.space')}
            value={view === 'enterprise' ? 'space' : view}
            options={[
              { value: 'space', label: t('dashboard.workbench.view.space') },
              { value: 'mine', label: t('dashboard.workbench.view.mine') },
            ]}
            onChange={setUserView}
          />
        ) : undefined}
      />

      {summaryQuery.isError && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-mg-danger/30 bg-mg-bg-0 px-4 py-3 text-sm text-mg-danger">
          {t('usage.error.summary')}
          <Button variant="outline" size="sm" onClick={() => summaryQuery.refetch()}>
            {t('usage.retry')}
          </Button>
        </div>
      )}

      <Card className="space-y-5 p-5 sm:p-6" id="usage-cost-overview">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="mg-text-title-sm font-bold text-mg-text-1">{t('usage.overview.title')}</h2>
            <p className="mg-text-caption text-mg-text-3">{t('usage.overview.desc')}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refetchUsageData}
            icon={<LuRefreshCw size={14} className={summaryQuery.isFetching || seriesQuery.isFetching ? 'animate-spin' : ''} />}
          >
            {t('usage.refresh')}
          </Button>
        </div>

        <UsageFilterPanel
          filterWorkspaceId={filterWorkspaceId}
          labels={{
            customRangePlaceholder: t('usage.customRange.placeholder'),
            time: t('usage.filter.time'),
            title: t('usage.filterPanel.title'),
            workspaces: t('usage.filter.allWorkspaces'),
          }}
          onTimeRangeChange={setTimeRange}
          onWorkspaceChange={handleWorkspaceChange}
          presets={usagePresets}
          timeRange={timeRange}
          workspaceList={workspaceList}
        />

        {/* 用量统计三大卡（对齐 PRD）：总费用/请求总量/总Tokens + 分解进度条 */}
        <div className="grid gap-4 md:grid-cols-3">
          <UsageStatCard
            icon={<LuWallet size={16} />}
            label={t('usage.summary.totalSpend')}
            value={totalSpend}
            suffix={currencySymbol === '¥' ? 'CNY' : undefined}
            loading={summaryQuery.isLoading}
            breakdownTitle={t('usage.summary.costStructure')}
            rows={[
              { label: t('usage.summary.inputCost'), value: '—', bar: false },
              { label: t('usage.summary.outputCost'), value: '—', bar: false },
              { label: t('usage.summary.cacheCost'), value: '—', bar: false },
            ]}
            pendingHint={t('usage.summary.costPending')}
          />
          <UsageStatCard
            icon={<LuActivity size={16} />}
            label={t('usage.summary.totalRequests')}
            value={totalRequests}
            loading={summaryQuery.isLoading}
            breakdownTitle={t('usage.summary.requestStatus')}
            rows={[
              { label: t('usage.summary.success'), value: formatNumber(successRequests), pct: reqPct(successRequests), variant: 'emerald' },
              { label: t('usage.summary.failed'), value: formatNumber(failedRequests), pct: reqPct(failedRequests), variant: 'amber' },
              { label: t('usage.summary.avgLatency'), value: averageLatency, bar: false },
            ]}
          />
          <UsageStatCard
            icon={<LuDatabase size={16} />}
            label={t('usage.summary.totalTokens')}
            value={totalTokens}
            loading={summaryQuery.isLoading}
            breakdownTitle={t('usage.summary.tokenUsage')}
            rows={[
              { label: t('usage.summary.inputTokens'), value: formatNumber(inputTokens), pct: tokPct(inputTokens), variant: 'emerald' },
              { label: t('usage.summary.outputTokens'), value: formatNumber(outputTokens), pct: tokPct(outputTokens), variant: 'amber' },
              { label: t('usage.summary.cacheTokens'), value: formatNumber(cacheTokens), pct: tokPct(cacheTokens), variant: 'blue' },
            ]}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="min-w-0 p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-mg-text-1">
                  {t('usage.chart.costTrend')}
                </div>
                <div className="mt-1 text-[12px] text-mg-text-3">{t('usage.chart.filteredAggregation')}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1 rounded-lg bg-mg-fill-0 p-1">
                  {(['none', 'model', 'provider', 'workspace'] as TrendGroupBy[]).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setTrendGroupBy(g)}
                      aria-pressed={trendGroupBy === g}
                      className={[
                        'rounded-md px-3 py-1.5 text-[13px] transition-colors',
                        trendGroupBy === g
                          ? 'bg-mg-bg-1 text-mg-text-1 font-semibold shadow-sm'
                          : 'text-mg-text-2 hover:text-mg-text-1',
                      ].join(' ')}
                    >
                      {t(`usage.chart.groupBy.${g}`)}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1 rounded-lg bg-mg-fill-0 p-1">
                  {(['spend', 'requests', 'tokens'] as Metric[]).map((item) => (
                    <MetricTab
                      key={item}
                      label={metricLabels[item]}
                      active={metric === item}
                      onClick={() => setMetric(item)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {seriesQuery.isError ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-center text-sm text-mg-danger">
                {t('usage.error.series')}
                <Button variant="outline" size="sm" onClick={() => seriesQuery.refetch()}>
                  {t('usage.retry')}
                </Button>
              </div>
            ) : seriesQuery.isLoading ? (
              <div className="flex h-[220px] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-mg-border border-t-brand-base" />
              </div>
            ) : groupedTrend ? (
              <GroupedAreaChart
                rows={groupedTrend.rows}
                series={groupedTrend.series}
                metric={metric}
                noDataLabel={t('usage.noData')}
                currencySymbol={currencySymbol}
                requestUnitLabel={t('usage.unit.requests')}
                tokenUnitLabel={t('usage.unit.tokens')}
              />
            ) : (
              <Sparkline
                data={seriesData}
                metric={metric}
                noDataLabel={t('usage.noData')}
                currencySymbol={currencySymbol}
                requestUnitLabel={t('usage.unit.requests')}
                tokenUnitLabel={t('usage.unit.tokens')}
              />
            )}
          </Card>

          <CostSourcePanel
            sections={sourceSections}
            currencySymbol={currencySymbol}
            isLoading={rankingsModelsQuery.isLoading || rankingsApiKeysQuery.isLoading || workspaceSourceQuery.isLoading}
            isError={rankingsModelsQuery.isError || rankingsApiKeysQuery.isError || workspaceSourceQuery.isError}
            onRetry={refetchUsageData}
          />
        </div>
      </Card>

      <Card className="space-y-5 p-5 sm:p-6" id="usage-breakdown">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="mg-text-title-sm font-bold text-mg-text-1">{t('usage.breakdown.title')}</h2>
            <p className="mg-text-caption text-mg-text-3">{t('usage.breakdown.desc')}</p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-lg border border-mg-border bg-mg-fill-0 p-1">
            {dimensionButtons.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setDimension(item.value)}
                className={[
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 mg-text-caption font-bold transition-colors',
                  dimension === item.value ? 'bg-mg-bg-0 text-brand-base shadow-sm' : 'text-mg-text-3 hover:text-mg-text-1',
                ].join(' ')}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {dimension === 'model' && (
          <ModelDistributionPanel
            items={rankingsModelsQuery.data?.items ?? []}
            isLoading={rankingsModelsQuery.isLoading}
            isError={rankingsModelsQuery.isError}
            onRetry={() => rankingsModelsQuery.refetch()}
            currencySymbol={currencySymbol}
          />
        )}
        {dimension === 'apiKey' && (
          <ApiKeyRankingPanel
            items={rankingsApiKeysQuery.data?.items ?? []}
            isLoading={rankingsApiKeysQuery.isLoading}
            isError={rankingsApiKeysQuery.isError}
            onRetry={() => rankingsApiKeysQuery.refetch()}
            currencySymbol={currencySymbol}
          />
        )}
        {dimension === 'member' && (
          <MemberRankingPanel
            items={rankingsAccountsQuery.data?.items ?? []}
            isLoading={rankingsAccountsQuery.isLoading}
            isError={rankingsAccountsQuery.isError}
            onRetry={() => rankingsAccountsQuery.refetch()}
            currencySymbol={currencySymbol}
          />
        )}
      </Card>
    </div>
  )
}
