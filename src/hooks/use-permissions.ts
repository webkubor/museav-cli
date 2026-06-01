import { useMemo } from 'react'
import { useAuthStore } from '@/store/auth'
import { isDomestic } from '@/lib/market'
import { computePermissions } from '@/utils/computePermissions'
import type { Permission } from '@/config/permissions'

export function usePermissions() {
  const tenants        = useAuthStore((s) => s.tenants)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const activeTenant   = Array.isArray(tenants)
    ? tenants.find((t) => t.tenant_id === activeTenantId)
    : undefined

  const permissions = useMemo(
    () =>
      computePermissions({
        market:     isDomestic() ? 'domestic' : 'global',
        tenantType: activeTenant?.type ?? 'personal',
        // 角色由后端返回后再接入；当前暂以最高权限运行
        tenantRole: 'tenant_owner',
        wsRole:     'ws_owner',
      }),
    [activeTenant?.type],
  )

  const hasPermission = (perm: Permission): boolean => permissions.includes(perm)

  return { permissions, hasPermission }
}
