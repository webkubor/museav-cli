import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer,
  AreaChart, Area,
  BarChart, Bar,
  XAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { getUsageSummary, getUsageSeries } from '@/services/usage'
import { getLogHistogram } from '@/services/logs'
import { useAuthStore } from '@/store/auth'
import { useCurrency } from '@/hooks/use-platform-config'
import type { SeriesDataPoint } from '@/types'
import { formatChartTooltipDate } from '@/lib/format-date'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card } from '@/components/ui/Card'
import { LuTrendingUp, LuActivity, LuDatabase } from 'react-icons/lu'

// ─── Types ───────────────────────────────────────────

type Range = '7d' | '30d' | '90d'
type Metric = 'spend' | 'requests' | 'tokens'

// ─── Helpers ─────────────────────────────────────────

function getRangeDates(range: Range): { from: string; to: string } {
  const now = new Date()
  const daysMap: Record<Range, number> = { '7d': 7, '30d': 30, '90d': 90 }
  const from = new Date(now.getTime() - daysMap[range] * 24 * 60 * 60 * 1000)
  return { 
    from: from.toISOString(), 
    to: now.toISOString() 
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

const METRIC_COLOR: Record<Metric, string> = {
  spend: 'var(--mg-primary)',
  requests: '#0ea5e9',
  tokens: 'var(--mg-success)',
}

const TOOLTIP_STYLE = {
  background: 'var(--mg-bg-1)',
  border: '1px solid var(--mg-border)',
  borderRadius: '8px',
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

function SparklineTooltip({ active, payload, metric, currencySymbol }: any) {
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
          tick={{ fontSize: 11, fill: 'var(--mg-text-2)', fontFamily: 'system-ui' }}
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

function HistogramTooltip({ active, payload }: any) {
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
          tick={{ fontSize: 11, fill: 'var(--mg-text-2)', fontFamily: 'system-ui' }}
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



// ─── Range Button ─────────────────────────────────────

interface RangeBtnProps {
  label: string
  active: boolean
  onClick: () => void
}

function RangeBtn({ label, active, onClick }: RangeBtnProps) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 16px',
        borderRadius: '20px',
        border: active ? '1px solid #1e293b' : '1px solid var(--mg-border)',
        background: active ? '#0f172a' : 'var(--mg-bg-0)',
        color: active ? 'var(--mg-bg-0)' : 'var(--mg-text-1)',
        fontSize: '13px',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      {label}
    </button>
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
        borderRadius: '8px',
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

// ─── Page ─────────────────────────────────────────────

const GRANULARITY_MAP: Record<Range, 'day' | 'day' | 'day'> = { '7d': 'day', '30d': 'day', '90d': 'day' }

export default function UsagePage() {
  const { t } = useTranslation()
  const [range, setRange] = useState<Range>('7d')
  const [metric, setMetric] = useState<Metric>('spend')

  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const { symbol: currencySymbol } = useCurrency()

  const RANGE_LABELS: Record<Range, string> = {
    '7d': t('usage.range.7d'),
    '30d': t('usage.range.30d'),
    '90d': t('usage.range.90d'),
  }
  const METRIC_LABELS: Record<Metric, string> = {
    spend: t('usage.metric.spend'),
    requests: t('usage.metric.requests'),
    tokens: t('usage.metric.tokens'),
  }

  const { from, to } = getRangeDates(range)

  const summaryQuery = useQuery({
    queryKey: ['usage-summary', activeTenantId, activeWorkspaceId, range],
    queryFn: () =>
      getUsageSummary({ workspace_id: activeWorkspaceId || undefined, from, to }),
    enabled: !!activeTenantId,
  })

  const seriesQuery = useQuery({
    queryKey: ['usage-series', activeTenantId, activeWorkspaceId, range, metric],
    queryFn: () =>
      getUsageSeries({
        workspace_id: activeWorkspaceId || undefined,
        from,
        to,
        metric,
        granularity: GRANULARITY_MAP[range],
      }),
    enabled: !!activeTenantId,
  })

  const histogramQuery = useQuery({
    queryKey: ['log-histogram', activeTenantId, activeWorkspaceId, range],
    queryFn: () =>
      getLogHistogram({
        workspace_id: activeWorkspaceId || undefined,
        from,
        to,
        granularity: range === '7d' ? 'hour' : 'day',
      }),
    enabled: !!activeTenantId,
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

  return (
    <div>
      {/* 页面头部 */}
      <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1
            style={{
              fontSize: '24px',
              fontWeight: 700,
              color: 'var(--mg-text-0)',
              margin: '0 0 6px 0',
              letterSpacing: '-0.02em',
            }}
          >
            {t('usage.title')}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--mg-text-1)', margin: 0, fontWeight: 400 }}>
            {t('usage.desc')}
          </p>
        </div>

        {/* 时间范围选择 */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {(['7d', '30d', '90d'] as Range[]).map((r) => (
            <RangeBtn key={r} label={RANGE_LABELS[r]} active={range === r} onClick={() => setRange(r)} />
          ))}
        </div>
      </div>

      {/* KPI 卡片行 */}
      {summaryQuery.isError ? (
        <div style={{ color: 'var(--mg-danger)', fontSize: '13px', marginBottom: '24px' }}>
          {t('usage.error.summary')}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {summaryQuery.isLoading ? (
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '96px' }}>
              <div className="w-8 h-8 border-2 border-gray-200 border-t-brand-base rounded-full animate-spin" />
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
                color="#3b82f6"
                glowColor="rgba(59, 130, 246, 0.12)"
                hoverBorderClass="hover:border-blue-500/30"
                icon={<LuDatabase size={16} />}
              />
            </>
          )}
        </div>
      )}

      {/* 折线图区域 */}
      <Card className="p-6 mb-4 flex flex-col">
        {/* 指标切换 Tab */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--mg-text-0)' }}>
            {t('usage.chart.trendTitle', { metric: METRIC_LABELS[metric] })}
          </div>
          <div style={{ display: 'flex', gap: '4px', background: 'var(--mg-bg-1)', padding: '3px', borderRadius: '10px' }}>
            {(['spend', 'requests', 'tokens'] as Metric[]).map((m) => (
              <MetricTab key={m} label={METRIC_LABELS[m]} active={metric === m} onClick={() => setMetric(m)} />
            ))}
          </div>
        </div>

        {/* 图表内容 */}
        {seriesQuery.isError ? (
          <div style={{ color: 'var(--mg-danger)', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>
            {t('usage.error.series')}
          </div>
        ) : seriesQuery.isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
            <div className="w-8 h-8 border-2 border-gray-200 border-t-brand-base rounded-full animate-spin" />
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

      {/* {t('usage.chart.histogramTitle')}直方图 */}
      <Card className="p-6 flex flex-col">
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--mg-text-0)', marginBottom: '20px' }}>
          {t('usage.chart.histogramTitle')}
        </div>
        {histogramQuery.isError ? (
          <div style={{ color: 'var(--mg-danger)', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>
            {t('usage.error.histogram')}
          </div>
        ) : histogramQuery.isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '160px' }}>
            <div className="w-8 h-8 border-2 border-gray-200 border-t-brand-base rounded-full animate-spin" />
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
    </div>
  )
}
