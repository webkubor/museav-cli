import type { BadgeVariant } from '@/components/ui/Badge'

export const WS_ROLE_LABEL: Record<'ws_owner' | 'ws_admin' | 'ws_member', string> = {
  ws_owner:  '拥有者',
  ws_admin:  '管理员',
  ws_member: '成员',
}

export const TENANT_ROLE_LABEL: Record<'tenant_owner' | 'tenant_admin' | 'tenant_member', string> = {
  tenant_owner:  '拥有者',
  tenant_admin:  '管理员',
  tenant_member: '成员',
}

export const TENANT_ROLE_CONFIG: Record<
  'tenant_owner' | 'tenant_admin' | 'tenant_member',
  { label: string; variant: BadgeVariant }
> = {
  tenant_owner:  { label: 'Owner',  variant: 'purple'    },
  tenant_admin:  { label: 'Admin',  variant: 'default'   },
  tenant_member: { label: 'Member', variant: 'secondary' },
}

export const WS_ROLE_OPTIONS = [
  { value: 'ws_member' as const, label: '成员' },
  { value: 'ws_admin'  as const, label: '管理员' },
]

export const TENANT_ROLE_OPTIONS = [
  { value: 'tenant_member' as const, label: 'Member' },
  { value: 'tenant_admin'  as const, label: 'Admin' },
]
