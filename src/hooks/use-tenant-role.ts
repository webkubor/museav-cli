/**
 * 租户/组织层权限 Hook
 *
 * 数据来源：GET /tenants → TenantItem.role
 * 作用范围：当前激活组织内的操作权限
 *   - tenant_owner  : 拥有者，可管理组织所有资源与成员
 *   - tenant_admin  : 管理员，可邀请/移除成员、修改组织设置
 *   - tenant_member : 普通成员，只读
 *
 * 空间负责人判定（#391）：来源不是 session（SessionPermissions 只带当前激活工作空间的
 * workspace_role，覆盖不了"这个人一共负责哪些空间"），而是 GET /workspaces →
 * WorkspaceItem.my_role === 'ws_owner' 汇总出的 ownedWorkspaceIds。
 * queryKey 用共享的 ['workspaces', activeTenantId]，与页面里已有的同名 query 共享缓存。
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { listTenants } from '@/services/tenants'
import { listWorkspaces } from '@/services/workspaces'
import type { TenantListResponse } from '@/interfaces/tenants'

export type TenantRole = 'tenant_owner' | 'tenant_admin' | 'tenant_member'

export function useTenantRole() {
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  /**
   * 未登录不发这条请求。公开页（模型广场 / 模型详情）也会挂到用它的组件上，
   * 匿名态下 GET /tenants 必然回 40101 → 命中 request.ts 的全局会话过期分支 →
   * 弹「登录已过期，请重新登录」。游客从没登录过，这条提示是纯噪音。
   * （/auth/session 早已在那里白名单豁免，同理。）
   *
   * 条件带上 activeTenantId：有活跃租户即已登录，isAuthenticated 尚未回填的
   * 中间态（以及只 mock 了租户的测试）不该被误判成匿名而拿不到角色。
   */
  const { data, isLoading } = useQuery<TenantListResponse>({
    queryKey: ['tenants'],
    queryFn: listTenants,
    enabled: isAuthenticated || Boolean(activeTenantId),
    staleTime: 60_000,
  })

  const tenants = data?.items ?? []

  const activeTenant = tenants.find((t) => t.tenant_id === activeTenantId)

  const role = activeTenant?.role as TenantRole | undefined

  /** 当前激活租户是否为企业类型 */
  const isEnterprise = activeTenant?.type === 'enterprise'

  const { data: workspacesData } = useQuery({
    queryKey: ['workspaces', activeTenantId],
    queryFn: () => listWorkspaces().then((res) => res.items ?? []),
    enabled: Boolean(activeTenantId),
    staleTime: 60_000,
  })

  // useMemo 保证引用稳定：workspacesData 不变时 ownedWorkspaceIds 引用不变，
  // 避免下游页面把它放进 useMemo/useQuery 依赖数组时每次渲染都判定为“变化”而重复请求。
  const ownedWorkspaceIds = useMemo(
    () => (workspacesData ?? []).filter((w) => w.my_role === 'ws_owner').map((w) => w.workspace_id),
    [workspacesData]
  )

  /** 空间负责人（非 Owner/Admin 的普通成员，但负责至少一个工作空间） */
  const isSpaceOwner =
    isEnterprise && role === 'tenant_member' && ownedWorkspaceIds.length > 0

  return {
    /** 当前租户角色，查询未完成时为 undefined */
    role,
    isLoading,
    isEnterprise,
    /** 当前激活租户完整条目（含 max_workspaces / current_workspace_count 等），查询未完成时为 undefined。
     *  与本 hook 共用同一个 ['tenants'] query，不会重复发请求。 */
    tenant: activeTenant,
    /** 可管理组织（owner 或 admin）；角色未知时 fail-closed */
    canManage: role === 'tenant_owner' || role === 'tenant_admin',
    isOwner:   role === 'tenant_owner',
    isAdmin:   role === 'tenant_admin',
    isMember:  role === 'tenant_member',
    /** 是否为空间负责人（普通成员但负责至少一个工作空间，用于「空间视图」档） */
    isSpaceOwner,
    /** 该用户负责（my_role === 'ws_owner'）的工作空间 id 列表 */
    ownedWorkspaceIds,
  }
}
