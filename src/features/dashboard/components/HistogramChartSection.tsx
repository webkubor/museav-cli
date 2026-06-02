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

const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'var(--mg-bg-0)',
  border: '1px solid var(--mg-border)',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 12,
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
}

function HistogramTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ fontWeight: 700, color: 'var(--brand-mid)', marginBottom: 2 }}>
        {d.count.toLocaleString()} 次
      </div>
      <div style={{ color: 'var(--mg-text-2)', fontSize: 11 }}>
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

      <div className="flex-1" style={{ minHeight: 200 }}>
        {isLoading ? (
          <div className="animate-pulse bg-mg-fill-2 rounded w-full h-[200px]" />
        ) : buckets.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={buckets} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="dashHistGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand-mid)" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="var(--brand-mid)" stopOpacity={0} />
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
                content={<HistogramTooltip />}
                cursor={{ stroke: 'var(--brand-mid)', strokeWidth: 1, strokeDasharray: '4 3', strokeOpacity: 0.5 }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="var(--brand-mid)"
                strokeWidth={2}
                fill="url(#dashHistGrad)"
                dot={false}
                activeDot={{ r: 5, fill: 'var(--brand-mid)', stroke: 'var(--mg-bg-0)', strokeWidth: 2 }}
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
