import { useMemo } from 'react'
import { useAuthStore } from '@/store/auth'
import { isDomestic } from '@/lib/market'
import { computePermissions } from '@/utils/computePermissions'
import { useTenantRole } from '@/hooks/use-tenant-role'
import { useWorkspaceRole } from '@/hooks/use-workspace-role'
import type { Permission } from '@/config/permissions'

/**
 * 菜单/操作权限 Hook。
 *
 * 权威来源：GET /auth/session 下发的 permissions.granted —— 由
 * modelgo-permissions 基于 DB 权威矩阵（运营在 controller-web
 * 「运营/菜单权限管理」编辑，写入 ≤30s 生效）为当前激活 租户×工作区 解析。
 *
 * 回退：仅当 granted 为 null（旧版 web-api 未下发权限对象、切换组织后
 * 会话重拉的过渡窗口）时用本地矩阵兜底——使用真实角色
 * （useTenantRole / useWorkspaceRole），不再写死 tenant_owner/ws_owner。
 *
 * 注意：granted === []（空数组）是权威的「零权限」——运营在
 * controller-web 清空某角色绑定后必须如实呈现，绝不回退（fail-open 禁止）。
 */
export function usePermissions() {
  const granted        = useAuthStore((s) => s.permissions)
  const tenants        = useAuthStore((s) => s.tenants)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const { role: tenantRole } = useTenantRole()
  const { role: wsRole }     = useWorkspaceRole()

  const activeTenant = Array.isArray(tenants)
    ? tenants.find((t) => t.tenant_id === activeTenantId)
    : undefined

  const permissions = useMemo<Permission[]>(() => {
    if (granted !== null) {
      return granted as Permission[]
    }
    return computePermissions({
      market:     isDomestic() ? 'domestic' : 'global',
      tenantType: activeTenant?.type ?? 'personal',
      tenantRole,
      wsRole,
    })
  }, [granted, activeTenant?.type, tenantRole, wsRole])

  const hasPermission = (perm: Permission): boolean => permissions.includes(perm)

  return { permissions, hasPermission }
}
