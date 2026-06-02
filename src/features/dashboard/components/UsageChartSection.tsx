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

const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'var(--mg-bg-0)',
  border: '1px solid var(--mg-border)',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 12,
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
}

function UsageTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ fontWeight: 700, color: 'var(--brand-base)', marginBottom: 2 }}>
        {Math.round(parseFloat(d.value) || 0).toLocaleString()} 次
      </div>
      <div style={{ color: 'var(--mg-text-2)', fontSize: 11 }}>
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
                <linearGradient id="dashUsageGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand-base)" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="var(--brand-base)" stopOpacity={0} />
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
                content={<UsageTooltip />}
                cursor={{ stroke: 'var(--brand-base)', strokeWidth: 1, strokeDasharray: '4 3', strokeOpacity: 0.6 }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--brand-base)"
                strokeWidth={2}
                fill="url(#dashUsageGrad)"
                dot={false}
                activeDot={{ r: 5, fill: 'var(--brand-base)', stroke: 'var(--mg-bg-0)', strokeWidth: 2 }}
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
