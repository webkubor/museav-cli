import React, { useMemo } from 'react'
import { Typography, Skeleton, Empty } from '@douyinfe/semi-ui'
import { useQuery } from '@tanstack/react-query'
import { getUsageSeries } from '@/services/usage'
import { useAuthStore } from '@/store/auth'
import { Card } from '@/components/ui/Card'

const { Title, Text } = Typography

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
    <Card className="p-6 border-none shadow-md bg-semi-color-bg-1 flex flex-col">
      <div style={{ marginBottom: '20px' }}>
        <Title heading={5} style={{ fontWeight: 700 }}>用量趋势 (最近 14 天)</Title>
        <Text style={{ fontSize: '12px', color: 'var(--semi-color-text-2)' }}>请求数 (Requests)</Text>
      </div>

      <div style={{ flex: 1, position: 'relative', minHeight: '200px' }}>
        {isLoading ? (
          <Skeleton active placeholder={<Skeleton.Image style={{ width: '100%', height: '200px' }} />} loading={true} />
        ) : data?.series && data.series.length > 0 ? (
          <svg width="100%" height="200" viewBox="0 0 800 200" preserveAspectRatio="none">
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--semi-color-primary)" stopOpacity="0.2" />
                <stop offset="100%" stopColor="var(--semi-color-primary)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* 网格线 */}
            <line x1="0" y1="180" x2="800" y2="180" stroke="var(--semi-color-border)" strokeDasharray="4 4" />
            <line x1="0" y1="100" x2="800" y2="100" stroke="var(--semi-color-border)" strokeDasharray="4 4" opacity="0.5" />
            <line x1="0" y1="20" x2="800" y2="20" stroke="var(--semi-color-border)" strokeDasharray="4 4" opacity="0.3" />
            
            {/* 渐变填充 */}
            <path d={areaPath} fill="url(#chartGradient)" />
            
            {/* 曲线 */}
            <path 
              d={chartPath} 
              fill="none" 
              stroke="var(--semi-color-primary)" 
              strokeWidth="3" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
            />
          </svg>
        ) : (
          <Empty description="暂无数据" />
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
        <Text style={{ fontSize: '11px', color: 'var(--semi-color-text-3)' }}>
          {data?.series?.[0] ? formatChartLabel(data.series[0].bucket_start) : ''}
        </Text>
        <Text style={{ fontSize: '11px', color: 'var(--semi-color-text-3)' }}>
          {data?.series?.[data.series.length - 1] ? formatChartLabel(data.series[data.series.length - 1].bucket_start) : ''}
        </Text>
      </div>
    </Card>
  )
}
