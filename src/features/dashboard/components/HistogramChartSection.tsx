import { useTranslation } from 'react-i18next'
import { LuActivity } from 'react-icons/lu'
import React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { getLogHistogram } from '@/services/logs'
import { useAuthStore } from '@/store/auth'
import { Card } from '@/components/ui/Card'
import { formatChartTooltipDate } from '@/lib/format-date'



function HistogramTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white/98 dark:bg-neutral-950/98 backdrop-blur-md p-3 shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_16px_40px_rgb(0,0,0,0.3)] text-left select-none min-w-[120px] space-y-1">
      <div className="text-[10px] text-neutral-450 dark:text-neutral-500 font-medium">
        请求次数
      </div>
      <div className="text-sm font-mono font-black text-blue-500 dark:text-blue-400 tabular-nums">
        {d.count.toLocaleString()}
      </div>
      <div className="text-[10px] text-neutral-400 dark:text-neutral-500 font-semibold font-mono pt-1 border-t border-neutral-100 dark:border-neutral-900/60">
        {formatChartTooltipDate(d.bucket_start)}
      </div>
    </div>
  )
}

export const HistogramChartSection: React.FC = () => {
  const { t } = useTranslation()
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)

  const { data, isLoading } = useQuery({
    queryKey: ['usage', 'histogram', activeWorkspaceId],
    queryFn: () => {
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - 5)
      return getLogHistogram({
        workspace_id: activeWorkspaceId ?? undefined,
        granularity: 'day',
        from: from.toISOString(),
        to: to.toISOString(),
      })
    },
    enabled: !!activeWorkspaceId,
    staleTime: 60_000,
  })

  const buckets = data?.buckets ?? []

  return (
    <Card className="p-6 flex flex-col h-full">
      <div className="mb-5">
        <h3 className="font-bold text-base text-mg-text-0 m-0">{t('dashboard.histogramChart.title')}</h3>
        <span className="text-xs text-mg-text-2 block mt-1">{t('dashboard.histogramChart.requestsLabel')}</span>
      </div>

      <div className="flex-1 outline-none select-none" style={{ minHeight: 200 }}>
        {isLoading ? (
          <div className="animate-pulse bg-mg-fill-2 rounded w-full h-[200px]" />
        ) : buckets.length > 0 ? (
          <ResponsiveContainer width="100%" height={200} style={{ outline: 'none' }}>
            <AreaChart data={buckets} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
              <defs>
                {/* 科技蓝发光渐变 (Blue to Violet) */}
                <linearGradient id="dashHistGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
                {/* 流光蓝紫渐变线条 */}
                <linearGradient id="dashHistLineGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="var(--mg-border)" strokeOpacity={0.35} vertical={false} />
              <XAxis
                dataKey="bucket_start"
                tickFormatter={formatChartTooltipDate}
                tick={{ fontSize: 10, fill: 'var(--mg-text-2)', fontFamily: 'monospace', fontWeight: 600 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <Tooltip
                content={<HistogramTooltip />}
                cursor={{ stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '4 4', strokeOpacity: 0.4 }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="url(#dashHistLineGrad)"
                strokeWidth={2.5}
                fill="url(#dashHistGrad)"
                dot={false}
                activeDot={{ r: 4, fill: '#3b82f6', stroke: 'var(--mg-bg-0)', strokeWidth: 2 }}
              />
            </AreaChart>
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
