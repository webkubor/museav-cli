/**
 * 用量分析图表组件
 * 路由：/usage
 * API 来源：GET /usage/series、GET /logs/histogram
 */

import {
  ResponsiveContainer,
  AreaChart, Area,
  BarChart, Bar,
  XAxis, CartesianGrid, Tooltip, Legend,
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
  requestUnitLabel: string
  tokenUnitLabel: string
  /** 趋势点下钻：点击某天 → 携带该日期跳调用日志（bucket_start）。 */
  onPointClick?: (bucketStart: string) => void
}

/** recharts chart onClick 回调里取被点中的 x 轴值（bucket_start）。 */
type ChartClickState = { activeLabel?: string | number } | null
function pickBucketFromClick(state: ChartClickState, onPointClick?: (bucketStart: string) => void) {
  if (!onPointClick) return
  const label = state?.activeLabel
  if (label !== undefined && label !== null && label !== '') onPointClick(String(label))
}

interface SparklineTooltipProps {
  active?: boolean
  payload?: Array<{ payload: SeriesDataPoint }>
  metric: Metric
  currencySymbol: string
  requestUnitLabel: string
  tokenUnitLabel: string
}

function SparklineTooltip({
  active,
  payload,
  metric,
  currencySymbol,
  requestUnitLabel,
  tokenUnitLabel,
}: SparklineTooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const val = parseFloat(d.value) || 0
  const formatted =
    metric === 'spend'
      ? `${currencySymbol}${val.toFixed(4)}`
      : `${formatNumber(Math.round(val))} ${metric === 'tokens' ? tokenUnitLabel : requestUnitLabel}`
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ fontWeight: 700, color: METRIC_COLOR[metric as Metric], marginBottom: '2px' }}>
        {formatted}
      </div>
      <div style={{ color: 'var(--mg-text-3)', fontSize: '12px' }}>
        {formatChartTooltipDate(d.bucket_start)}
      </div>
    </div>
  )
}

export function Sparkline({
  data,
  metric,
  noDataLabel,
  currencySymbol,
  requestUnitLabel,
  tokenUnitLabel,
  onPointClick,
}: SparklineProps) {
  if (data.length === 0) {
    return (
      <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mg-text-3)', fontSize: '13px' }}>
        {noDataLabel}
      </div>
    )
  }

  const color = METRIC_COLOR[metric]
  const gradientId = `grad-${metric}`

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart
        data={data}
        margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
        onClick={(state) => pickBucketFromClick(state as ChartClickState, onPointClick)}
        style={onPointClick ? { cursor: 'pointer' } : undefined}
      >
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
          tick={{ fontSize: 11, fill: 'var(--mg-text-3)', fontFamily: 'var(--font-sans)' }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <Tooltip
          content={(
            <SparklineTooltip
              metric={metric}
              currencySymbol={currencySymbol}
              requestUnitLabel={requestUnitLabel}
              tokenUnitLabel={tokenUnitLabel}
            />
          )}
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

// ─── Grouped Area (多序列堆叠，group_by=model/provider/workspace) ───────

export interface GroupedSeries {
  key: string
  label: string
  color: string
}

export type GroupedRow = Record<string, number | string> & { bucket_start: string }

interface GroupedAreaChartProps {
  rows: GroupedRow[]
  series: GroupedSeries[]
  metric: Metric
  noDataLabel: string
  currencySymbol: string
  requestUnitLabel: string
  tokenUnitLabel: string
  /** 趋势点下钻：点击某天 → 携带该日期跳调用日志（bucket_start）。 */
  onPointClick?: (bucketStart: string) => void
}

interface GroupedTooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string; dataKey: string }>
  label?: string
  series: GroupedSeries[]
  metric: Metric
  currencySymbol: string
  requestUnitLabel: string
  tokenUnitLabel: string
}

function formatMetricValue(
  value: number,
  metric: Metric,
  currencySymbol: string,
  requestUnitLabel: string,
  tokenUnitLabel: string,
): string {
  if (metric === 'spend') return `${currencySymbol}${value.toFixed(4)}`
  return `${formatNumber(Math.round(value))} ${metric === 'tokens' ? tokenUnitLabel : requestUnitLabel}`
}

function GroupedTooltip({
  active,
  payload,
  label,
  series,
  metric,
  currencySymbol,
  requestUnitLabel,
  tokenUnitLabel,
}: GroupedTooltipProps) {
  if (!active || !payload?.length) return null
  const labelByKey = new Map(series.map((s) => [s.key, s.label]))
  // 大额在上；总量单独一行
  const rows = [...payload].filter((p) => (p.value ?? 0) > 0).sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  const total = payload.reduce((sum, p) => sum + (p.value ?? 0), 0)
  return (
    <div style={{ ...TOOLTIP_STYLE, minWidth: 160 }}>
      <div style={{ color: 'var(--mg-text-3)', fontSize: '12px', marginBottom: 6 }}>
        {label ? formatChartTooltipDate(label) : ''}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {rows.map((p) => (
          <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--mg-text-2)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 130 }}>
              {labelByKey.get(p.dataKey) ?? p.name}
            </span>
            <span style={{ color: 'var(--mg-text-1)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {formatMetricValue(p.value ?? 0, metric, currencySymbol, requestUnitLabel, tokenUnitLabel)}
            </span>
          </div>
        ))}
      </div>
      {rows.length > 1 && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--mg-border)', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
          <span style={{ color: 'var(--mg-text-3)' }}>Σ</span>
          <span style={{ color: 'var(--mg-text-1)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {formatMetricValue(total, metric, currencySymbol, requestUnitLabel, tokenUnitLabel)}
          </span>
        </div>
      )}
    </div>
  )
}

export function GroupedAreaChart({
  rows,
  series,
  metric,
  noDataLabel,
  currencySymbol,
  requestUnitLabel,
  tokenUnitLabel,
  onPointClick,
}: GroupedAreaChartProps) {
  if (rows.length === 0 || series.length === 0) {
    return (
      <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mg-text-3)', fontSize: '13px' }}>
        {noDataLabel}
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart
        data={rows}
        margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
        onClick={(state) => pickBucketFromClick(state as ChartClickState, onPointClick)}
        style={onPointClick ? { cursor: 'pointer' } : undefined}
      >
        <CartesianGrid strokeDasharray="0" stroke="var(--mg-fill-0)" vertical={false} />
        <XAxis
          dataKey="bucket_start"
          tickFormatter={formatChartTooltipDate}
          tick={{ fontSize: 11, fill: 'var(--mg-text-3)', fontFamily: 'var(--font-sans)' }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <Tooltip
          content={(
            <GroupedTooltip
              series={series}
              metric={metric}
              currencySymbol={currencySymbol}
              requestUnitLabel={requestUnitLabel}
              tokenUnitLabel={tokenUnitLabel}
            />
          )}
          cursor={{ stroke: 'var(--mg-text-3)', strokeWidth: 1, strokeDasharray: '4 3', strokeOpacity: 0.5 }}
        />
        {/* ≥2 序列必带图例（颜色非唯一标识依据），名称走各序列 label */}
        <Legend
          verticalAlign="bottom"
          height={28}
          iconType="circle"
          iconSize={8}
          formatter={(value: string) => {
            const s = series.find((it) => it.key === value)
            return <span style={{ color: 'var(--mg-text-2)', fontSize: 12 }}>{s?.label ?? value}</span>
          }}
        />
        {series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            stackId="usage"
            dataKey={s.key}
            name={s.key}
            stroke={s.color}
            strokeWidth={1.5}
            fill={s.color}
            fillOpacity={0.7}
            dot={false}
            activeDot={{ r: 3, fill: s.color, stroke: 'var(--mg-bg-0)', strokeWidth: 1.5 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Histogram (Recharts Bar) ─────────────────────────

interface HistogramChartProps {
  buckets: { bucket_start: string; count: number }[]
  noDataLabel: string
  requestUnitLabel: string
}

interface HistogramTooltipProps {
  active?: boolean
  payload?: Array<{ payload: { bucket_start: string; count: number } }>
  requestUnitLabel: string
}

function HistogramTooltip({ active, payload, requestUnitLabel }: HistogramTooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ fontWeight: 700, color: 'var(--mg-primary)', marginBottom: '2px' }}>
        {d.count.toLocaleString()} {requestUnitLabel}
      </div>
      <div style={{ color: 'var(--mg-text-3)', fontSize: '12px' }}>
        {formatChartTooltipDate(d.bucket_start)}
      </div>
    </div>
  )
}

export function HistogramChart({ buckets, noDataLabel, requestUnitLabel }: HistogramChartProps) {
  if (buckets.length === 0) {
    return (
      <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mg-text-3)', fontSize: '13px' }}>
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
          tick={{ fontSize: 11, fill: 'var(--mg-text-3)', fontFamily: 'var(--font-sans)' }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <Tooltip
          content={<HistogramTooltip requestUnitLabel={requestUnitLabel} />}
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
        color: active ? 'var(--mg-text-1)' : 'var(--mg-text-2)',
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
