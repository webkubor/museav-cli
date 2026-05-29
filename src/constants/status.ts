import type { BadgeVariant } from '@/components/ui/Badge'

type StatusConfig = { label: string; variant: BadgeVariant }

export const INVITATION_STATUS_CONFIG: Record<
  'pending' | 'accepted' | 'expired' | 'revoked',
  StatusConfig
> = {
  pending:  { label: '待接受', variant: 'warning'   },
  accepted: { label: '已接受', variant: 'success'   },
  expired:  { label: '已过期', variant: 'secondary' },
  revoked:  { label: '已撤销', variant: 'danger'    },
}

export const INVITATION_STATUS_OPTIONS = [
  { value: 'pending'  as const, label: '待接受' },
  { value: 'accepted' as const, label: '已接受' },
  { value: 'expired'  as const, label: '已过期' },
  { value: 'revoked'  as const, label: '已撤销' },
  { value: 'all'      as const, label: '全部' },
]

export const GUARDRAIL_STATUS_CONFIG: Record<
  'active' | 'inactive' | 'archived',
  StatusConfig
> = {
  active:   { label: '启用中', variant: 'success'   },
  inactive: { label: '已停用', variant: 'warning'   },
  archived: { label: '已归档', variant: 'secondary' },
}

export const ENFORCEMENT_CONFIG: Record<
  'monitor' | 'soft_limit' | 'hard_limit',
  { label: string; variant: BadgeVariant }
> = {
  monitor:    { label: '仅监控', variant: 'secondary'   },
  soft_limit: { label: '软限制', variant: 'warning'     },
  hard_limit: { label: '硬限制', variant: 'destructive' },
}

export const PERIOD_LABEL: Record<'hour' | 'day' | 'week' | 'month', string> = {
  hour:  '小时',
  day:   '天',
  week:  '周',
  month: '月',
}

export const LOG_STATUS_CONFIG: Record<
  'succeeded' | 'failed' | 'rejected' | 'accepted',
  StatusConfig
> = {
  succeeded: { label: '成功', variant: 'success'   },
  failed:    { label: '失败', variant: 'danger'    },
  rejected:  { label: '拒绝', variant: 'warning'   },
  accepted:  { label: '接受', variant: 'secondary' },
}
