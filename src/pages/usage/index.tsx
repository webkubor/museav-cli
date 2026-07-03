/**
 * 用量分析页
 * 路由：/usage
 * API 来源：GET /usage/summary、GET /usage/series、GET /usage/rankings/*、GET /logs/histogram
 */

import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { type DateRangeValue } from '@/components/ui/DateRangePicker'
import {
  getUsageSummary,
  getUsageSeries,
  getUsageRankingsModels,
  getUsageRankingsApiKeys,
} from '@/services/usage'
import { listWorkspaces } from '@/services/workspaces'
import { useAuthStore } from '@/store/auth'
import { useTenantRole } from '@/hooks/use-tenant-role'
import { SegmentedToggle } from '@/features/dashboard/workbench/SegmentedToggle'
import { useCurrency } from '@/hooks/use-platform-config'
import type { SeriesDataPoint, UsageRankingItem } from '@/types'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { LuActivity, LuBot, LuDatabase, LuGauge, LuKeyRound, LuRefreshCw, LuWallet, LuUsers } from 'react-icons/lu'
import {
  CostSourcePanel,
  type CostSourceSection,
  ApiKeyRankingPanel,
  ModelDistributionPanel,
} from './usage-panels'
import {
  type Metric,
  rangeToDates,
  formatMoney,
  formatNumber,
  formatAverageMoney,
} from './usage-utils'
import { Sparkline, MetricTab } from './usage-charts'
import { UsageFilterPanel } from './usage-filters'

type UsageDimension = 'model' | 'member' | 'apiKey'

/** 用量分析页面入口。 */
export default function UsagePage() {
  const { t } = useTranslation()
  const [timeRange, setTimeRange] = useState<DateRangeValue>({ preset: 'thisMonth' })
  const [metric, setMetric] = useState<Metric>('spend')
  const [dimension, setDimension] = useState<UsageDimension>('model')
  const [filterWorkspaceId, setFilterWorkspaceId] = useState<string>('')

  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const currentAccountId = useAuthStore((s) => s.account?.account_id)
  // 用量统计是租户级页面：默认租户全量，仅受本页筛选器控制；不读工作空间选择器的
  // activeWorkspaceId（PRD §7.3：租户级页面不得被选择器过滤）。
  // 视图切换（对齐原型 + PRD §9）：默认按角色，Owner/Admin=企业视图，其余=我的视图；
  // 我的视图对 owner/admin 传 account_id=self（后端 #328 已支持透传）。
  const { canManage, isEnterprise } = useTenantRole()
  // 从总览「查看更多」带来的上下文：?view= 初始化视图
  const [searchParams] = useSearchParams()
  const viewParam = searchParams.get('view')
  const [userView, setUserView] = useState<'enterprise' | 'mine' | null>(
    viewParam === 'mine' || viewParam === 'enterprise' ? viewParam : null,
  )
  const view = userView ?? (isEnterprise && canManage ? 'enterprise' : 'mine')
  const showViewToggle = isEnterprise && canManage
  const { symbol: currencySymbol } = useCurrency()

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
  const commonParams = useMemo(() => ({
    from,
    to,
    workspace_id: filterWorkspaceId || undefined,
    account_id: scopedAccountId,
  }), [filterWorkspaceId, from, to, scopedAccountId])

  const workspacesQuery = useQuery({
    queryKey: ['workspaces-for-filter', activeTenantId],
    queryFn: () => listWorkspaces(),
    enabled: !!activeTenantId,
    staleTime: 5 * 60 * 1000,
  })
  const workspaceList = workspacesQuery.data?.items ?? []

  function handleWorkspaceChange(val: string) {
    setFilterWorkspaceId(val === '__all__' ? '' : val)
  }

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

  const workspaceSourceQuery = useQuery({
    queryKey: ['usage-source-workspaces', activeTenantId, commonParams],
    queryFn: () => getUsageSummary({ ...commonParams, group_by: 'workspace' }),
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

  const spendAmount = parseFloat(summary?.total.spend.amount ?? '0')
  const requestCount = summary?.total.requests ?? 0
  const totalSpend = summary ? formatMoney(summary.total.spend.amount, currencySymbol) : '—'
  const totalRequests = summary ? formatNumber(summary.total.requests) : '—'
  const totalTokens = summary ? formatNumber(summary.total.tokens) : '—'
  const averageCost = formatAverageMoney(requestCount > 0 ? spendAmount / requestCount : 0, currencySymbol)
  const errorRate = summary ? `${(summary.total.error_rate * 100).toFixed(2)}%` : '—'
  const averageLatency = summary?.total.average_latency_ms ? `${Math.round(summary.total.average_latency_ms)}ms` : '—'

  const workspaceSourceItems = useMemo<UsageRankingItem[]>(() => {
    const groups = workspaceSourceQuery.data?.groups ?? []
    const total = groups.reduce((sum, group) => sum + parseFloat(group.spend.amount || '0'), 0)
    return groups.map((group, index) => {
      const amount = parseFloat(group.spend.amount || '0')
      return {
        rank: index + 1,
        key: group.key,
        name: group.label,
        spend: group.spend,
        requests: group.requests,
        tokens: group.tokens,
        share_percent: total > 0 ? (amount / total) * 100 : undefined,
      }
    })
  }, [workspaceSourceQuery.data])

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
            value={view}
            options={[
              { value: 'enterprise', label: t('dashboard.workbench.view.enterprise') },
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

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            label={t('usage.kpi.spend')}
            value={totalSpend}
            loading={summaryQuery.isLoading}
            color="var(--mg-warning)"
            glowColor="rgba(245, 158, 11, 0.12)"
            hoverBorderClass="hover:border-amber-500/30"
            icon={<LuWallet size={16} />}
          />
          <KpiCard
            label={t('usage.kpi.requestsTotal')}
            value={totalRequests}
            loading={summaryQuery.isLoading}
            color="var(--mg-success)"
            glowColor="rgba(16, 185, 129, 0.12)"
            hoverBorderClass="hover:border-emerald-500/30"
            icon={<LuActivity size={16} />}
          />
          <KpiCard
            label={t('usage.kpi.tokens')}
            value={totalTokens}
            loading={summaryQuery.isLoading}
            sub={summary ? t('usage.kpi.tokenBreakdown', {
              input: formatNumber(summary.total.input_tokens),
              output: formatNumber(summary.total.output_tokens),
            }) : undefined}
            color="var(--mg-info)"
            glowColor="rgba(59, 130, 246, 0.12)"
            hoverBorderClass="hover:border-blue-500/30"
            icon={<LuDatabase size={16} />}
          />
          <KpiCard
            label={t('usage.insights.errorRate')}
            value={errorRate}
            loading={summaryQuery.isLoading}
            color="var(--mg-danger)"
            glowColor="rgba(239, 68, 68, 0.12)"
            hoverBorderClass="hover:border-red-500/30"
            icon={<LuGauge size={16} />}
          />
          <KpiCard
            label={t('usage.insights.averageLatency')}
            value={averageLatency}
            loading={summaryQuery.isLoading}
            sub={t('usage.kpi.averageCostWithValue', { value: averageCost })}
            color="var(--brand-base)"
            glowColor="var(--brand-glow)"
            hoverBorderClass="hover:border-brand-base/30"
            icon={<LuGauge size={16} />}
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
          <EmptyState
            title={t('usage.member.empty')}
            description={t('usage.member.emptyDesc')}
            icon={<LuUsers size={26} />}
          />
        )}
      </Card>
    </div>
  )
}
