import { useState, useMemo } from 'react'
import { Spin } from '@douyinfe/semi-ui'
import { useQuery } from '@tanstack/react-query'
import { getUsageSummary, getUsageSeries } from '@/services/usage'
import { getLogHistogram } from '@/services/logs'
import { useAuthStore } from '@/store/auth'
import { useCurrency } from '@/hooks/use-platform-config'
import type { SeriesDataPoint } from '@/types'
import { formatChartTooltipDate } from '@/lib/format-date'

// ─── Types ───────────────────────────────────────────

type Range = '7d' | '30d' | '90d'
type Metric = 'spend' | 'requests' | 'tokens'

// ─── Helpers ─────────────────────────────────────────

function getRangeDates(range: Range): { from: string; to: string } {
  const now = new Date()
  const daysMap: Record<Range, number> = { '7d': 7, '30d': 30, '90d': 90 }
  const from = new Date(now.getTime() - daysMap[range] * 24 * 60 * 60 * 1000).toISOString()
  return { from, to: now.toISOString() }
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
}

function Sparkline({ data, width, height, metric }: SparklineProps) {
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

    // X-axis labels: show first, middle, last
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
          color: 'var(--semi-color-text-2)',
          fontSize: '13px',
        }}
      >
        暂无数据
      </div>
    )
  }

  const lineColor = metric === 'spend'
    ? 'var(--semi-color-primary)'
    : metric === 'requests' ? '#0ea5e9' : '#10b981'
  const dotColor = lineColor
  const areaId = `area-${metric}`

  const firstPt = points.dots[0]
  const lastPt = points.dots[points.dots.length - 1]
  const areaPath =
    points.path +
    ` L ${lastPt.x.toFixed(1)} ${height - 28} L ${firstPt.x.toFixed(1)} ${height - 28} Z`

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.18" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {[0.25, 0.5, 0.75, 1].map((frac) => {
        const y = 12 + frac * (height - 40)
        return (
          <line
            key={frac}
            x1={40}
            y1={y}
            x2={width - 40}
            y2={y}
            stroke="var(--semi-color-fill-0)"
            strokeWidth={1}
          />
        )
      })}

      {/* Area fill */}
      <path d={areaPath} fill={`url(#${areaId})`} />

      {/* Line */}
      <path d={points.path} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

      {/* Dots */}
      {points.dots.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={3} fill={dotColor} stroke="var(--semi-color-bg-0)" strokeWidth={1.5} />
      ))}

      {/* X-axis labels */}
      {points.labels.map((l, i) => (
        <text
          key={i}
          x={l.x}
          y={height - 6}
          textAnchor="middle"
          fontSize={11}
          fill="var(--semi-color-text-2)"
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
}

function HistogramChart({ buckets, width, height }: HistogramChartProps) {
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
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--semi-color-text-2)', fontSize: '13px' }}>
        暂无数据
      </div>
    )
  }

  const { items, barW, labels } = bars as any

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {[0.25, 0.5, 0.75, 1].map((frac) => {
        const y = 12 + frac * (height - 40)
        return (
          <line key={frac} x1={40} y1={y} x2={width - 40} y2={y} stroke="var(--semi-color-fill-0)" strokeWidth={1} />
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
          style={{ fill: 'var(--semi-color-primary)' }}
          opacity={0.75}
        />
      ))}
      {labels.map((l: any, i: number) => (
        <text key={i} x={l.x} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--semi-color-text-2)" fontFamily="system-ui, -apple-system, sans-serif">
          {l.text}
        </text>
      ))}
    </svg>
  )
}

// ─── KPI Card ─────────────────────────────────────────

interface KpiCardProps {
  label: string
  value: string
  sub?: string
}

function KpiCard({ label, value, sub }: KpiCardProps) {
  return (
    <div
      style={{
        background: 'var(--semi-color-bg-0)',
        borderRadius: '12px',
        border: '1px solid var(--semi-color-fill-0)',
        padding: '24px',
        boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
        flex: 1,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--semi-color-text-2)', marginBottom: '10px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--semi-color-text-0)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: '12px', color: 'var(--semi-color-text-2)', marginTop: '6px' }}>{sub}</div>
      )}
    </div>
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
        border: active ? '1px solid #1e293b' : '1px solid var(--semi-color-border)',
        background: active ? '#0f172a' : 'var(--semi-color-bg-0)',
        color: active ? 'var(--semi-color-bg-0)' : 'var(--semi-color-text-1)',
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
        background: active ? 'var(--semi-color-bg-1)' : 'transparent',
        color: active ? 'var(--semi-color-text-0)' : 'var(--semi-color-text-1)',
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

const RANGE_LABELS: Record<Range, string> = { '7d': '近 7 天', '30d': '近 30 天', '90d': '近 90 天' }
const METRIC_LABELS: Record<Metric, string> = { spend: '消费', requests: '请求数', tokens: 'Token' }
const GRANULARITY_MAP: Record<Range, 'day' | 'day' | 'day'> = { '7d': 'day', '30d': 'day', '90d': 'day' }

export default function UsagePage() {
  const [range, setRange] = useState<Range>('7d')
  const [metric, setMetric] = useState<Metric>('spend')

  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const { symbol: currencySymbol } = useCurrency()

  const { from, to } = getRangeDates(range)

  const summaryQuery = useQuery({
    queryKey: ['usage-summary', activeWorkspaceId, range],
    queryFn: () =>
      getUsageSummary({ workspace_id: activeWorkspaceId ?? undefined, from, to }),
    enabled: true,
  })

  const seriesQuery = useQuery({
    queryKey: ['usage-series', activeWorkspaceId, range, metric],
    queryFn: () =>
      getUsageSeries({
        workspace_id: activeWorkspaceId ?? undefined,
        from,
        to,
        metric,
        granularity: GRANULARITY_MAP[range],
      }),
    enabled: true,
  })

  const histogramQuery = useQuery({
    queryKey: ['log-histogram', activeWorkspaceId, range],
    queryFn: () =>
      getLogHistogram({
        workspace_id: activeWorkspaceId ?? undefined,
        from,
        to,
        granularity: range === '7d' ? 'hour' : 'day',
      }),
    enabled: true,
  })

  const summary = summaryQuery.data
  const series = seriesQuery.data

  // ── KPI values
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
              color: 'var(--semi-color-text-0)',
              margin: '0 0 6px 0',
              letterSpacing: '-0.02em',
            }}
          >
            用量分析
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', margin: 0, fontWeight: 400 }}>
            查看 API 调用量、Token 消耗及费用趋势，帮助您精准掌握使用成本。
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
        <div style={{ color: '#ef4444', fontSize: '13px', marginBottom: '24px' }}>
          加载用量汇总失败，请稍后重试。
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {summaryQuery.isLoading ? (
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '96px' }}>
              <Spin size="large" />
            </div>
          ) : (
            <>
              <KpiCard label="总消费" value={kpiSpend} />
              <KpiCard label="总请求数" value={kpiRequests} />
              <KpiCard label="总 Token 数" value={summary ? formatNumber(summary.total.tokens) : '—'} sub={summary ? `输入 ${formatNumber(summary.total.input_tokens)} · 输出 ${formatNumber(summary.total.output_tokens)}` : undefined} />
            </>
          )}
        </div>
      )}

      {/* 折线图区域 */}
      <div
        style={{
          background: 'var(--semi-color-bg-0)',
          borderRadius: '12px',
          border: '1px solid var(--semi-color-fill-0)',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
          marginBottom: '16px',
        }}
      >
        {/* 指标切换 Tab */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--semi-color-text-0)' }}>
            {METRIC_LABELS[metric]}趋势
          </div>
          <div style={{ display: 'flex', gap: '4px', background: 'var(--semi-color-bg-1)', padding: '3px', borderRadius: '10px' }}>
            {(['spend', 'requests', 'tokens'] as Metric[]).map((m) => (
              <MetricTab key={m} label={METRIC_LABELS[m]} active={metric === m} onClick={() => setMetric(m)} />
            ))}
          </div>
        </div>

        {/* 图表内容 */}
        {seriesQuery.isError ? (
          <div style={{ color: '#ef4444', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>
            加载趋势数据失败，请稍后重试。
          </div>
        ) : seriesQuery.isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
            <Spin size="large" />
          </div>
        ) : (
          <div style={{ width: '100%' }}>
            <Sparkline
              data={series?.series ?? []}
              width={900}
              height={220}
              metric={metric}
            />
          </div>
        )}
      </div>

      {/* 请求分布直方图 */}
      <div
        style={{
          background: 'var(--semi-color-bg-0)',
          borderRadius: '12px',
          border: '1px solid var(--semi-color-fill-0)',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
        }}
      >
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--semi-color-text-0)', marginBottom: '20px' }}>
          请求分布
        </div>
        {histogramQuery.isError ? (
          <div style={{ color: '#ef4444', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>
            加载分布数据失败，请稍后重试。
          </div>
        ) : histogramQuery.isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '160px' }}>
            <Spin size="large" />
          </div>
        ) : (
          <div style={{ width: '100%' }}>
            <HistogramChart
              buckets={histogramQuery.data?.buckets ?? []}
              width={900}
              height={160}
            />
          </div>
        )}
      </div>
    </div>
  )
}
