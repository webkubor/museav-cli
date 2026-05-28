/**
 * 工作区层权限 Hook
 *
 * 数据来源：GET /workspaces → WorkspaceItem.my_role
 * 作用范围：当前激活工作区内的操作权限
 *   - ws_owner  : 拥有者，完全控制
 *   - ws_admin  : 管理员，可管理成员/护栏/邀请等
 *   - ws_member : 普通成员，只读
 */
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { listWorkspaces } from '@/services/workspaces'

export type WorkspaceRole = 'ws_owner' | 'ws_admin' | 'ws_member'

export function useWorkspaceRole() {
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const activeTenantId    = useAuthStore((s) => s.activeTenantId)

  const { data: workspaces = [], isLoading } = useQuery({
    queryKey: ['workspaces', activeTenantId],
    queryFn: () => listWorkspaces().then((r) => r.items ?? []),
    enabled: !!activeTenantId,
    staleTime: 60_000,
  })

  const role = workspaces.find(
    (w) => w.workspace_id === activeWorkspaceId
  )?.my_role as WorkspaceRole | undefined

  return {
    /** 当前工作区角色，查询未完成时为 undefined */
    role,
    isLoading,
    /** 可管理工作区（owner 或 admin）；角色未知时默认 true，服务端二次校验 */
    canManage: role !== 'ws_member',
    isOwner:   role === 'ws_owner',
    isAdmin:   role === 'ws_admin',
    isMember:  role === 'ws_member',
  }
}
