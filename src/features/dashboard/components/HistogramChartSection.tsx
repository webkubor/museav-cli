import { useTranslation } from 'react-i18next'
import { LuActivity } from 'react-icons/lu'
import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getLogHistogram } from '@/services/logs'
import { useAuthStore } from '@/store/auth'
import { Card } from '@/components/ui/Card'



/** 格式化图表日期：MM-dd */
function formatChartLabel(iso: string) {
  const d = new Date(iso)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const date = String(d.getDate()).padStart(2, '0')
  return `${m}-${date}`
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
        to: to.toISOString()
      })
    },
    enabled: !!activeWorkspaceId,
    staleTime: 60_000,
  })

  // 计算柱子渲染数据
  const bars = useMemo(() => {
    const buckets = data?.buckets ?? []
    if (buckets.length === 0) return []
    
    const maxCount = Math.max(...buckets.map(b => b.count), 10) // 最小基准 10 避免除零或柱子过矮
    
    const width = 800
    const height = 200
    const paddingLeft = 40
    const paddingRight = 40
    const paddingTop = 24
    const paddingBottom = 20
    
    const innerW = width - paddingLeft - paddingRight
    const innerH = height - paddingTop - paddingBottom
    
    const count = buckets.length
    // 每根柱子的宽度。如果是 5 天的数据，buckets.length 大概是 5 左右。
    const barW = Math.max(16, (innerW / count) * 0.4)
    
    // 计算每根柱子的 X 轴起点，均分对齐方式
    const gap = count > 1 ? (innerW - barW * count) / (count - 1) : 0
    
    return buckets.map((b, i) => {
      const x = paddingLeft + i * (barW + gap)
      const barH = (b.count / maxCount) * innerH
      const y = height - paddingBottom - barH
      return {
        x,
        y,
        w: barW,
        h: barH,
        count: b.count,
        label: formatChartLabel(b.bucket_start)
      }
    })
  }, [data])

  return (
    <Card className="p-6 flex flex-col h-full">
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ fontWeight: 700, fontSize: '16px', color: 'var(--mg-text-0)', margin: 0 }}>
          {t('dashboard.histogramChart.title')}
        </h3>
        <span style={{ fontSize: '12px', color: 'var(--mg-text-2)', display: 'block', marginTop: '4px' }}>
          {t('dashboard.histogramChart.requestsLabel')}
        </span>
      </div>

      <div style={{ flex: 1, position: 'relative', minHeight: '200px' }}>
        {isLoading ? (
          <div className="animate-pulse bg-mg-fill-2 rounded w-full h-[200px]" />
        ) : data?.buckets && data.buckets.length > 0 ? (
          <svg width="100%" height="200" viewBox="0 0 800 200" preserveAspectRatio="none">
            <defs>
              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--mg-primary)" stopOpacity="0.85" />
                <stop offset="100%" stopColor="var(--mg-primary)" stopOpacity="0.35" />
              </linearGradient>
            </defs>
            {/* 对称的背景网格虚线 */}
            <line x1="0" y1="180" x2="800" y2="180" stroke="var(--mg-border)" strokeDasharray="4 4" />
            <line x1="0" y1="100" x2="800" y2="100" stroke="var(--mg-border)" strokeDasharray="4 4" opacity="0.5" />
            <line x1="0" y1="20" x2="800" y2="20" stroke="var(--mg-border)" strokeDasharray="4 4" opacity="0.3" />

            {/* 绘制柱状直方图 */}
            {bars.map((bar, i) => (
              <g key={i}>
                <rect
                  x={bar.x}
                  y={bar.y}
                  width={bar.w}
                  height={bar.h}
                  rx={4}
                  fill="url(#barGradient)"
                  className="transition-all duration-300 hover:opacity-100"
                  style={{ cursor: 'pointer' }}
                />
                {/* 柱子上方的数据数值 */}
                <text
                  x={bar.x + bar.w / 2}
                  y={bar.y - 6}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--mg-text-1)"
                  fontWeight={600}
                  fontFamily="monospace"
                >
                  {bar.count}
                </text>
              </g>
            ))}
          </svg>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <LuActivity size={24} className="mb-2 text-mg-text-2" />
            <p className="text-xs text-mg-text-2 font-medium">{t('dashboard.histogramChart.empty')}</p>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
        <span style={{ fontSize: '11px', color: 'var(--mg-text-3)' }}>
          {data?.buckets?.[0] ? formatChartLabel(data.buckets[0].bucket_start) : ''}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--mg-text-3)' }}>
          {data?.buckets?.[data.buckets.length - 1] ? formatChartLabel(data.buckets[data.buckets.length - 1].bucket_start) : ''}
        </span>
      </div>
    </Card>
  )
}
