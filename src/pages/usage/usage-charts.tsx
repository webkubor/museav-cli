import {
  ResponsiveContainer,
  AreaChart, Area,
  BarChart, Bar,
  XAxis, CartesianGrid, Tooltip,
} from 'recharts'
import type { SeriesDataPoint } from '@/types'
import { formatChartTooltipDate } from '@/lib/format-date'
import { type Metric, formatNumber } from './usage-utils'

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

export function Sparkline({ data, metric, noDataLabel, currencySymbol }: SparklineProps) {
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

export function HistogramChart({ buckets, noDataLabel }: HistogramChartProps) {
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

export function MetricTab({ label, active, onClick }: MetricTabProps) {
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
