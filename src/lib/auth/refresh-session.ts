/**
 * 会话权限热刷新（非 React 上下文可用）。
 *
 * 权限码/菜单由 /auth/session 一次性下发进 store（AuthProvider 挂载时）；
 * 之后任何**改变当前用户权限面的操作**（设为空间负责人、企业角色变更、
 * 移交所有权等）成功后必须调用本函数重拉会话——否则侧栏菜单、页内 tab、
 * 按钮 gating 全部停留在旧权限，需要手动刷新页面才更新。
 *
 * 与 AuthProvider 首拉共用同一套落 store 逻辑（工作区恢复 localStorage 优先）。
 */
import { getSession } from '@/services/auth'
import { useAuthStore } from '@/store/auth'
import { storageKeys } from '@/lib/storage'
import type { SessionResult } from '@/types'

/** 把 /auth/session 结果落进 auth store（AuthProvider 首拉与热刷新共用） */
export function applySessionToStore(result: SessionResult): void {
  const persistedWs = localStorage.getItem(storageKeys.activeWorkspaceId(result.active_tenant_id))
  useAuthStore.getState().setAuth(
    result.account,
    result.active_tenant_id,
    result.tenants,
    persistedWs || result.active_workspace_id,
    result.permissions?.granted ?? null,
    result.permissions?.menus ?? [],
  )
}

/** 重拉会话刷新权限码/菜单。失败静默（下次整页刷新自然纠正），不打断业务操作的成功反馈。 */
/** 从 localStorage 读当前活跃空间 id（key 按租户隔离，需先有活跃租户）。 */
function activeWorkspaceIdFromStorage(): string | undefined {
  const tenantId = localStorage.getItem(storageKeys.activeTenantId())
  if (!tenantId) return undefined
  return localStorage.getItem(storageKeys.activeWorkspaceId(tenantId)) || undefined
}

/**
 * 按「当前活跃空间」解析会话（带 workspace_id）。首拉与热刷新共用。
 * session 默认按租户默认空间解析权限——活跃的是非默认空间时不带 id 会拿错权限（少 tab/按钮，需求方#255）。
 */
export function getSessionForActiveWorkspace(): Promise<SessionResult> {
  return getSession(activeWorkspaceIdFromStorage())
}

export async function refreshSession(): Promise<void> {
  try {
    applySessionToStore(await getSessionForActiveWorkspace())
  } catch {
    /* 权限热刷新失败不阻断业务；旧权限顶多保守（fail-closed 由各 gate 兜底） */
  }
}

/**
 * 切换活跃空间：先持久化选择，再按新空间重拉会话权限，
 * 使 tab / 侧栏 / 按钮 gating 随所在空间即时更新（需求方#255、#216）。
 */
export async function switchActiveWorkspace(workspaceId: string): Promise<void> {
  useAuthStore.getState().setActiveWorkspaceId(workspaceId)
  await refreshSession()
}
