import React from 'react'
import { Card } from '@/components/ui/Card'

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
  sub
}) => {
  const displayTitle = title || label || ''

  return (
    <Card
      hoverable
      glass
      className={`p-6 min-h-[120px] flex flex-col justify-center rounded-2xl relative overflow-hidden group transition-all duration-500 flex-1 min-w-[200px] ${hoverBorderClass}`}
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

      <div className="flex items-center justify-between gap-4 mb-3 z-10">
        <span className="text-[12px] font-semibold text-mg-text-2 tracking-wide select-none">
          {displayTitle}
        </span>
        {icon && (
          <div 
            className="p-2 rounded-xl transition-all duration-500 z-10 shrink-0 flex items-center justify-center group-hover:scale-110"
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
          <div className="animate-pulse bg-mg-fill-2 rounded-full h-8 w-2/3" />
        ) : (
          <div>
            <span 
              className="text-[28px] font-bold tracking-tight block font-mono select-all"
              style={{
                color: color === 'var(--mg-text-0)' ? 'var(--mg-text-0)' : color,
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {value ?? '—'}
            </span>
            {sub && (
              <span className="text-[11px] text-mg-text-2 mt-1.5 block select-none">
                {sub}
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
