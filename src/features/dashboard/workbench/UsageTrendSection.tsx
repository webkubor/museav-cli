import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { LuTrendingUp } from 'react-icons/lu'
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
import { useTrackContext } from '@/hooks/use-track-context'
import { trackEvent } from '@/lib/track'
import { useCurrency } from '@/hooks/use-platform-config'
import { Card } from '@/components/ui/Card'
import { formatChartTooltipDate } from '@/lib/format-date'
import { densifyDailyBuckets } from '@/lib/chart-buckets'
import { formatMoney } from '@/lib/utils'
import { SegmentedToggle } from './SegmentedToggle'
import { abbreviateNumber, rangeForGranularity, type Granularity, type TrendMetric } from './shared'

interface TrendPoint {
  bucket_start: string
  value: number
}

function fmtLabel(month: boolean, iso: string) {
  if (!month) return formatChartTooltipDate(iso)
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * 模块 5：用量趋势。指标切换（请求量/费用/Tokens）+ 粒度（天/月，来自页面）。
 * 数据源 getUsageSeries；标题与单位随指标同步。
 */
export function UsageTrendSection({ granularity, accountId }: { granularity: Granularity; accountId?: string }) {
  const { t } = useTranslation()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const { symbol } = useCurrency()
  const trackCtx = useTrackContext()
  const [metric, setMetric] = useState<TrendMetric>('requests')

  const handleMetricChange = (m: TrendMetric) => {
    trackEvent('overview_trend_metric_change', { ...trackCtx, from_metric: metric, to_metric: m })
    setMetric(m)
  }

  const range = useMemo(() => rangeForGranularity(granularity), [granularity])
  const isMonth = granularity === 'month'

  const { data, isLoading } = useQuery({
    queryKey: ['workbench', 'series', metric, granularity, activeTenantId, accountId],
    queryFn: () =>
      getUsageSeries({ metric, granularity, from: range.from, to: range.to, account_id: accountId }),
    enabled: !!activeTenantId,
    staleTime: 60_000,
  })

  const chartData = useMemo<TrendPoint[]>(() => {
    const raw = data?.groups?.[0]?.points ?? []
    // 完全无数据点 → 返回空，交由空态渲染；不 densify 出一整条 0 值假曲线（PRD §8.6.3）
    if (raw.length === 0) return []
    const points: TrendPoint[] = raw.map((p) => ({
      bucket_start: p.bucket_start,
      value: metric === 'spend' ? Number(p.spend?.amount ?? 0) : Number(p[metric] ?? 0),
    }))
    if (isMonth) return points
    // 按天稀疏返回 → 补齐完整区间，缺失天 value=0
    return densifyDailyBuckets(points, range.from, range.to, (bucket_start) => ({ bucket_start, value: 0 }))
  }, [data, metric, isMonth, range])

  const formatValue = (v: number) =>
    metric === 'spend' ? formatMoney(v, symbol) : `${abbreviateNumber(v)} ${t(`dashboard.workbench.trend.unit.${metric}`)}`.trim()

  return (
    <Card className="p-6 flex flex-col">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-bold text-base text-mg-text-1 m-0">{t('dashboard.workbench.trend.title')}</h3>
          <span className="text-xs text-mg-text-3 block mt-1">{t(`dashboard.workbench.trend.metric.${metric}`)}</span>
        </div>
        <SegmentedToggle<TrendMetric>
          size="sm"
          ariaLabel={t('dashboard.workbench.trend.title')}
          value={metric}
          onChange={handleMetricChange}
          options={[
            { value: 'requests', label: t('dashboard.workbench.trend.metric.requests') },
            { value: 'spend', label: t('dashboard.workbench.trend.metric.spend') },
            { value: 'tokens', label: t('dashboard.workbench.trend.metric.tokens') },
          ]}
        />
      </div>

      <div className="flex-1 outline-none select-none" style={{ minHeight: 220 }}>
        {isLoading ? (
          <div className="animate-pulse bg-mg-fill-2 rounded-sm w-full h-[220px]" />
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220} style={{ outline: 'none' }}>
            <AreaChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="workbenchTrendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand-base)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--brand-base)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="var(--mg-border)" strokeOpacity={0.35} vertical={false} />
              <XAxis
                dataKey="bucket_start"
                tickFormatter={(iso: string) => fmtLabel(isMonth, iso)}
                tick={{ fontSize: 10, fill: 'var(--mg-text-3)', fontFamily: 'monospace', fontWeight: 600 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <Tooltip
                cursor={{ stroke: 'var(--brand-base)', strokeWidth: 1, strokeDasharray: '4 4', strokeOpacity: 0.4 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const p = payload[0].payload as TrendPoint
                  return (
                    <div className="rounded-md border border-mg-border bg-mg-bg-2/98 backdrop-blur-md p-3 shadow-[0_8px_30px_rgb(0,0,0,0.06)] text-left select-none min-w-[120px] space-y-1">
                      <div className="text-[10px] text-mg-text-3 font-medium">{t(`dashboard.workbench.trend.metric.${metric}`)}</div>
                      <div className="text-sm font-mono font-black text-brand-base tabular-nums">{formatValue(p.value)}</div>
                      <div className="text-[10px] text-mg-text-3 font-semibold font-mono pt-1 border-t border-mg-border">{fmtLabel(isMonth, p.bucket_start)}</div>
                    </div>
                  )
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--brand-base)"
                strokeWidth={2.5}
                fill="url(#workbenchTrendGrad)"
                dot={false}
                activeDot={{ r: 4, fill: 'var(--brand-base)', stroke: 'var(--mg-bg-0)', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-[220px] text-center">
            <LuTrendingUp size={24} className="mb-2 text-mg-text-3" />
            <p className="text-xs text-mg-text-3 font-medium">{t('dashboard.workbench.trend.empty')}</p>
            <p className="mt-1 text-[11px] text-mg-text-4 max-w-[260px]">{t('dashboard.workbench.trend.emptyHint')}</p>
          </div>
        )}
      </div>
    </Card>
  )
}
