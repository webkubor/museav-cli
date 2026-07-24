import React from 'react'
import { Card } from '@/components/ui/Card'
import { useCountUp } from '@/hooks/use-count-up'
import { useMouseGlow } from '@/hooks/use-mouse-glow'

export interface KpiCardProps {
  title?: string
  label?: string // 兼容部分页面的命名习惯
  value: string | undefined
  loading?: boolean
  color?: string
  glowColor?: string
  hoverBorderClass?: string
  icon?: React.ReactNode
  sub?: string // 辅助次级描述，例如 Token 用量项下的 Prompt & Completion 比例
  sparkData?: number[] // 迷你 sparkline 数据
  trend?: { value: string; up: boolean; label?: string } // 涨跌 badge；label 为前缀（如「较上期」）
  iconLead?: boolean // true=图标置于标题左侧、涨跌徽章落在卡片底部（总览设计稿版式）
  rawNumber?: number // 传入原始数值时启用 countUp 动画
  formatter?: (n: number) => string // 配合 rawNumber 使用的格式化函数
  action?: { label: string; onClick: () => void } // 卡片内快捷操作按钮（如充值）
  onClick?: () => void // 卡片整体点击（当前仅用于埋点占位，暂无下钻交互）
  ratio?: { current: number; total: number } // 占比环形（当前/总量快照，如「启用中/全部」）；不需趋势数据
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const w = 100
  const h = 28
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const linePath = `M ${pts.join(' L ')}`
  const areaPath = `${linePath} L ${w},${h} L 0,${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[var(--mg-sparkline-h)]" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg-${color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#sg-${color.replace(/[^a-z0-9]/gi, '')})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** 占比环形进度（当前/总量快照），中心显示百分比。用于「启用中/全部」等无需趋势的占比可视化。 */
function RatioRing({ current, total, color }: { current: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(current / total, 1) : 0
  const r = 16
  const circ = 2 * Math.PI * r
  return (
    <div className="relative w-11 h-11 shrink-0" aria-label={`${current}/${total}`}>
      <svg viewBox="0 0 44 44" className="w-11 h-11">
        <circle cx="22" cy="22" r={r} fill="none" stroke="var(--mg-fill-2)" strokeWidth="3.5" />
        <circle
          cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} transform="rotate(-90 22 22)"
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center mg-text-caption font-bold" style={{ color }}>
        {Math.round(pct * 100)}%
      </span>
    </div>
  )
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  label,
  value,
  loading = false,
  color = 'var(--mg-primary)',
  glowColor = 'var(--brand-glow)',
  hoverBorderClass = 'hover:border-brand-base/30',
  icon,
  sub,
  sparkData,
  trend,
  iconLead = false,
  rawNumber,
  formatter,
  action,
  onClick,
  ratio,
}) => {
  const displayTitle = title || label || ''
  const animated = useCountUp(loading ? 0 : (rawNumber ?? 0))
  const displayValue = rawNumber !== undefined && !loading
    ? (formatter ? formatter(animated) : String(Math.round(animated)))
    : value

  const glowRef = useMouseGlow<HTMLDivElement>()

  const computedTrend: { value: string; up: boolean; label?: string } | undefined = !trend && sparkData && sparkData.length >= 2
    ? (() => {
        const first = sparkData[0]
        const last = sparkData[sparkData.length - 1]
        if (!first) return undefined
        const pct = ((last - first) / first) * 100
        return { value: `${Math.abs(pct).toFixed(1)}%`, up: pct >= 0 }
      })()
    : trend

  return (
    <Card
      ref={glowRef}
      hoverable
      glass
      onClick={onClick}
      className={`mg-panel flex flex-col justify-center rounded-lg relative overflow-hidden group transition-all duration-500 flex-1 min-w-[200px] mouse-glow-card magnetic-hover ${hoverBorderClass} ${onClick ? 'cursor-pointer' : ''}`}
    >
      {/* 专属高精密几何光环与微弱环境底色 (线与光的结合) */}
      <div className="absolute right-[-20px] bottom-[-20px] w-32 h-32 pointer-events-none z-0 opacity-25 group-hover:opacity-75 transition-all duration-700">
        <svg 
          className="w-full h-full animate-[spin_25s_linear_infinite] group-hover:animate-[spin_12s_linear_infinite] transition-all duration-700" 
          viewBox="0 0 100 100"
        >
          {/* 外环刻度虚线 (线) */}
          <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="0.75" strokeDasharray="2, 5" />
          {/* 内环极细圆 (线) */}
          <circle cx="50" cy="50" r="32" fill="none" stroke={color} strokeWidth="0.5" strokeOpacity="0.4" />
          {/* 精密十字刻度点 (线) */}
          <line x1="50" y1="4" x2="50" y2="8" stroke={color} strokeWidth="1" />
          <line x1="50" y1="92" x2="50" y2="96" stroke={color} strokeWidth="1" />
          <line x1="4" y1="50" x2="8" y2="50" stroke={color} strokeWidth="1" />
          <line x1="92" y1="50" x2="96" y2="50" stroke={color} strokeWidth="1" />
        </svg>
        {/* 背景微弱温和色温（提供呼吸般的光泽，但绝对不发散脏杂阴影） */}
        <div 
          className="absolute inset-4 rounded-full blur-[20px] opacity-15 group-hover:opacity-30 transition-all duration-700"
          style={{ background: color }}
        />
      </div>

      <div className={`flex items-center gap-2.5 mb-2 z-10 ${iconLead ? '' : 'justify-between'}`}>
        {iconLead && icon && (
          <div
            className="p-2 rounded-md transition-all duration-500 z-10 shrink-0 flex items-center justify-center group-hover:scale-110"
            style={{ backgroundColor: glowColor, color: color }}
          >
            {icon}
          </div>
        )}
        <span className="mg-text-caption font-semibold text-mg-text-3 tracking-wide select-none">
          {displayTitle}
        </span>
        {!iconLead && icon && (
          <div
            className="p-2 rounded-md transition-all duration-500 z-10 shrink-0 flex items-center justify-center group-hover:scale-110"
            style={{
              backgroundColor: glowColor,
              color: color
            }}
          >
            {icon}
          </div>
        )}
      </div>
      
      <div className="z-10 mt-1">
        {loading ? (
          <div className="animate-pulse bg-mg-fill-2 rounded-full h-[var(--mg-skeleton-h-md)] w-2/3" />
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-end gap-2">
                <span
                  className="mg-text-display-sm font-bold tracking-tight block font-mono select-all kpi-value-text"
                  style={{
                    color: color === 'var(--mg-text-1)' ? 'var(--mg-text-1)' : color,
                    fontVariantNumeric: 'tabular-nums'
                  }}
                >
                  {displayValue ?? '—'}
                </span>
                {computedTrend && !iconLead && !loading && (
                  <span
                    className="mg-compact-badge mb-1.5 px-1.5 py-0.5 rounded-md"
                    style={{
                      color: computedTrend.up ? 'var(--mg-trend-up)' : 'var(--mg-trend-down)',
                      backgroundColor: `color-mix(in srgb, ${computedTrend.up ? 'var(--mg-trend-up)' : 'var(--mg-trend-down)'} 12%, transparent)`,
                    }}
                  >
                    {computedTrend.up ? '↑' : '↓'} {computedTrend.value}
                  </span>
                )}
              </div>
              {sub && (
                <span className="mg-text-caption text-mg-text-3 mt-1.5 block select-none">
                  {sub}
                </span>
              )}
            </div>
            {ratio && ratio.total > 0 && <RatioRing current={ratio.current} total={ratio.total} color={color} />}
          </div>
        )}
      </div>

      {/* 涨跌徽章（iconLead 版式：落在卡片底部，带「较上期」前缀） */}
      {iconLead && computedTrend && !loading && (
        <div className="z-10 mt-3">
          <span
            className="mg-compact-badge inline-flex items-center gap-1 px-2 py-0.5 rounded-md"
            style={{
              color: computedTrend.up ? 'var(--mg-trend-up)' : 'var(--mg-trend-down)',
              backgroundColor: `color-mix(in srgb, ${computedTrend.up ? 'var(--mg-trend-up)' : 'var(--mg-trend-down)'} 12%, transparent)`,
            }}
          >
            {computedTrend.label ? `${computedTrend.label} ` : ''}{computedTrend.up ? '↑' : '↓'} {computedTrend.value}
          </span>
        </div>
      )}

      {/* Sparkline */}
      {sparkData && sparkData.length >= 2 && !loading && (
        <div className="z-10 mt-3 -mx-1 opacity-80">
          <Sparkline data={sparkData} color={color} />
        </div>
      )}

      {/* 快捷操作按钮（如充值） */}
      {action && !loading && (
        <button
          onClick={(e) => { e.stopPropagation(); action.onClick() }}
          className="z-10 mt-3 self-start inline-flex items-center gap-1.5 mg-compact-badge px-[var(--mg-control-px-sm)] py-[var(--mg-space-1)] rounded-full border transition-all duration-200 hover:opacity-80 active:scale-95"
          style={{
            color: color,
            borderColor: `color-mix(in srgb, ${color} 25%, transparent)`,
            backgroundColor: glowColor,
          }}
        >
          {action.label}
          <span aria-hidden className="opacity-50 mg-text-caption">→</span>
        </button>
      )}
    </Card>
  )
}
