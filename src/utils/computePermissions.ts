import { TENANT_PERM_MATRIX, WS_PERM_MATRIX } from '@/config/permissionMatrix'
import type { Market, TenantType } from '@/config/permissionMatrix'
import type { TenantRole } from '@/hooks/use-tenant-role'
import type { WorkspaceRole } from '@/hooks/use-workspace-role'
import type { Permission } from '@/config/permissions'

export interface PermissionContext {
  market: Market
  tenantType: TenantType
  tenantRole: TenantRole | undefined
  wsRole: WorkspaceRole | undefined
}

export function computePermissions(ctx: PermissionContext): Permission[] {
  const set = new Set<Permission>()

  const tenantRole = ctx.tenantRole ?? 'tenant_member'
  const tenantPerms = TENANT_PERM_MATRIX[ctx.market]?.[ctx.tenantType]?.[tenantRole] ?? []
  tenantPerms.forEach((p) => set.add(p))

  if (ctx.wsRole) {
    const wsPerms = WS_PERM_MATRIX[ctx.wsRole] ?? []
    wsPerms.forEach((p) => set.add(p))
  }

  return Array.from(set)
}
