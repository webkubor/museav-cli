type StatusConfig = { label: string; bg: string; color: string; border: string }

export const INVITATION_STATUS_CONFIG: Record<
  'pending' | 'accepted' | 'expired' | 'revoked',
  StatusConfig
> = {
  pending:  { label: '待接受', color: '#d97706',                    bg: '#fffbeb',                   border: '#fde68a' },
  accepted: { label: '已接受', color: '#16a34a',                    bg: '#f0fdf4',                   border: '#bbf7d0' },
  expired:  { label: '已过期', color: 'var(--mg-text-2)',   bg: 'var(--mg-bg-1)',    border: 'var(--mg-border)' },
  revoked:  { label: '已撤销', color: '#dc2626',                    bg: '#fef2f2',                   border: '#fecaca' },
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
  active:   { label: '启用中', color: '#10b981',                    bg: '#ecfdf5',                   border: '#6ee7b7' },
  inactive: { label: '已停用', color: '#f59e0b',                    bg: '#fffbeb',                   border: '#fde68a' },
  archived: { label: '已归档', color: 'var(--mg-text-2)',   bg: 'var(--mg-bg-1)',    border: 'var(--mg-border)' },
}

export const ENFORCEMENT_CONFIG: Record<
  'monitor' | 'soft_limit' | 'hard_limit',
  { label: string; color: string }
> = {
  monitor:    { label: '仅监控', color: 'var(--mg-text-1)' },
  soft_limit: { label: '软限制', color: '#f59e0b' },
  hard_limit: { label: '硬限制', color: '#ef4444' },
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
  succeeded: { label: '成功', bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  failed:    { label: '失败', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  rejected:  { label: '拒绝', bg: '#fff7ed', color: '#ea580c', border: '#fed7aa' },
  accepted:  { label: '接受', bg: 'var(--mg-bg-1)', color: 'var(--mg-text-1)', border: 'var(--mg-border)' },
}
