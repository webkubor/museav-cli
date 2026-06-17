import { useTranslation } from 'react-i18next'
import { LuActivity } from 'react-icons/lu'
import React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts'
import { getLogHistogram } from '@/services/logs'
import { useAuthStore } from '@/store/auth'
import { Card } from '@/components/ui/Card'
import { formatChartTooltipDate } from '@/lib/format-date'
import { densifyDailyBuckets } from '@/lib/chart-buckets'
import type { HistogramBucket } from '@/types/logs'

const RANGE_DAYS = 5

interface HistogramTooltipProps {
  active?: boolean
  payload?: Array<{ payload: HistogramBucket }>
}

function HistogramTooltip({ active, payload }: HistogramTooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-md border border-mg-border bg-mg-bg-2/98 backdrop-blur-md p-3 shadow-[0_8px_30px_rgb(0,0,0,0.06)] text-left select-none min-w-[120px] space-y-1">
      <div className="text-[10px] text-mg-text-2 font-medium">请求次数</div>
      <div className="text-sm font-mono font-black text-brand-base tabular-nums">
        {d.count.toLocaleString()}
      </div>
      <div className="text-[10px] text-mg-text-2 font-semibold font-mono pt-1 border-t border-mg-border">
        {formatChartTooltipDate(d.bucket_start)}
      </div>
    </div>
  )
}

export const HistogramChartSection: React.FC = () => {
  const { t } = useTranslation()
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)

  const range = React.useMemo(() => {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - RANGE_DAYS)
    return { from: from.toISOString(), to: to.toISOString() }
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['usage', 'histogram', activeWorkspaceId],
    queryFn: () =>
      getLogHistogram({
        workspace_id: activeWorkspaceId ?? undefined,
        granularity: 'day',
        from: range.from,
        to: range.to,
      }),
    enabled: !!activeWorkspaceId,
    staleTime: 60_000,
  })

  // 后端按天稀疏返回 → 补齐到完整区间（缺失天 count=0），让“近 5 天”画满
  const buckets = React.useMemo(
    () =>
      densifyDailyBuckets<HistogramBucket>(
        data?.buckets ?? [],
        range.from,
        range.to,
        (bucket_start) => ({ bucket_start, count: 0 }) as HistogramBucket,
      ),
    [data?.buckets, range],
  )
  const maxCount = Math.max(...buckets.map((b) => b.count), 1)

  return (
    <Card className="p-6 flex flex-col h-full">
      <div className="mb-5">
        <h3 className="font-bold text-base text-mg-text-0 m-0">{t('dashboard.histogramChart.title')}</h3>
        <span className="text-xs text-mg-text-2 block mt-1">{t('dashboard.histogramChart.requestsLabel')}</span>
      </div>

      <div className="flex-1 outline-none select-none" style={{ minHeight: 200 }}>
        {isLoading ? (
          <div className="flex items-end gap-2 h-[200px] px-2">
            {[0.4, 0.7, 0.55, 0.85, 0.6].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-md animate-pulse bg-mg-fill-2"
                style={{ height: `${h * 100}%` }}
              />
            ))}
          </div>
        ) : buckets.length > 0 ? (
          <ResponsiveContainer width="100%" height={200} style={{ outline: 'none' }}>
            <BarChart data={buckets} margin={{ top: 4, right: 4, bottom: 0, left: -24 }} barCategoryGap="28%">
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.75} />
                </linearGradient>
                <linearGradient id="barGradActive" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818cf8" stopOpacity={1} />
                  <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.9} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="4 4"
                stroke="var(--mg-border)"
                strokeOpacity={0.4}
                vertical={false}
              />
              <XAxis
                dataKey="bucket_start"
                tickFormatter={formatChartTooltipDate}
                tick={{ fontSize: 10, fill: 'var(--mg-text-2)', fontFamily: 'monospace', fontWeight: 600 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--mg-text-2)', fontFamily: 'monospace' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                width={40}
              />
              <Tooltip
                content={<HistogramTooltip />}
                cursor={{ fill: 'var(--mg-fill-1)', opacity: 0.5, radius: 6 }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
                {buckets.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.count === maxCount ? 'url(#barGradActive)' : 'url(#barGrad)'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-[200px] text-center">
            <LuActivity size={24} className="mb-2 text-mg-text-2" />
            <p className="text-xs text-mg-text-2 font-medium">{t('dashboard.histogramChart.empty')}</p>
          </div>
        )}
      </div>
    </Card>
  )
}
