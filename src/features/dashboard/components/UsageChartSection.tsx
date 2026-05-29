import { useTranslation } from 'react-i18next'
import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getUsageSeries } from '@/services/usage'
import { useAuthStore } from '@/store/auth'
import { Card } from '@/components/ui/Card'

/** 格式化日期：yyyy-MM-dd */
function formatISODate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 格式化图表日期：MM-dd */
function formatChartLabel(iso: string) {
  const d = new Date(iso)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const date = String(d.getDate()).padStart(2, '0')
  return `${m}-${date}`
}

export const UsageChartSection: React.FC = () => {
  const { t } = useTranslation()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)

  const { data, isLoading } = useQuery({
    queryKey: ['usage', 'series', 'requests', activeTenantId],
    queryFn: () => {
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - 14)
      return getUsageSeries({
        metric: 'requests',
        granularity: 'day',
        from: formatISODate(from),
        to: formatISODate(to)
      })
    },
    enabled: !!activeTenantId,
    staleTime: 60_000,
  })

  // 简单的 SVG 曲线生成逻辑
  const chartPath = useMemo(() => {
    if (!data?.series || data.series.length < 2) return ''
    
    const width = 800
    const height = 200
    const padding = 20
    
    const values = data.series.map(p => parseFloat(p.value))
    const max = Math.max(...values, 10) // 最小值 10 避免除以 0
    
    const points = data.series.map((p, i) => {
      const x = (i / (data.series.length - 1)) * (width - padding * 2) + padding
      const y = height - ((parseFloat(p.value) / max) * (height - padding * 2) + padding)
      return `${x},${y}`
    })

    return `M ${points.join(' L ')}`
  }, [data])

  const areaPath = useMemo(() => {
    if (!chartPath) return ''
    return `${chartPath} L 780,180 L 20,180 Z`
  }, [chartPath])

  return (
    <Card className="p-6 border-none shadow-md bg-mg-bg-1 flex flex-col">
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ fontWeight: 700, fontSize: '16px', color: 'var(--mg-text-0)', margin: 0 }}>{t('dashboard.usageChart.title')}</h3>
        <span style={{ fontSize: '12px', color: 'var(--mg-text-2)', display: 'block', marginTop: '4px' }}>{t('dashboard.usageChart.requestsLabel')}</span>
      </div>

      <div style={{ flex: 1, position: 'relative', minHeight: '200px' }}>
        {isLoading ? (
          <div className="animate-pulse bg-gray-200 dark:bg-gray-800 rounded w-full h-[200px]" />
        ) : data?.series && data.series.length > 0 ? (
          <svg width="100%" height="200" viewBox="0 0 800 200" preserveAspectRatio="none">
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--mg-primary)" stopOpacity="0.2" />
                <stop offset="100%" stopColor="var(--mg-primary)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* 网格线 */}
            <line x1="0" y1="180" x2="800" y2="180" stroke="var(--mg-border)" strokeDasharray="4 4" />
            <line x1="0" y1="100" x2="800" y2="100" stroke="var(--mg-border)" strokeDasharray="4 4" opacity="0.5" />
            <line x1="0" y1="20" x2="800" y2="20" stroke="var(--mg-border)" strokeDasharray="4 4" opacity="0.3" />
            
            {/* 渐变填充 */}
            <path d={areaPath} fill="url(#chartGradient)" />
            
            {/* 曲线 */}
            <path 
              d={chartPath} 
              fill="none" 
              stroke="var(--mg-primary)" 
              strokeWidth="3" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
            />
          </svg>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-2xl mb-2">📊</span>
            <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">{t('dashboard.usageChart.empty')}</p>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
        <span style={{ fontSize: '11px', color: 'var(--mg-text-3)' }}>
          {data?.series?.[0] ? formatChartLabel(data.series[0].bucket_start) : ''}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--mg-text-3)' }}>
          {data?.series?.[data.series.length - 1] ? formatChartLabel(data.series[data.series.length - 1].bucket_start) : ''}
        </span>
      </div>
    </Card>
  )
}
