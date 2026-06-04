import { useTranslation } from 'react-i18next'
import { LuTrendingUp } from 'react-icons/lu'
import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { getUsageSeries } from '@/services/usage'
import { useAuthStore } from '@/store/auth'
import { Card } from '@/components/ui/Card'
import { formatChartTooltipDate } from '@/lib/format-date'



function UsageTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white/98 dark:bg-neutral-950/98 backdrop-blur-md p-3 shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_16px_40px_rgb(0,0,0,0.3)] text-left select-none min-w-[120px] space-y-1">
      <div className="text-[10px] text-neutral-450 dark:text-neutral-500 font-medium">
        调用次数
      </div>
      <div className="text-sm font-mono font-black text-brand-base tabular-nums">
        {Math.round(parseFloat(d.value) || 0).toLocaleString()}
      </div>
      <div className="text-[10px] text-neutral-400 dark:text-neutral-500 font-semibold font-mono pt-1 border-t border-neutral-100 dark:border-neutral-900/60">
        {formatChartTooltipDate(d.bucket_start)}
      </div>
    </div>
  )
}

export const UsageChartSection: React.FC = () => {
  const { t } = useTranslation()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)

  const { data, isLoading } = useQuery({
    queryKey: ['usage', 'series', 'requests', activeTenantId],
    queryFn: () => {
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - 5)
      return getUsageSeries({
        metric: 'requests',
        granularity: 'day',
        from: from.toISOString(),
        to: to.toISOString(),
      })
    },
    enabled: !!activeTenantId,
    staleTime: 60_000,
  })

  const chartData = useMemo(() => {
    const rawData = data as any
    if (rawData?.groups?.[0]?.points) {
      return rawData.groups[0].points.map((p: any) => ({
        bucket_start: p.bucket_start,
        value: String(p.requests ?? 0),
      }))
    }
    if (rawData?.series) return rawData.series
    return []
  }, [data])

  return (
    <Card className="p-6 flex flex-col h-full">
      <div className="mb-5">
        <h3 className="font-bold text-base text-mg-text-0 m-0">{t('dashboard.usageChart.title')}</h3>
        <span className="text-xs text-mg-text-2 block mt-1">{t('dashboard.usageChart.requestsLabel')}</span>
      </div>

      <div className="flex-1" style={{ minHeight: 200 }}>
        {isLoading ? (
          <div className="animate-pulse bg-mg-fill-2 rounded w-full h-[200px]" />
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
              <defs>
                {/* 面积发光渐变 */}
                <linearGradient id="dashUsageGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand-base)" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="var(--brand-base)" stopOpacity={0} />
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
                content={<UsageTooltip />}
                cursor={{ stroke: 'var(--brand-base)', strokeWidth: 1, strokeDasharray: '4 4', strokeOpacity: 0.4 }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--brand-base)"
                strokeWidth={2.5}
                fill="url(#dashUsageGrad)"
                dot={false}
                activeDot={{ r: 4, fill: 'var(--brand-base)', stroke: 'var(--mg-bg-0)', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-[200px] text-center">
            <LuTrendingUp size={24} className="mb-2 text-mg-text-2" />
            <p className="text-xs text-mg-text-2 font-medium">{t('dashboard.usageChart.empty')}</p>
          </div>
        )}
      </div>
    </Card>
  )
}
