/**
 * 用量分析页数据层：状态、查询、派生数据与事件处理器。
 * 路由：/usage
 * API 来源：GET /usage/summary、GET /usage/series、GET /usage/rankings/*、GET /logs/histogram
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { type DateRangeValue } from '@/components/ui/DateRangePicker'
import { useAuthStore } from '@/store/auth'
import { useTenantRole } from '@/hooks/use-tenant-role'
import { useCurrency } from '@/hooks/use-platform-config'
import { trackEvent, trackPageView } from '@/lib/track'
import { formatDuration } from '@/lib/format-date'
import type { UsageRankingItem } from '@/types'
import { LuBot, LuKey, LuKeyRound, LuUsers } from 'react-icons/lu'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { type Metric, rangeToDates, formatMoney, formatNumber } from './usage-utils'
import type { CostSourceSection } from './usage-panels'
import { useUsageQueries } from './use-usage-queries'

export type UsageDimension = 'model' | 'member' | 'apiKey'

/** 页面默认时间范围（本月）。既作深链无参数时的初值，也是切换视图时的复位目标（#154）。 */
const DEFAULT_TIME_RANGE: DateRangeValue = { preset: 'thisMonth' }

/** 深链/下钻上下文：从 URL 参数推导初始时间范围（time_range 预设或 range_start/range_end 自定义）。 */
function initialTimeRangeFromParams(sp: URLSearchParams): DateRangeValue {
  const rangeStart = sp.get('range_start')
  const rangeEnd = sp.get('range_end')
  if (rangeStart && rangeEnd) return { preset: 'custom', startDate: rangeStart, endDate: rangeEnd }
  const tr = sp.get('time_range')
  const valid = ['today', '7d', '30d', 'thisMonth', 'lastMonth']
  if (tr && valid.includes(tr)) return { preset: tr }
  return DEFAULT_TIME_RANGE
}

export function useUsagePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [timeRange, setTimeRange] = useState<DateRangeValue>(() => initialTimeRangeFromParams(searchParams))
  const [metric, setMetric] = useState<Metric>('spend')
  // 深链上下文：?workspace_id=（或旧 ?workspace=）初始化工作空间筛选
  const [filterWorkspaceId, setFilterWorkspaceId] = useState<string>(
    () => searchParams.get('workspace_id') || searchParams.get('workspace') || '',
  )

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
  // #666 用量明细「查看更多」：展开态与展开页码由页面持有（饼图/排行双卡联动），
  // 切维度/视图/筛选或收起时统一复位，避免残留旧页码
  const [detailExpanded, setDetailExpanded] = useState(false)
  const [detailPage, setDetailPage] = useState(1)
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

  // 从总览排行卡「查看更多」带 ?dimension= 进入时，直接定位到「用量明细」区块，
  // 而不是停在页面顶部（需求方#716）
  useEffect(() => {
    if (!dimensionParam) return
    requestAnimationFrame(() => {
      document.getElementById('usage-breakdown')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const commonParams = useMemo(() => ({
    from,
    to,
    workspace_id: scopedWorkspaceId,
    account_id: scopedAccountId,
  }), [scopedWorkspaceId, from, to, scopedAccountId])

  // 空态分型：有筛选（工作空间/自定义时段）时的空 = 筛选无结果；无筛选仍空 = 暂无数据
  const hasActiveFilter = !!filterWorkspaceId || timeRange.preset === 'custom'
  const emptyTitle = hasActiveFilter ? t('usage.emptyState.filteredTitle') : t('usage.emptyState.noDataTitle')
  const emptyDesc = hasActiveFilter ? t('usage.emptyState.filteredDesc') : t('usage.emptyState.noDataDesc')

  function handleWorkspaceChange(val: string) {
    const next = val === '__all__' ? '' : val
    setFilterWorkspaceId(next)
    setDetailPage(1)
    trackEvent('usage_filter_change', { filter: 'workspace', value: next ? 'specific' : 'all' }, { view_mode: view })
  }

  function handleTimeRangeChange(val: DateRangeValue) {
    setTimeRange(val)
    setDetailPage(1)
    trackEvent('usage_filter_change', { filter: 'time_range', preset: val.preset ?? 'unknown' }, { view_mode: view })
  }

  function handleViewChange(v: 'enterprise' | 'mine' | 'space') {
    trackEvent('usage_view_switch', { from_view: view, to_view: v }, { view_mode: v })
    setUserView(v)
    // #154：切换视图（企业/我的/空间）后，筛选项恢复各视图默认值——时间范围回本月、
    // 工作空间回全部——避免残留旧筛选导致新视图数据口径被误读。
    setTimeRange(DEFAULT_TIME_RANGE)
    setFilterWorkspaceId('')
    setDetailExpanded(false)
    setDetailPage(1)
  }

  function handleDimensionChange(next: UsageDimension) {
    trackEvent('usage_dimension_switch', { dimension: next }, { view_mode: view })
    setDimension(next)
    setDetailExpanded(false)
    setDetailPage(1)
  }

  function handleDetailExpandedChange(next: boolean) {
    trackEvent('usage_detail_expand', { action: next ? 'expand' : 'collapse', dimension: effectiveDimension }, { view_mode: view })
    setDetailExpanded(next)
    setDetailPage(1)
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

  const {
    workspaceList,
    summaryQuery,
    seriesQuery,
    rankingsApiKeysQuery,
    rankingsModelsQuery,
    rankingsAccountsQuery,
    workspaceSourceQuery,
    summary,
    seriesData,
  } = useUsageQueries({
    activeTenantId,
    commonParams,
    rangeReady,
    metric,
    from,
    to,
  })

  const requestCount = summary?.total.requests ?? 0
  const totalSpend = summary ? formatMoney(summary.total.spend.amount, currencySymbol) : '—'
  const totalRequests = summary ? formatNumber(summary.total.requests) : '—'
  const totalTokens = summary ? formatNumber(summary.total.tokens) : '—'
  const averageLatency = summary?.total.average_latency_ms
    ? formatDuration(Math.round(summary.total.average_latency_ms))
    : '—'
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

  // 顺序对齐 PRD：最高消费工作空间 → 最高消费模型 → 最高消费 API Key
  const sourceSections: CostSourceSection[] = [
    {
      title: t('usage.sources.topWorkspace'),
      items: workspaceSourceItems,
      emptyLabel: t('usage.sources.empty'),
      drillKind: 'workspace',
    },
    {
      title: t('usage.sources.topModel'),
      items: rankingsModelsQuery.data?.items ?? [],
      emptyLabel: t('usage.sources.empty'),
      drillKind: 'model',
    },
    {
      title: t('usage.sources.topApiKey'),
      items: rankingsApiKeysQuery.data?.items ?? [],
      emptyLabel: t('usage.sources.empty'),
      drillKind: 'apiKey',
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

  // 用量明细：三维（模型/成员/API Keys）统一为 PRD 结构——左「分布」环形图 + 右「排行」列表。
  const dimQuery =
    effectiveDimension === 'apiKey'
      ? rankingsApiKeysQuery
      : effectiveDimension === 'member'
        ? rankingsAccountsQuery
        : rankingsModelsQuery
  const dimItems = dimQuery.data?.items ?? []
  const dimTotalSpend = dimQuery.data?.totals?.spend?.amount

  // 行首图标：模型用 ModelIcon，成员/API Keys 用通用徽标
  const dimLeading = (item: UsageRankingItem) => {
    if (effectiveDimension === 'model') {
      return (
        <ModelIcon
          model={{ display_name: item.name || item.key || '', vendor: item.vendor || item.name || item.key || '' }}
          size={22}
          rounded="rounded-md"
        />
      )
    }
    const Icon = effectiveDimension === 'member' ? LuUsers : LuKey
    return (
      <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-md bg-brand-selected-bg text-brand-base">
        <Icon size={13} />
      </span>
    )
  }

  // 次级说明（归因）：**只有 API Keys 维度保留**（显示归属人），模型与成员维度不再展示
  // （需求方#718）。原本模型显「工作空间: xxx」、成员显「N 个模型」，但后端归因大多不返回，
  // 满屏是「工作空间: —」这类空壳，占一行高度却不带信息。
  // 返回 null 时渲染层（usage-distribution-panel 的 `secondary != null` 守卫）整行不渲染，
  // 不留空位；缺省「—」的兜底（#447）只对 API Keys 维度还成立。
  const dimSecondary = (item: UsageRankingItem) => {
    if (effectiveDimension === 'model' || effectiveDimension === 'member') return null
    return item.owner || '—'
  }

  function drillFromRanking(item: UsageRankingItem) {
    if (effectiveDimension === 'model') drillToLogs('ranking', { model: item.key })
    else if (effectiveDimension === 'member') drillToLogs('ranking', { member: item.key })
    else drillToLogs('ranking', { api_key: item.key })
  }

  return {
    viewDesc,
    showViewToggle,
    showSpaceViewToggle,
    view,
    handleViewChange,
    summaryQuery,
    seriesQuery,
    rankingsModelsQuery,
    rankingsApiKeysQuery,
    workspaceSourceQuery,
    usagePresets,
    filterWorkspaceId,
    timeRange,
    workspaceList,
    handleTimeRangeChange,
    handleWorkspaceChange,
    refetchUsageData,
    totalSpend,
    totalRequests,
    totalTokens,
    currencySymbol,
    summary,
    costPct,
    inputCostNum,
    outputCostNum,
    cacheCostNum,
    successRequests,
    failedRequests,
    averageLatency,
    reqPct,
    inputTokens,
    outputTokens,
    cacheTokens,
    tokPct,
    metric,
    metricLabels,
    handleMetricChange,
    seriesData,
    drillToLogs,
    sourceSections,
    dimensionButtons,
    effectiveDimension,
    handleDimensionChange,
    dimQuery,
    dimItems,
    dimTotalSpend,
    emptyTitle,
    emptyDesc,
    dimLeading,
    dimSecondary,
    drillFromRanking,
    detailExpanded,
    handleDetailExpandedChange,
    detailPage,
    setDetailPage,
  }
}
