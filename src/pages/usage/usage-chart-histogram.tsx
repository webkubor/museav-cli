/**
 * 请求量直方图（Recharts Bar）。
 * 路由：/usage、/logs
 * API 来源：GET /logs/histogram
 */

import {
  ResponsiveContainer,
  BarChart, Bar,
  XAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { formatChartTooltipDate } from '@/lib/format-date'
import { TOOLTIP_STYLE } from './usage-chart-shared'

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
      <div className="text-mg-primary" style={{ fontWeight: 700, marginBottom: '2px' }}>
        {d.count.toLocaleString()} {requestUnitLabel}
      </div>
      <div className="text-mg-text-3" style={{ fontSize: '12px' }}>
        {formatChartTooltipDate(d.bucket_start)}
      </div>
    </div>
  )
}

export function HistogramChart({ buckets, noDataLabel, requestUnitLabel }: HistogramChartProps) {
  if (buckets.length === 0) {
    return (
      <div className="text-mg-text-3" style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px' }}>
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
