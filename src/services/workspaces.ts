/**
 * 工作区管理（§六）
 * 路由：/workspaces、/workspaces/:id
 * API：GET|POST /workspaces、GET|PATCH|DELETE /workspaces/:id、GET|PATCH|DELETE /workspaces/:id/members
 */
import { del, get, patch, post } from '@/lib/request'
import type { WorkspaceListResponse, WorkspaceMemberListParams } from '@/interfaces/workspaces'
import type {
  CreateWorkspaceRequest,
  CursorPage,
  DeleteWorkspaceRequest,
  UpdateWorkspaceMemberRoleRequest,
  UpdateWorkspaceRequest,
  WorkspaceDetail,
  WorkspaceMember,
} from '@/types'

/** 获取当前 tenant 下的 workspace 列表（需 X-Tenant-Id header） */
export function listWorkspaces() {
  return get<WorkspaceListResponse>('workspaces')
}

/** 创建新 workspace（创建时可选批量发送邀请） */
export function createWorkspace(body: CreateWorkspaceRequest) {
  return post<WorkspaceDetail>('workspaces', body)
}

/** 获取 workspace 详情（含 usage_7d 三卡和状态 banner 标记） */
export function getWorkspace(workspaceId: string) {
  return get<WorkspaceDetail>(`workspaces/${workspaceId}`)
}

/** 更新 workspace 名称 / 描述 */
export function updateWorkspace(workspaceId: string, body: UpdateWorkspaceRequest) {
  return patch<WorkspaceDetail>(`workspaces/${workspaceId}`, body)
}

/**
 * 删除 workspace（需二次确认 confirm_name 与当前名称完全一致）。
 * personal 的 Default Workspace 不可删除，返回 42201。
 */
export function deleteWorkspace(workspaceId: string, body: DeleteWorkspaceRequest) {
  return del<null>(`workspaces/${workspaceId}`, body)
}

// ─── Workspace 成员管理 ────────────────────────────

/** 获取 workspace 成员列表 */
export function listWorkspaceMembers(workspaceId: string, params?: WorkspaceMemberListParams) {
  return get<CursorPage<WorkspaceMember>>(`workspaces/${workspaceId}/members`, params)
}

/** 修改成员角色（ws_admin | ws_member） */
export function updateWorkspaceMemberRole(
  workspaceId: string,
  accountId: string,
  body: UpdateWorkspaceMemberRoleRequest
) {
  return patch<null>(`workspaces/${workspaceId}/members/${accountId}`, body)
}

/** 从 workspace 移除成员 */
export function removeWorkspaceMember(workspaceId: string, accountId: string) {
  return del<null>(`workspaces/${workspaceId}/members/${accountId}`)
}
