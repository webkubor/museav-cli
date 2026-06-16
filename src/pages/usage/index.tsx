import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer,
  AreaChart, Area,
  BarChart, Bar,
  XAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { DateRangePicker, type DateRangeValue } from '@/components/ui/DateRangePicker'
import {
  getUsageSummary,
  getUsageSeries,
  getUsageRankingsModels,
  getUsageRankingsApiKeys,
} from '@/services/usage'
import { listWorkspaces } from '@/services/workspaces'
import { listApiKeys } from '@/services/api-keys'
import { getLogHistogram } from '@/services/logs'
import { useAuthStore } from '@/store/auth'
import { useCurrency } from '@/hooks/use-platform-config'
import type { SeriesDataPoint } from '@/types'
import { formatChartTooltipDate } from '@/lib/format-date'
import { pageItems } from '@/lib/utils'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import Select from '@/components/ui/Select'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { LuTrendingUp, LuActivity, LuDatabase, LuKey, LuCpu } from 'react-icons/lu'
import { ModelIcon } from '@/features/models/components/ModelIcon'

// ─── Types ───────────────────────────────────────────

type Metric = 'spend' | 'requests' | 'tokens'

// ─── Helpers ─────────────────────────────────────────

const USAGE_PRESET_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 }

function rangeToDates(range: DateRangeValue): { from: string; to: string } {
  const now = new Date()
  if (range.preset === 'custom' && range.startDate && range.endDate) {
    return {
      from: new Date(`${range.startDate}T00:00:00`).toISOString(),
      to: new Date(`${range.endDate}T23:59:59.999`).toISOString(),
    }
  }
  const days = USAGE_PRESET_DAYS[range.preset ?? '7d'] ?? 7
  return {
    from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString(),
    to: now.toISOString(),
  }
}

function formatMoney(amount: string, symbol: string): string {
  const num = parseFloat(amount)
  if (isNaN(num)) return `${symbol}0.00`
  return `${symbol}${num.toFixed(4)}`
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// ─── Chart Colors ─────────────────────────────────────

// 指标配色与 KPI 卡片保持一致：消费=琥珀、请求=绿、Token=蓝
const METRIC_COLOR: Record<Metric, string> = {
  spend: 'var(--mg-warning)',
  requests: 'var(--mg-success)',
  tokens: 'var(--mg-info)',
}

const TOOLTIP_STYLE = {
  background: 'var(--mg-bg-1)',
  border: '1px solid var(--mg-border)',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 12px',
  fontSize: '12px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
} as const

// ─── Sparkline (Recharts Area) ────────────────────────

interface SparklineProps {
  data: SeriesDataPoint[]
  metric: Metric
  noDataLabel: string
  currencySymbol: string
}

interface SparklineTooltipProps {
  active?: boolean
  payload?: Array<{ payload: SeriesDataPoint }>
  metric: Metric
  currencySymbol: string
}

function SparklineTooltip({ active, payload, metric, currencySymbol }: SparklineTooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const val = parseFloat(d.value) || 0
  const formatted =
    metric === 'spend'
      ? `${currencySymbol}${val.toFixed(4)}`
      : `${formatNumber(Math.round(val))}${metric === 'tokens' ? ' tokens' : ' 次'}`
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ fontWeight: 700, color: METRIC_COLOR[metric as Metric], marginBottom: '2px' }}>
        {formatted}
      </div>
      <div style={{ color: 'var(--mg-text-2)', fontSize: '11px' }}>
        {formatChartTooltipDate(d.bucket_start)}
      </div>
    </div>
  )
}

function Sparkline({ data, metric, noDataLabel, currencySymbol }: SparklineProps) {
  if (data.length === 0) {
    return (
      <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mg-text-2)', fontSize: '13px' }}>
        {noDataLabel}
      </div>
    )
  }

  const color = METRIC_COLOR[metric]
  const gradientId = `grad-${metric}`

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="0" stroke="var(--mg-fill-0)" vertical={false} />
        <XAxis
          dataKey="bucket_start"
          tickFormatter={formatChartTooltipDate}
          tick={{ fontSize: 11, fill: 'var(--mg-text-2)', fontFamily: 'var(--font-sans)' }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <Tooltip
          content={<SparklineTooltip metric={metric} currencySymbol={currencySymbol} />}
          cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '4 3', strokeOpacity: 0.6 }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 5, fill: color, stroke: 'var(--mg-bg-0)', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Histogram (Recharts Bar) ─────────────────────────

interface HistogramChartProps {
  buckets: { bucket_start: string; count: number }[]
  noDataLabel: string
}

interface HistogramTooltipProps {
  active?: boolean
  payload?: Array<{ payload: { bucket_start: string; count: number } }>
}

function HistogramTooltip({ active, payload }: HistogramTooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ fontWeight: 700, color: 'var(--mg-primary)', marginBottom: '2px' }}>
        {d.count.toLocaleString()} 次
      </div>
      <div style={{ color: 'var(--mg-text-2)', fontSize: '11px' }}>
        {formatChartTooltipDate(d.bucket_start)}
      </div>
    </div>
  )
}

function HistogramChart({ buckets, noDataLabel }: HistogramChartProps) {
  if (buckets.length === 0) {
    return (
      <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mg-text-2)', fontSize: '13px' }}>
        {noDataLabel}
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={buckets} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
        <CartesianGrid strokeDasharray="0" stroke="var(--mg-fill-0)" vertical={false} />
        <XAxis
          dataKey="bucket_start"
          tickFormatter={formatChartTooltipDate}
          tick={{ fontSize: 11, fill: 'var(--mg-text-2)', fontFamily: 'var(--font-sans)' }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <Tooltip
          content={<HistogramTooltip />}
          cursor={{ fill: 'var(--mg-fill-0)', opacity: 0.6 }}
        />
        <Bar
          dataKey="count"
          fill="var(--mg-primary)"
          opacity={0.75}
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Metric Tab ───────────────────────────────────────

interface MetricTabProps {
  label: string
  active: boolean
  onClick: () => void
}

function MetricTab({ label, active, onClick }: MetricTabProps) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 20px',
        borderRadius: 'var(--radius-sm)',
        border: 'none',
        background: active ? 'var(--mg-bg-1)' : 'transparent',
        color: active ? 'var(--mg-text-0)' : 'var(--mg-text-1)',
        fontSize: '13.5px',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        boxShadow: active ? '0 1px 4px rgba(15,23,42,0.06)' : 'none',
      }}
    >
      {label}
    </button>
  )
}

// ─── Rankings Table ───────────────────────────────────

interface RankingsTableProps {
  title: string
  icon: React.ReactNode
  items: Array<{
    rank?: number
    name?: string
    key?: string
    spend?: { amount: string; currency: string }
    requests?: number
    tokens?: number
    share_percent?: number
  }>
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  currencySymbol: string
  showModelIcon?: boolean
}

function RankingsTable({
  title,
  icon,
  items,
  isLoading,
  isError,
  onRetry,
  currencySymbol,
  showModelIcon,
}: RankingsTableProps) {
  const { t } = useTranslation()

  return (
    <Card className="p-0 flex flex-col overflow-hidden">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '16px 20px',
          borderBottom: '1px solid var(--mg-border)',
        }}
      >
        <span style={{ color: 'var(--mg-text-2)', display: 'flex', alignItems: 'center' }}>{icon}</span>
        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--mg-text-0)' }}>{title}</span>
      </div>

      {/* Body */}
      {isError ? (
        <div
          style={{
            color: 'var(--mg-danger)',
            fontSize: '13px',
            textAlign: 'center',
            padding: '32px 0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          {t('usage.error.rankings')}
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('usage.retry')}
          </Button>
        </div>
      ) : isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '120px' }}>
          <div className="w-7 h-7 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={t('usage.rankings.empty')}
          description={t('usage.rankings.emptyDesc')}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">{t('usage.rankings.col.rank')}</TableHead>
              <TableHead>{t('usage.rankings.col.name')}</TableHead>
              <TableHead align="right">{t('usage.rankings.col.spend')}</TableHead>
              <TableHead align="right">{t('usage.rankings.col.requests')}</TableHead>
              <TableHead align="right">{t('usage.rankings.col.tokens')}</TableHead>
              <TableHead align="right">{t('usage.rankings.col.share')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, idx) => {
              const rankNum = item.rank ?? idx + 1
              const spendAmt = item.spend?.amount
                ? formatMoney(item.spend.amount, currencySymbol)
                : '—'
              const reqStr = item.requests != null ? formatNumber(item.requests) : '—'
              const tokStr = item.tokens != null ? formatNumber(item.tokens) : '—'
              const shareStr =
                item.share_percent != null ? `${item.share_percent.toFixed(1)}%` : '—'
              const displayName = item.name || item.key || '—'

              return (
                <TableRow key={item.key ?? idx}>
                  <TableCell>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '22px',
                        height: '22px',
                        borderRadius: 'var(--radius-sm)',
                        background: rankNum <= 3 ? 'var(--mg-primary)' : 'var(--mg-fill-1)',
                        color: rankNum <= 3 ? 'var(--mg-on-primary)' : 'var(--mg-text-2)',
                        fontSize: '11px',
                        fontWeight: 700,
                      }}
                    >
                      {rankNum}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      style={{
                        maxWidth: '200px',
                        display: showModelIcon ? 'inline-flex' : 'block',
                        alignItems: showModelIcon ? 'center' : undefined,
                        gap: showModelIcon ? '8px' : undefined,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--mg-text-0)',
                        fontWeight: 500,
                      }}
                      title={displayName}
                    >
                      {showModelIcon && (
                        <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
                          <ModelIcon
                            model={{ display_name: displayName, vendor: item.name || item.key || '' }}
                            size={18}
                            rounded="rounded-md"
                          />
                        </span>
                      )}
                      {displayName}
                    </span>
                  </TableCell>
                  <TableCell align="right">{spendAmt}</TableCell>
                  <TableCell align="right">{reqStr}</TableCell>
                  <TableCell align="right">{tokStr}</TableCell>
                  <TableCell align="right">
                    <span style={{ color: 'var(--mg-text-2)' }}>{shareStr}</span>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────

export default function UsagePage() {
  const { t } = useTranslation()
  const [timeRange, setTimeRange] = useState<DateRangeValue>({ preset: '7d' })
  const [metric, setMetric] = useState<Metric>('spend')
  // '' means "all" for workspace/api-key filters
  const [filterWorkspaceId, setFilterWorkspaceId] = useState<string>('')
  const [filterApiKeyId, setFilterApiKeyId] = useState<string>('')

  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const { symbol: currencySymbol } = useCurrency()

  const USAGE_PRESETS = [
    { key: '7d', label: t('usage.range.7d') },
    { key: '30d', label: t('usage.range.30d') },
    { key: '90d', label: t('usage.range.90d') },
    { key: 'custom', label: t('usage.range.custom') },
  ]
  const METRIC_LABELS: Record<Metric, string> = {
    spend: t('usage.metric.spend'),
    requests: t('usage.metric.requests'),
    tokens: t('usage.metric.tokens'),
  }

  // 必须 memo：rangeToDates 内部用 new Date()，直接调用会每次渲染产出新的 from/to，
  // 导致 query key 每帧都变 → react-query 无限重拉（疯狂重试）。仅在 timeRange 变化时重算。
  const { from, to } = useMemo(() => rangeToDates(timeRange), [timeRange])
  const rangeReady = timeRange.preset !== 'custom' || (!!timeRange.startDate && !!timeRange.endDate)

  // 当前时间范围的人话标签，给图表/排行标注，避免用户不知道看的是哪段
  const rangeLabel =
    timeRange.preset === 'custom' && timeRange.startDate && timeRange.endDate
      ? `${timeRange.startDate} ~ ${timeRange.endDate}`
      : (USAGE_PRESETS.find((p) => p.key === (timeRange.preset ?? '7d'))?.label ?? '')

  // 请求分布/趋势统一按天聚合（#195：hour 粒度会让同一天出现多根柱子）
  const granularity = 'day' as const

  // ── 筛选器数据 ─────────────────────────────────────

  // workspace_id 用于查询的实际值：筛选器有选 → 用筛选器值；否则用当前活跃 workspace
  const effectiveWorkspaceId = filterWorkspaceId || activeWorkspaceId || undefined

  const workspacesQuery = useQuery({
    queryKey: ['workspaces-for-filter', activeTenantId],
    queryFn: () => listWorkspaces(),
    enabled: !!activeTenantId,
    staleTime: 5 * 60 * 1000,
  })
  const workspaceList = workspacesQuery.data?.items ?? []

  // API Keys 列表根据筛选器选中的 workspace 加载（无选中时用活跃 workspace）
  const apiKeysQuery = useQuery({
    queryKey: ['api-keys-for-filter', effectiveWorkspaceId],
    queryFn: () => listApiKeys(effectiveWorkspaceId!).then(pageItems),
    enabled: !!effectiveWorkspaceId,
    staleTime: 5 * 60 * 1000,
  })
  const apiKeyList = apiKeysQuery.data ?? []

  // 切换 workspace 时清掉 api key 筛选（避免错误的 id 传给接口）
  function handleWorkspaceChange(val: string) {
    setFilterWorkspaceId(val === '__all__' ? '' : val)
    setFilterApiKeyId('')
  }

  function handleApiKeyChange(val: string) {
    setFilterApiKeyId(val === '__all__' ? '' : val)
  }

  // ── 通用查询参数 ──────────────────────────────────

  const commonParams = {
    from,
    to,
    workspace_id: filterWorkspaceId || activeWorkspaceId || undefined,
    api_key_id: filterApiKeyId || undefined,
  }

  const summaryQuery = useQuery({
    queryKey: ['usage-summary', activeTenantId, commonParams],
    queryFn: () => getUsageSummary(commonParams),
    enabled: !!activeTenantId && rangeReady,
  })

  const seriesQuery = useQuery({
    queryKey: ['usage-series', activeTenantId, commonParams, metric],
    queryFn: () =>
      getUsageSeries({
        ...commonParams,
        metric,
        granularity,
      }),
    enabled: !!activeTenantId && rangeReady,
  })

  const histogramQuery = useQuery({
    queryKey: ['log-histogram', activeTenantId, commonParams],
    queryFn: () =>
      getLogHistogram({
        workspace_id: commonParams.workspace_id,
        from,
        to,
        granularity,
      }),
    enabled: !!activeTenantId && rangeReady,
  })

  const rankingsApiKeysQuery = useQuery({
    queryKey: ['usage-rankings-api-keys', activeTenantId, commonParams],
    queryFn: () =>
      getUsageRankingsApiKeys({
        ...commonParams,
        limit: 10,
      }),
    enabled: !!activeTenantId && rangeReady,
  })

  const rankingsModelsQuery = useQuery({
    queryKey: ['usage-rankings-models', activeTenantId, commonParams],
    queryFn: () =>
      getUsageRankingsModels({
        ...commonParams,
        limit: 10,
      }),
    enabled: !!activeTenantId && rangeReady,
  })

  const summary = summaryQuery.data

  const seriesData = useMemo<SeriesDataPoint[]>(() => {
    const points = seriesQuery.data?.groups?.[0]?.points
    if (!points) return []
    return points.map((p) => ({
      bucket_start: p.bucket_start,
      value: metric === 'spend'
        ? (p.spend?.amount ?? '0')
        : String(metric === 'requests' ? (p.requests ?? 0) : (p.tokens ?? 0)),
    }))
  }, [seriesQuery.data, metric])

  const kpiSpend = summary
    ? formatMoney(summary.total.spend.amount, currencySymbol)
    : '—'
  const kpiRequests = summary ? formatNumber(summary.total.requests) : '—'

  // ── 筛选栏 UI ─────────────────────────────────────

  const filterBar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      {/* 项目下拉 */}
      <Select
        value={filterWorkspaceId === '' ? '__all__' : filterWorkspaceId}
        onChange={handleWorkspaceChange}
        placeholder={t('usage.filter.allWorkspaces')}
        className="h-9 text-sm w-40"
      >
        <Select.Option value="__all__">{t('usage.filter.allWorkspaces')}</Select.Option>
        {workspaceList.map((ws) => (
          <Select.Option key={ws.workspace_id} value={ws.workspace_id}>
            {ws.name}
          </Select.Option>
        ))}
      </Select>

      {/* API Key 下拉 */}
      <Select
        value={filterApiKeyId === '' ? '__all__' : filterApiKeyId}
        onChange={handleApiKeyChange}
        placeholder={t('usage.filter.allKeys')}
        className="h-9 text-sm w-44"
        disabled={!effectiveWorkspaceId}
      >
        <Select.Option value="__all__">{t('usage.filter.allKeys')}</Select.Option>
        {apiKeyList.map((key) => (
          <Select.Option key={key.api_key_id} value={key.api_key_id}>
            {key.name || key.masked}
          </Select.Option>
        ))}
      </Select>

      <DateRangePicker
        value={timeRange}
        onChange={setTimeRange}
        presets={USAGE_PRESETS}
        placeholder={t('usage.customRange.placeholder')}
      />
    </div>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('usage.title')}
        description={t('usage.desc')}
      />

      {/* 筛选栏：项目 / API Key / 时间范围，独立一行铺开（不再挤在标题右上角） */}
      {filterBar}

      {/* KPI 卡片行 */}
      {summaryQuery.isError ? (
        <div style={{ color: 'var(--mg-danger)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          {t('usage.error.summary')}
          <Button variant="outline" size="sm" onClick={() => summaryQuery.refetch()}>{t('usage.retry')}</Button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {summaryQuery.isLoading ? (
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '96px' }}>
              <div className="w-8 h-8 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <KpiCard
                label={t('usage.kpi.spend')}
                value={kpiSpend}
                color="var(--mg-warning)"
                glowColor="rgba(245, 158, 11, 0.12)"
                hoverBorderClass="hover:border-amber-500/30"
                icon={<LuTrendingUp size={16} />}
              />
              <KpiCard
                label={t('usage.kpi.requests')}
                value={kpiRequests}
                color="var(--mg-success)"
                glowColor="rgba(16, 185, 129, 0.12)"
                hoverBorderClass="hover:border-emerald-500/30"
                icon={<LuActivity size={16} />}
              />
              <KpiCard
                label={t('usage.kpi.tokens')}
                value={summary ? formatNumber(summary.total.tokens) : '—'}
                sub={summary ? `${t('usage.metric.requests').toLowerCase()}: ${formatNumber(summary.total.input_tokens)} · ${formatNumber(summary.total.output_tokens)}` : undefined}
                color="var(--mg-info)"
                glowColor="rgba(59, 130, 246, 0.12)"
                hoverBorderClass="hover:border-blue-500/30"
                icon={<LuDatabase size={16} />}
              />
            </>
          )}
        </div>
      )}

      {/* 折线图区域 */}
      <Card className="p-6 flex flex-col">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--mg-text-0)' }}>
            {t('usage.chart.trendTitle', { metric: METRIC_LABELS[metric] })}
            <span style={{ marginLeft: '8px', fontSize: '12px', fontWeight: 400, color: 'var(--mg-text-2)' }}>· {rangeLabel}</span>
          </div>
          <div style={{ display: 'flex', gap: '4px', background: 'var(--mg-bg-1)', padding: '3px', borderRadius: 'var(--radius-sm)' }}>
            {(['spend', 'requests', 'tokens'] as Metric[]).map((m) => (
              <MetricTab key={m} label={METRIC_LABELS[m]} active={metric === m} onClick={() => setMetric(m)} />
            ))}
          </div>
        </div>

        {seriesQuery.isError ? (
          <div style={{ color: 'var(--mg-danger)', fontSize: '13px', textAlign: 'center', padding: '40px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            {t('usage.error.series')}
            <Button variant="outline" size="sm" onClick={() => seriesQuery.refetch()}>{t('usage.retry')}</Button>
          </div>
        ) : seriesQuery.isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
            <div className="w-8 h-8 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
          </div>
        ) : (
          <div style={{ width: '100%' }}>
            <Sparkline
              data={seriesData}
              metric={metric}
              noDataLabel={t('usage.noData')}
              currencySymbol={currencySymbol}
            />
          </div>
        )}
      </Card>

      {/* 请求分布直方图 */}
      <Card className="p-6 flex flex-col">
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--mg-text-0)', marginBottom: '20px' }}>
          {t('usage.chart.histogramTitle')}
          <span style={{ marginLeft: '8px', fontSize: '12px', fontWeight: 400, color: 'var(--mg-text-2)' }}>· {rangeLabel}</span>
        </div>
        {histogramQuery.isError ? (
          <div style={{ color: 'var(--mg-danger)', fontSize: '13px', textAlign: 'center', padding: '40px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            {t('usage.error.histogram')}
            <Button variant="outline" size="sm" onClick={() => histogramQuery.refetch()}>{t('usage.retry')}</Button>
          </div>
        ) : histogramQuery.isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '160px' }}>
            <div className="w-8 h-8 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
          </div>
        ) : (
          <div style={{ width: '100%' }}>
            <HistogramChart
              buckets={histogramQuery.data?.buckets ?? []}
              noDataLabel={t('usage.noData')}
            />
          </div>
        )}
      </Card>

      {/* 用量排行 */}
      <div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--mg-text-0)', marginBottom: '16px' }}>
          {t('usage.rankings.title')}
          <span style={{ marginLeft: '8px', fontSize: '12px', fontWeight: 400, color: 'var(--mg-text-2)' }}>· {rangeLabel}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '16px' }}>
          <RankingsTable
            title={t('usage.rankings.topKeys')}
            icon={<LuKey size={15} />}
            items={rankingsApiKeysQuery.data?.items ?? []}
            isLoading={rankingsApiKeysQuery.isLoading}
            isError={rankingsApiKeysQuery.isError}
            onRetry={() => rankingsApiKeysQuery.refetch()}
            currencySymbol={currencySymbol}
          />
          <RankingsTable
            title={t('usage.rankings.topModels')}
            icon={<LuCpu size={15} />}
            items={rankingsModelsQuery.data?.items ?? []}
            isLoading={rankingsModelsQuery.isLoading}
            isError={rankingsModelsQuery.isError}
            onRetry={() => rankingsModelsQuery.refetch()}
            currencySymbol={currencySymbol}
            showModelIcon
          />
        </div>
      </div>
    </div>
  )
}
