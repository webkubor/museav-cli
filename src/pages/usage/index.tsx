/**
 * 用量分析页
 * 路由：/usage
 * API 来源：GET /usage/summary、GET /usage/series、GET /usage/rankings/*、GET /logs/histogram
 */

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { DateRangePicker, type DateRangeValue } from '@/components/ui/DateRangePicker'
import {
  getUsageSummary,
  getUsageSeries,
  getUsageRankingsModels,
  getUsageRankingsApiKeys,
} from '@/services/usage'
import { listWorkspaces } from '@/services/workspaces'
import { listApiKeys } from '@/services/api-keys'
import { listModels } from '@/services/catalog'
import { useAuthStore } from '@/store/auth'
import { useCurrency } from '@/hooks/use-platform-config'
import type { SeriesDataPoint, UsageRankingItem } from '@/types'
import { pageItems } from '@/lib/utils'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import Select from '@/components/ui/Select'
import { LuActivity, LuDatabase, LuGauge, LuRefreshCw, LuWallet } from 'react-icons/lu'
import {
  ApiKeyRankingPanel,
  CostSourcePanel,
  type CostSourceSection,
  ModelDistributionPanel,
  UsageHealthPanel,
} from './usage-panels'
import {
  type Metric,
  rangeToDates,
  formatMoney,
  formatNumber,
  formatAverageMoney,
} from './usage-utils'
import { Sparkline, MetricTab } from './usage-charts'

/** 用量分析页面入口。 */
export default function UsagePage() {
  const { t } = useTranslation()
  const [timeRange, setTimeRange] = useState<DateRangeValue>({ preset: '7d' })
  const [metric, setMetric] = useState<Metric>('spend')
  const [filterWorkspaceId, setFilterWorkspaceId] = useState<string>('')
  const [filterApiKeyId, setFilterApiKeyId] = useState<string>('')
  const [filterModelId, setFilterModelId] = useState<string>('')

  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const { symbol: currencySymbol } = useCurrency()

  const usagePresets = [
    { key: '7d', label: t('usage.range.7d') },
    { key: '30d', label: t('usage.range.30d') },
    { key: '90d', label: t('usage.range.90d') },
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
  const rangeLabel =
    timeRange.preset === 'custom' && timeRange.startDate && timeRange.endDate
      ? `${timeRange.startDate} ~ ${timeRange.endDate}`
      : (usagePresets.find((preset) => preset.key === (timeRange.preset ?? '7d'))?.label ?? '')

  const effectiveWorkspaceId = filterWorkspaceId || activeWorkspaceId || undefined
  const commonParams = useMemo(() => ({
    from,
    to,
    workspace_id: filterWorkspaceId || activeWorkspaceId || undefined,
    api_key_id: filterApiKeyId || undefined,
    model_id: filterModelId || undefined,
  }), [activeWorkspaceId, filterApiKeyId, filterModelId, filterWorkspaceId, from, to])

  const workspacesQuery = useQuery({
    queryKey: ['workspaces-for-filter', activeTenantId],
    queryFn: () => listWorkspaces(),
    enabled: !!activeTenantId,
    staleTime: 5 * 60 * 1000,
  })
  const workspaceList = workspacesQuery.data?.items ?? []

  const apiKeysQuery = useQuery({
    queryKey: ['api-keys-for-filter', effectiveWorkspaceId],
    queryFn: () => listApiKeys(effectiveWorkspaceId!).then(pageItems),
    enabled: !!effectiveWorkspaceId,
    staleTime: 5 * 60 * 1000,
  })
  const apiKeyList = apiKeysQuery.data ?? []

  const modelsQuery = useQuery({
    queryKey: ['usage-models-for-filter'],
    queryFn: () => listModels({ page_size: 100, sort: 'popular' }).then(pageItems),
    staleTime: 5 * 60 * 1000,
  })
  const modelList = modelsQuery.data ?? []

  function handleWorkspaceChange(val: string) {
    setFilterWorkspaceId(val === '__all__' ? '' : val)
    setFilterApiKeyId('')
  }

  function handleApiKeyChange(val: string) {
    setFilterApiKeyId(val === '__all__' ? '' : val)
  }

  function handleModelChange(val: string) {
    setFilterModelId(val === '__all__' ? '' : val)
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
      title: t('usage.sources.topProject'),
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

  const filterBar = (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={filterWorkspaceId === '' ? '__all__' : filterWorkspaceId}
        onChange={handleWorkspaceChange}
        placeholder={t('usage.filter.allWorkspaces')}
        className="h-9 w-40 text-sm"
      >
        <Select.Option value="__all__">{t('usage.filter.allWorkspaces')}</Select.Option>
        {workspaceList.map((workspace) => (
          <Select.Option key={workspace.workspace_id} value={workspace.workspace_id}>
            {workspace.name}
          </Select.Option>
        ))}
      </Select>

      <Select
        value={filterApiKeyId === '' ? '__all__' : filterApiKeyId}
        onChange={handleApiKeyChange}
        placeholder={t('usage.filter.allKeys')}
        className="h-9 w-44 text-sm"
        disabled={!effectiveWorkspaceId}
      >
        <Select.Option value="__all__">{t('usage.filter.allKeys')}</Select.Option>
        {apiKeyList.map((apiKey) => (
          <Select.Option key={apiKey.api_key_id} value={apiKey.api_key_id}>
            {apiKey.name || apiKey.masked}
          </Select.Option>
        ))}
      </Select>

      <Select
        value={filterModelId === '' ? '__all__' : filterModelId}
        onChange={handleModelChange}
        placeholder={t('usage.filter.allModels')}
        className="h-9 w-44 text-sm"
      >
        <Select.Option value="__all__">{t('usage.filter.allModels')}</Select.Option>
        {modelList.map((model) => (
          <Select.Option key={model.model_id} value={model.model_id}>
            {model.display_name || model.model_id}
          </Select.Option>
        ))}
      </Select>

      <DateRangePicker
        value={timeRange}
        onChange={setTimeRange}
        presets={usagePresets}
        placeholder={t('usage.customRange.placeholder')}
      />
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <PageHeader title={t('usage.title')} description={t('usage.desc')} />
        <div className="flex flex-wrap items-center gap-2">
          {filterBar}
          <Button variant="outline" size="sm" onClick={refetchUsageData} icon={<LuRefreshCw size={14} />}>
            {t('usage.refresh')}
          </Button>
        </div>
      </div>

      {summaryQuery.isError && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-mg-danger/30 bg-mg-bg-0 px-4 py-3 text-sm text-mg-danger">
          {t('usage.error.summary')}
          <Button variant="outline" size="sm" onClick={() => summaryQuery.refetch()}>
            {t('usage.retry')}
          </Button>
        </div>
      )}

      <UsageHealthPanel
        rangeLabel={rangeLabel}
        totalSpend={totalSpend}
        totalRequests={totalRequests}
        totalTokens={totalTokens}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
          label={t('usage.kpi.requests')}
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
          label={t('usage.kpi.averageCost')}
          value={averageCost}
          loading={summaryQuery.isLoading}
          sub={t('usage.kpi.averageCostDesc')}
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
              <div className="text-sm font-semibold text-mg-text-0">
                {t('usage.chart.trendTitle', { metric: metricLabels[metric] })}
              </div>
              <div className="mt-1 text-[12px] text-mg-text-2">{rangeLabel}</div>
            </div>
            <div className="flex gap-1 rounded-lg bg-mg-bg-1 p-1">
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <ModelDistributionPanel
          items={rankingsModelsQuery.data?.items ?? []}
          isLoading={rankingsModelsQuery.isLoading}
          isError={rankingsModelsQuery.isError}
          onRetry={() => rankingsModelsQuery.refetch()}
          currencySymbol={currencySymbol}
        />
        <ApiKeyRankingPanel
          items={rankingsApiKeysQuery.data?.items ?? []}
          isLoading={rankingsApiKeysQuery.isLoading}
          isError={rankingsApiKeysQuery.isError}
          onRetry={() => rankingsApiKeysQuery.refetch()}
          currencySymbol={currencySymbol}
        />
      </div>
    </div>
  )
}
