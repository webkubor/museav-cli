import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
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

// ─── SVG Sparkline ───────────────────────────────────

interface SparklineProps {
  data: SeriesDataPoint[]
  width: number
  height: number
  metric: Metric
  noDataLabel: string
}

function Sparkline({ data, width, height, metric, noDataLabel }: SparklineProps) {
  const points = useMemo(() => {
    if (data.length === 0) return { path: '', dots: [], labels: [] }

    const values = data.map((d) => parseFloat(d.value) || 0)
    const minVal = Math.min(...values)
    const maxVal = Math.max(...values)
    const range = maxVal - minVal || 1

    const padX = 40
    const padTop = 12
    const padBottom = 28
    const innerW = width - padX * 2
    const innerH = height - padTop - padBottom

    const coords = values.map((v, i) => ({
      x: padX + (i / Math.max(values.length - 1, 1)) * innerW,
      y: padTop + ((maxVal - v) / range) * innerH,
      v,
      ts: data[i].bucket_start,
    }))

    const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ')

    const labelIndices = [0, Math.floor((coords.length - 1) / 2), coords.length - 1].filter(
      (v, i, arr) => arr.indexOf(v) === i
    )
    const labels = labelIndices.map((idx) => ({
      x: coords[idx].x,
      text: formatChartTooltipDate(coords[idx].ts),
    }))

    return { path, dots: coords, labels }
  }, [data, width, height])

  if (data.length === 0) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--mg-text-2)',
          fontSize: '13px',
        }}
      >
        {noDataLabel}
      </div>
    )
  }

  const lineColor = metric === 'spend'
    ? 'var(--mg-primary)'
    : metric === 'requests' ? '#0ea5e9' : 'var(--mg-success)'
  const dotColor = lineColor
  const areaId = `area-${metric}`

  const firstPt = points.dots[0]
  const lastPt = points.dots[points.dots.length - 1]
  const areaPath =
    points.path +
    ` L ${lastPt.x.toFixed(1)} ${height - 28} L ${firstPt.x.toFixed(1)} ${height - 28} Z`

  return (
    <svg 
      width="100%" 
      height={height} 
      viewBox={`0 0 ${width} ${height}`} 
      preserveAspectRatio="none" 
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.18" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0.25, 0.5, 0.75, 1].map((frac) => {
        const y = 12 + frac * (height - 40)
        return (
          <line
            key={frac}
            x1={40}
            y1={y}
            x2={width - 40}
            y2={y}
            stroke="var(--mg-fill-0)"
            strokeWidth={1}
          />
        )
      })}

      <path d={areaPath} fill={`url(#${areaId})`} />
      <path d={points.path} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

      {points.dots.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={3} fill={dotColor} stroke="var(--mg-bg-0)" strokeWidth={1.5} />
      ))}

      {points.labels.map((l, i) => (
        <text
          key={i}
          x={l.x}
          y={height - 6}
          textAnchor="middle"
          fontSize={11}
          fill="var(--mg-text-2)"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {l.text}
        </text>
      ))}
    </svg>
  )
}

// ─── Histogram Bar Chart ─────────────────────────────

interface HistogramChartProps {
  buckets: { bucket_start: string; count: number }[]
  width: number
  height: number
  noDataLabel: string
}

function HistogramChart({ buckets, width, height, noDataLabel }: HistogramChartProps) {
  const bars = useMemo(() => {
    if (buckets.length === 0) return { items: [], labels: [] }
    const maxCount = Math.max(...buckets.map((b) => b.count), 1)
    const padX = 40
    const padTop = 12
    const padBottom = 28
    const innerW = width - padX * 2
    const innerH = height - padTop - padBottom
    const barW = Math.max(2, innerW / buckets.length - 1)

    const items = buckets.map((b, i) => ({
      x: padX + (i / buckets.length) * innerW,
      h: (b.count / maxCount) * innerH,
      count: b.count,
      ts: b.bucket_start,
    }))

    const labelIndices = [0, Math.floor((buckets.length - 1) / 2), buckets.length - 1].filter(
      (v, i, arr) => arr.indexOf(v) === i
    )
    const labels = labelIndices.map((idx) => ({
      x: items[idx].x + barW / 2,
      text: formatChartTooltipDate(buckets[idx].bucket_start),
    }))

    return { items, barW, labels, innerH, padTop }
  }, [buckets, width, height])

  if (buckets.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mg-text-2)', fontSize: '13px' }}>
        {noDataLabel}
      </div>
    )
  }

  const { items, barW, labels } = bars as any

  return (
    <svg 
      width="100%" 
      height={height} 
      viewBox={`0 0 ${width} ${height}`} 
      preserveAspectRatio="none" 
      style={{ display: 'block' }}
    >
      {[0.25, 0.5, 0.75, 1].map((frac) => {
        const y = 12 + frac * (height - 40)
        return (
          <line key={frac} x1={40} y1={y} x2={width - 40} y2={y} stroke="var(--mg-fill-0)" strokeWidth={1} />
        )
      })}
      {items.map((bar: any, i: number) => (
        <rect
          key={i}
          x={bar.x}
          y={height - 28 - bar.h}
          width={barW}
          height={bar.h}
          rx={2}
          style={{ fill: 'var(--mg-primary)' }}
          opacity={0.75}
        />
      ))}
      {labels.map((l: any, i: number) => (
        <text key={i} x={l.x} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--mg-text-2)" fontFamily="system-ui, -apple-system, sans-serif">
          {l.text}
        </text>
      ))}
    </svg>
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
              width={900}
              height={220}
              metric={metric}
              noDataLabel={t('usage.noData')}
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
              width={900}
              height={160}
              noDataLabel={t('usage.noData')}
            />
          </div>
        )}
      </Card>
    </div>
  )
}
