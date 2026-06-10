import { Badge } from './Badge'
import type { BadgeVariant } from './Badge'
import { cn } from '@/lib/utils'

export interface StatusConfig {
  label: string
  variant: BadgeVariant
  dot?: boolean
}

export interface StatusBadgeProps {
  status: string
  statusMap: Record<string, StatusConfig>
  className?: string
  fallback?: string
}

export function StatusBadge({ status, statusMap, className, fallback }: StatusBadgeProps) {
  const cfg = statusMap[status]
  if (!cfg) {
    return (
      <Badge variant="outline" className={cn(className)}>
        {fallback ?? status}
      </Badge>
    )
  }
  return (
    <Badge variant={cfg.variant} dot={cfg.dot} className={cn(className)}>
      {cfg.label}
    </Badge>
  )
}
