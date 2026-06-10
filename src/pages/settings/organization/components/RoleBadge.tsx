import type { TenantItem } from '@/types'
import { TENANT_ROLE_CONFIG } from '@/constants/roles'
import { Badge } from '@/components/ui/Badge'

export function RoleBadge({ role }: { role?: TenantItem['role'] | string | null }) {
  const s = role ? TENANT_ROLE_CONFIG[role as keyof typeof TENANT_ROLE_CONFIG] : undefined
  if (!s) {
    return (
      <Badge variant="outline" size="sm">
        {role || 'Unknown'}
      </Badge>
    )
  }
  return <Badge variant={s.variant} size="sm">{s.label}</Badge>
}
