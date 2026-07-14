/**
 * 用量分析页
 * 路由：/usage
 * API 来源：GET /usage/summary、GET /usage/series、GET /usage/rankings/*、GET /logs/histogram
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
import { trackEvent, trackPageView } from '@/lib/track'
import { densifyDailyBuckets as densifyGenericBuckets } from '@/lib/chart-buckets'
import type { SeriesDataPoint, UsageRankingItem } from '@/types'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { LuActivity, LuBot, LuDatabase, LuKey, LuKeyRound, LuRefreshCw, LuWallet, LuUsers } from 'react-icons/lu'
import {
  CostSourcePanel,
  type CostSourceSection,
  ApiKeyRankingPanel,
  DistributionPanel,
  ModelDistributionDonutPanel,
  ModelDistributionPanel,
  UsageStatCard,
} from './usage-panels'
import { MemberRankingPanel } from './member-ranking-panel'
import {
  type Metric,
  rangeToDates,
  formatMoney,
  formatNumber,
  densifyValueSeries,
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
import { KEY_TYPE_ALL, apiKeyTypeParam, type ApiKeyTypeFilter } from '@/lib/api-key-type-filter'

type UsageDimension = 'model' | 'member' | 'apiKey'
type TrendGroupBy = 'none' | 'model' | 'provider' | 'workspace'

/** 深链/下钻上下文：从 URL 参数推导初始时间范围（time_range 预设或 range_start/range_end 自定义）。 */
function initialTimeRangeFromParams(sp: URLSearchParams): DateRangeValue {
  const rangeStart = sp.get('range_start')
  const rangeEnd = sp.get('range_end')
  if (rangeStart && rangeEnd) return { preset: 'custom', startDate: rangeStart, endDate: rangeEnd }
  const tr = sp.get('time_range')
  const valid = ['today', '7d', '30d', 'thisMonth', 'lastMonth']
  if (tr && valid.includes(tr)) return { preset: tr }
  return { preset: 'thisMonth' }
}

/** 用量分析页面入口。 */
export default function UsagePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [timeRange, setTimeRange] = useState<DateRangeValue>(() => initialTimeRangeFromParams(searchParams))
  const [metric, setMetric] = useState<Metric>('spend')
  // 深链上下文：?workspace_id=（或旧 ?workspace=）初始化工作空间筛选
  const [filterWorkspaceId, setFilterWorkspaceId] = useState<string>(
    () => searchParams.get('workspace_id') || searchParams.get('workspace') || '',
  )
  // API Key 类型筛选（需求 #22）：仅企业拥有者/管理员可见，默认全部类型
  const [keyTypeFilter, setKeyTypeFilter] = useState<ApiKeyTypeFilter>(KEY_TYPE_ALL)

  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const currentAccountId = useAuthStore((s) => s.account?.account_id)
  // 用量统计是租户级页面：默认租户全量，仅受本页筛选器控制；不读工作空间选择器的
  // activeWorkspaceId（PRD §7.3：租户级页面不得被选择器过滤）。
  // 视图切换（对齐原型 + PRD §9）：默认按角色，Owner/Admin=企业视图，其余=我的视图；
  // 我的视图对 owner/admin 传 account_id=self（后端 #328 已支持透传）。
  const { canManage, isEnterprise, isSpaceOwner, ownedWorkspaceIds } = useTenantRole()
  // 从总览「查看更多」/下钻带来的上下文：?view= 初始化视图，?dimension= 或 ?model/member_id/api_key_id= 推导维度
  const viewParam = searchParams.get('view')
  const dimensionParam = searchParams.get('dimension')
  const modelParam = searchParams.get('model')
  const memberParam = searchParams.get('member_id') || searchParams.get('member')
  const apiKeyParam = searchParams.get('api_key_id') || searchParams.get('api_key')
  const initialDimension: UsageDimension =
    dimensionParam === 'member' || dimensionParam === 'apiKey' || dimensionParam === 'model'
      ? dimensionParam
      : memberParam
        ? 'member'
        : apiKeyParam
          ? 'apiKey'
          : modelParam
            ? 'model'
            : 'model'
  const [dimension, setDimension] = useState<UsageDimension>(initialDimension)
  // 趋势图分组维度（后端 /usage/series 的 group_by）：none=单条总量曲线，其余=多序列堆叠
  // 从总览「工作空间明细·查看更多」带来的上下文：?group_by=workspace 预置趋势维度
  const groupByParam = searchParams.get('group_by')
  const initialTrendGroupBy: TrendGroupBy =
    groupByParam === 'model' || groupByParam === 'provider' || groupByParam === 'workspace'
      ? groupByParam
      : 'none'
  const [trendGroupBy, setTrendGroupBy] = useState<TrendGroupBy>(initialTrendGroupBy)
  const [userView, setUserView] = useState<'enterprise' | 'mine' | 'space' | null>(
    viewParam === 'mine' || viewParam === 'enterprise' || viewParam === 'space' ? viewParam : null,
  )
  // 「空间视图」目前只支持单空间场景（#357 多空间合并裁剪参数待确认，暂不实现），
  // 负责多个空间时不渲染该切换档，避免猜参数硬发请求。
  const canUseSpaceView = isSpaceOwner && ownedWorkspaceIds.length === 1
  const showViewToggle = isEnterprise && canManage
  const showSpaceViewToggle = !showViewToggle && canUseSpaceView
  const view = userView ?? (showViewToggle ? 'enterprise' : canUseSpaceView ? 'space' : 'mine')
  // 成员维度只在能看到全员数据的视图（企业/空间）下有意义；我的视图/个人租户隐藏该维度
  const canShowMemberDimension = view === 'enterprise' || view === 'space'
  // 对齐 PRD：说明文案按当前视图分三档（团队/负责空间/我的），不是一句固定文案
  const viewDesc = view === 'enterprise' ? t('usage.descTeam') : view === 'space' ? t('usage.descSpace') : t('usage.descMine')
  const { symbol: currencySymbol } = useCurrency()

  useEffect(() => {
    trackPageView('usage')
  }, [])

  // 切到不含成员维度的视图时，若当前停在成员维度则回落到模型维度（派生，不 setState，避免看空面板）
  const effectiveDimension: UsageDimension =
    !canShowMemberDimension && dimension === 'member' ? 'model' : dimension

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
  // 类型筛选仅企业拥有者视图生效（其余视图恒为 undefined，不受 stale 值影响）
  const scopedKeyType = showViewToggle ? apiKeyTypeParam(keyTypeFilter) : undefined
  const commonParams = useMemo(() => ({
    from,
    to,
    workspace_id: scopedWorkspaceId,
    account_id: scopedAccountId,
    api_key_type: scopedKeyType,
  }), [scopedWorkspaceId, from, to, scopedAccountId, scopedKeyType])

  // 空态分型：有筛选（工作空间/自定义时段）时的空 = 筛选无结果；无筛选仍空 = 暂无数据
  const hasActiveFilter = !!filterWorkspaceId || timeRange.preset === 'custom'
  const emptyTitle = hasActiveFilter ? t('usage.emptyState.filteredTitle') : t('usage.emptyState.noDataTitle')
  const emptyDesc = hasActiveFilter ? t('usage.emptyState.filteredDesc') : t('usage.emptyState.noDataDesc')

  const workspacesQuery = useQuery({
    queryKey: ['workspaces-for-filter', activeTenantId],
    queryFn: () => listWorkspaces(),
    enabled: !!activeTenantId,
    staleTime: 5 * 60 * 1000,
  })
  const workspaceList = useMemo(() => workspacesQuery.data?.items ?? [], [workspacesQuery.data])

  function handleWorkspaceChange(val: string) {
    const next = val === '__all__' ? '' : val
    setFilterWorkspaceId(next)
    trackEvent('usage_filter_change', { filter: 'workspace', value: next ? 'specific' : 'all' }, { view_mode: view })
  }

  function handleTimeRangeChange(val: DateRangeValue) {
    setTimeRange(val)
    trackEvent('usage_filter_change', { filter: 'time_range', preset: val.preset ?? 'unknown' }, { view_mode: view })
  }

  function handleKeyTypeChange(val: ApiKeyTypeFilter) {
    setKeyTypeFilter(val)
    trackEvent('usage_filter_change', { filter: 'api_key_type', value: val }, { view_mode: view })
  }

  function handleViewChange(v: 'enterprise' | 'mine' | 'space') {
    trackEvent('usage_view_switch', { from_view: view, to_view: v }, { view_mode: v })
    setUserView(v)
  }

  function handleDimensionChange(next: UsageDimension) {
    trackEvent('usage_dimension_switch', { dimension: next }, { view_mode: view })
    setDimension(next)
  }

  function handleMetricChange(next: Metric) {
    trackEvent('usage_trend_metric_switch', { metric: next }, { view_mode: view })
    setMetric(next)
  }

  // 下钻：携带当前时间范围/工作空间 + 具体上下文（模型/成员/Key/单日）跳调用日志
  function buildLogsSearch(ctx: { model?: string; api_key?: string; member?: string; workspace?: string; day?: string }): string {
    const p = new URLSearchParams()
    p.set('view', view)
    const ws = ctx.workspace ?? scopedWorkspaceId
    if (ws) p.set('workspace', ws)
    if (ctx.day) {
      const d = ctx.day.slice(0, 10)
      p.set('range_start', d)
      p.set('range_end', d)
    } else if (timeRange.preset === 'custom' && timeRange.startDate && timeRange.endDate) {
      p.set('range_start', timeRange.startDate)
      p.set('range_end', timeRange.endDate)
    } else if (timeRange.preset) {
      p.set('time_range', timeRange.preset)
    }
    if (ctx.model) p.set('model', ctx.model)
    if (ctx.api_key) p.set('api_key', ctx.api_key)
    if (ctx.member) p.set('member', ctx.member)
    return p.toString()
  }

  function drillToLogs(
    source: string,
    ctx: { model?: string; api_key?: string; member?: string; workspace?: string; day?: string },
  ) {
    const kind = ctx.model ? 'model' : ctx.api_key ? 'apiKey' : ctx.member ? 'member' : ctx.workspace ? 'workspace' : 'time'
    trackEvent('usage_drilldown', { source, kind }, { view_mode: view })
    navigate(`/logs?${buildLogsSearch(ctx)}`)
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
    const mapped = points.map((point) => ({
      bucket_start: point.bucket_start,
      value: metric === 'spend'
        ? (point.spend?.amount ?? '0')
        : String(metric === 'requests' ? (point.requests ?? 0) : (point.tokens ?? 0)),
    }))
    // 按 from~to 补 0，让曲线覆盖整个所选区间（后端仅返回有数据的天）
    return densifyValueSeries(mapped, from, to)
  }, [metric, seriesQuery.data, from, to])

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
    // 按 from~to 补 0：缺失天生成所有序列均为 0 的行，使堆叠面积覆盖整个区间
    const denseRows = densifyGenericBuckets(rows, from, to, (bucket_start) => {
      const r: GroupedRow = { bucket_start }
      series.forEach((s) => { r[s.key] = 0 })
      return r
    })
    return { rows: denseRows, series }
  }, [trendGroupBy, seriesQuery.data, metric, workspaceList, from, to, t])

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
  // 费用分项（#385，Swagger usage.Totals：input/output/cache_cost 为金额字符串，币种同 spend）
  const inputCostNum = Number(summary?.total.input_cost ?? 0)
  const outputCostNum = Number(summary?.total.output_cost ?? 0)
  const cacheCostNum = Number(summary?.total.cache_cost ?? 0)
  const costTotal = inputCostNum + outputCostNum + cacheCostNum
  const costPct = (n: number) => (costTotal > 0 ? (n / costTotal) * 100 : 0)

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
      drillKind: 'workspace',
    },
    {
      title: t('usage.sources.topApiKey'),
      items: rankingsApiKeysQuery.data?.items ?? [],
      emptyLabel: t('usage.sources.empty'),
      drillKind: 'apiKey',
    },
    {
      title: t('usage.sources.topModel'),
      items: rankingsModelsQuery.data?.items ?? [],
      emptyLabel: t('usage.sources.empty'),
      drillKind: 'model',
    },
  ]

  function refetchUsageData() {
    trackEvent('usage_refresh_click', undefined, { view_mode: view })
    void summaryQuery.refetch()
    void seriesQuery.refetch()
    void rankingsApiKeysQuery.refetch()
    void rankingsModelsQuery.refetch()
    void rankingsAccountsQuery.refetch()
    void workspaceSourceQuery.refetch()
  }

  const dimensionButtons: Array<{ icon: ReactNode; label: string; value: UsageDimension }> = [
    { icon: <LuBot size={14} />, label: t('usage.dimension.model'), value: 'model' },
    // 成员维度仅企业/空间视图可见（我的视图/个人租户隐藏）
    ...(canShowMemberDimension ? [{ icon: <LuUsers size={14} />, label: t('usage.dimension.member'), value: 'member' as const }] : []),
    { icon: <LuKeyRound size={14} />, label: t('usage.dimension.apiKey'), value: 'apiKey' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('usage.title')}
        description={viewDesc}
        actions={showViewToggle ? (
          <SegmentedToggle<'enterprise' | 'mine'>
            ariaLabel={t('dashboard.workbench.view.enterprise')}
            value={view === 'space' ? 'mine' : view}
            options={[
              { value: 'enterprise', label: t('dashboard.workbench.view.enterprise') },
              { value: 'mine', label: t('dashboard.workbench.view.mine') },
            ]}
            onChange={handleViewChange}
          />
        ) : showSpaceViewToggle ? (
          <SegmentedToggle<'space' | 'mine'>
            ariaLabel={t('dashboard.workbench.view.space')}
            value={view === 'enterprise' ? 'space' : view}
            options={[
              { value: 'space', label: t('dashboard.workbench.view.space') },
              { value: 'mine', label: t('dashboard.workbench.view.mine') },
            ]}
            onChange={handleViewChange}
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
          onTimeRangeChange={handleTimeRangeChange}
          onWorkspaceChange={handleWorkspaceChange}
          presets={usagePresets}
          timeRange={timeRange}
          workspaceList={workspaceList}
          {...(showViewToggle
            ? { keyTypeFilter, onKeyTypeChange: handleKeyTypeChange }
            : {})}
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
              { label: t('usage.summary.inputCost'), value: summary ? formatMoney(summary.total.input_cost ?? '0', currencySymbol) : '—', pct: costPct(inputCostNum), variant: 'emerald' },
              { label: t('usage.summary.outputCost'), value: summary ? formatMoney(summary.total.output_cost ?? '0', currencySymbol) : '—', pct: costPct(outputCostNum), variant: 'amber' },
              { label: t('usage.summary.cacheCost'), value: summary ? formatMoney(summary.total.cache_cost ?? '0', currencySymbol) : '—', pct: costPct(cacheCostNum), variant: 'blue' },
            ]}
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
                      onClick={() => handleMetricChange(item)}
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
                onPointClick={(bucket) => drillToLogs('trend', { day: bucket })}
              />
            ) : (
              <Sparkline
                data={seriesData}
                metric={metric}
                noDataLabel={t('usage.noData')}
                currencySymbol={currencySymbol}
                requestUnitLabel={t('usage.unit.requests')}
                tokenUnitLabel={t('usage.unit.tokens')}
                onPointClick={(bucket) => drillToLogs('trend', { day: bucket })}
              />
            )}
          </Card>

          <CostSourcePanel
            sections={sourceSections}
            currencySymbol={currencySymbol}
            isLoading={rankingsModelsQuery.isLoading || rankingsApiKeysQuery.isLoading || workspaceSourceQuery.isLoading}
            isError={rankingsModelsQuery.isError || rankingsApiKeysQuery.isError || workspaceSourceQuery.isError}
            onRetry={refetchUsageData}
            onDrill={(kind, item) => {
              if (!item) return
              if (kind === 'workspace') drillToLogs('cost_source', { workspace: item.key })
              else if (kind === 'apiKey') drillToLogs('cost_source', { api_key: item.key })
              else if (kind === 'model') drillToLogs('cost_source', { model: item.key })
            }}
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
                onClick={() => handleDimensionChange(item.value)}
                className={[
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 mg-text-caption font-bold transition-colors',
                  effectiveDimension === item.value ? 'bg-mg-bg-0 text-brand-base shadow-sm' : 'text-mg-text-3 hover:text-mg-text-1',
                ].join(' ')}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {effectiveDimension === 'model' && (
          <div className="grid gap-5 xl:grid-cols-2">
            <ModelDistributionDonutPanel
              items={rankingsModelsQuery.data?.items ?? []}
              totalSpendAmount={rankingsModelsQuery.data?.totals?.spend?.amount}
              isLoading={rankingsModelsQuery.isLoading}
              isError={rankingsModelsQuery.isError}
              onRetry={() => rankingsModelsQuery.refetch()}
              currencySymbol={currencySymbol}
              emptyTitle={emptyTitle}
              emptyDesc={emptyDesc}
            />
            <ModelDistributionPanel
              items={rankingsModelsQuery.data?.items ?? []}
              totalSpendAmount={rankingsModelsQuery.data?.totals?.spend?.amount}
              isLoading={rankingsModelsQuery.isLoading}
              isError={rankingsModelsQuery.isError}
              onRetry={() => rankingsModelsQuery.refetch()}
              currencySymbol={currencySymbol}
              emptyTitle={emptyTitle}
              emptyDesc={emptyDesc}
              onDrill={(item) => drillToLogs('ranking', { model: item.key })}
            />
          </div>
        )}
        {effectiveDimension === 'apiKey' && (
          <div className="space-y-5">
            <DistributionPanel
              title={t('usage.distribution.apiKeyTitle')}
              items={rankingsApiKeysQuery.data?.items ?? []}
              totalSpendAmount={rankingsApiKeysQuery.data?.totals?.spend?.amount}
              currencySymbol={currencySymbol}
              isLoading={rankingsApiKeysQuery.isLoading}
              isError={rankingsApiKeysQuery.isError}
              onRetry={() => rankingsApiKeysQuery.refetch()}
              emptyTitle={emptyTitle}
              emptyDesc={emptyDesc}
              leading={() => (
                <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-md bg-brand-selected-bg text-brand-base">
                  <LuKey size={13} />
                </span>
              )}
              onDrill={(item) => drillToLogs('ranking', { api_key: item.key })}
            />
            <ApiKeyRankingPanel
              items={rankingsApiKeysQuery.data?.items ?? []}
              isLoading={rankingsApiKeysQuery.isLoading}
              isError={rankingsApiKeysQuery.isError}
              onRetry={() => rankingsApiKeysQuery.refetch()}
              currencySymbol={currencySymbol}
              emptyTitle={emptyTitle}
              emptyDesc={emptyDesc}
              onDrill={(item) => drillToLogs('ranking', { api_key: item.key })}
            />
          </div>
        )}
        {effectiveDimension === 'member' && (
          <div className="space-y-5">
            <DistributionPanel
              title={t('usage.distribution.memberTitle')}
              items={rankingsAccountsQuery.data?.items ?? []}
              totalSpendAmount={rankingsAccountsQuery.data?.totals?.spend?.amount}
              currencySymbol={currencySymbol}
              isLoading={rankingsAccountsQuery.isLoading}
              isError={rankingsAccountsQuery.isError}
              onRetry={() => rankingsAccountsQuery.refetch()}
              emptyTitle={emptyTitle}
              emptyDesc={emptyDesc}
              leading={() => (
                <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-md bg-brand-selected-bg text-brand-base">
                  <LuUsers size={13} />
                </span>
              )}
              onDrill={(item) => drillToLogs('ranking', { member: item.key })}
            />
            <MemberRankingPanel
              items={rankingsAccountsQuery.data?.items ?? []}
              isLoading={rankingsAccountsQuery.isLoading}
              isError={rankingsAccountsQuery.isError}
              onRetry={() => rankingsAccountsQuery.refetch()}
              currencySymbol={currencySymbol}
              emptyTitle={emptyTitle}
              emptyDesc={emptyDesc}
              onDrill={(item) => drillToLogs('ranking', { member: item.key })}
            />
          </div>
        )}
      </Card>
    </div>
  )
}
