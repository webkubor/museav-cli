/**
 * 用量统计大卡：头部指标 + 分解进度条（对齐 PRD 原型）。
 * 路由：/usage
 * API 来源：GET /usage/summary
 */

import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'

// ─── 用量统计三大卡：头部指标 + 分解进度条（对齐 PRD 原型）────────────────
export type UsageStatTone = 'emerald' | 'amber' | 'blue' | 'brand'

export interface UsageStatRow {
  label: string
  value: string
  /** 进度条占比 0-100 */
  pct?: number
  variant?: UsageStatTone
  /** 是否画进度条；false = 只显数值（如平均延迟） */
  bar?: boolean
}

interface UsageStatCardProps {
  icon: ReactNode
  label: string
  value: string
  suffix?: string
  loading?: boolean
  breakdownTitle: string
  rows: UsageStatRow[]
  /** 数据暂缺时的占位提示（如费用分项待后端支持） */
  pendingHint?: string
}

/** 单个用量统计大卡（复用 Card + ProgressBar）。总费用/请求总量/总Tokens 各一张。 */
export function UsageStatCard({ icon, label, value, suffix, loading, breakdownTitle, rows, pendingHint }: UsageStatCardProps) {
  return (
    <Card className="space-y-4 p-5 sm:p-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-mg-fill-1 text-mg-text-2">{icon}</span>
          <span className="text-xs font-bold uppercase tracking-wider text-mg-text-2">{label}</span>
        </div>
        {loading ? (
          <div className="h-8 w-28 animate-pulse rounded bg-mg-fill-1" />
        ) : (
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-mg-text-1">{value}</span>
            {suffix && <span className="text-xs font-medium text-mg-text-3">{suffix}</span>}
          </div>
        )}
      </div>

      <div className="space-y-2.5 border-t border-mg-border/50 pt-4">
        <div className="text-xs font-bold uppercase tracking-wider text-mg-text-2">{breakdownTitle}</div>
        {rows.map((r) => (
          <div key={r.label} className="space-y-1">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-mg-text-2">{r.label}</span>
              <span className="font-mono font-semibold text-mg-text-1">{r.value}</span>
            </div>
            {r.bar !== false && (
              <ProgressBar value={r.pct ?? 0} variant={r.variant ?? 'brand'} size="xs" showGlow={false} flow />
            )}
          </div>
        ))}
        {pendingHint && <div className="pt-0.5 text-xs text-mg-text-3">{pendingHint}</div>}
      </div>
    </Card>
  )
}
