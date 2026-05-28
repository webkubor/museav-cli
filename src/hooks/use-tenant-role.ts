/**
 * 租户/组织层权限 Hook
 *
 * 数据来源：GET /tenants → TenantItem.role
 * 作用范围：当前激活组织内的操作权限
 *   - tenant_owner  : 拥有者，可管理组织所有资源与成员
 *   - tenant_admin  : 管理员，可邀请/移除成员、修改组织设置
 *   - tenant_member : 普通成员，只读
 */
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { listTenants } from '@/services/tenants'
import type { TenantItem } from '@/types'

export type TenantRole = 'tenant_owner' | 'tenant_admin' | 'tenant_member'

export function useTenantRole() {
  const activeTenantId = useAuthStore((s) => s.activeTenantId)

  const { data: tenants = [], isLoading } = useQuery<TenantItem[]>({
    queryKey: ['tenants'],
    queryFn: () => listTenants().then((r) => r.items ?? []),
    staleTime: 60_000,
  })

  const role = tenants.find(
    (t) => t.tenant_id === activeTenantId
  )?.role as TenantRole | undefined

  /** 当前激活租户是否为企业类型 */
  const isEnterprise = tenants.find(
    (t) => t.tenant_id === activeTenantId
  )?.type === 'enterprise'

  return {
    /** 当前租户角色，查询未完成时为 undefined */
    role,
    isLoading,
    isEnterprise,
    /** 可管理组织（owner 或 admin）；角色未知时默认 true，服务端二次校验 */
    canManage: role !== 'tenant_member',
    isOwner:   role === 'tenant_owner',
    isAdmin:   role === 'tenant_admin',
    isMember:  role === 'tenant_member',
  }
}
