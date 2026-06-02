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
      className={`p-6 min-h-[120px] flex flex-col justify-center border border-mg-border bg-mg-bg-0 rounded-2xl relative overflow-hidden group transition-all duration-500 ${hoverBorderClass} hover:shadow-[0_8px_30px_rgba(0,0,0,0.02)] flex-1 min-w-[200px]`}
    >
      {/* 专属非对称流光极光云雾 */}
      <div 
        className="absolute right-[-32px] bottom-[-32px] w-36 h-36 rounded-full blur-[26px] opacity-35 group-hover:opacity-85 group-hover:scale-110 group-hover:animate-[spin_10s_linear_infinite] transition-all duration-700 pointer-events-none z-0" 
        style={{
          background: `radial-gradient(circle at 30% 30%, ${color} 0%, transparent 60%), radial-gradient(circle at 70% 70%, ${glowColor} 0%, transparent 70%)`
        }}
      />

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
