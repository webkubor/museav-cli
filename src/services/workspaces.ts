/**
 * 工作区管理（§六）
 * 路由：/workspaces、/workspaces/:id
 * API：GET|POST /workspaces、GET|PATCH|DELETE /workspaces/:id、GET|POST|PATCH|DELETE /workspaces/:id/members
 */
import { del, get, getPage, patch, post, put } from '@/lib/request'
import type { WorkspaceMemberListParams } from '@/interfaces/workspaces'
import type {
  AddWorkspaceMemberRequest,
  CreateWorkspaceRequest,
  CursorPage,
  DeleteWorkspaceRequest,
  UpdateWorkspaceMemberRoleRequest,
  UpdateWorkspaceRequest,
  WorkspaceDetail,
  WorkspaceItem,
  WorkspaceMember,
} from '@/types'

/**
 * 获取当前 tenant 下的 workspace 列表（需 X-Tenant-Id header）。
 * 该接口无游标，直接返回数组——形态归一在 getPage 内完成，调用方拿到的就是列表本身。
 */
export async function listWorkspaces(): Promise<WorkspaceItem[]> {
  return (await getPage<CursorPage<WorkspaceItem>>('workspaces')).items
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
  return getPage<CursorPage<WorkspaceMember>>(`workspaces/${workspaceId}/members`, params)
}

/** 添加已有 Tenant 成员到 workspace */
export function addWorkspaceMember(workspaceId: string, body: AddWorkspaceMemberRequest) {
  return post<null>(`workspaces/${workspaceId}/members`, body)
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

/**
 * 移除成员时批量处理其名下 API Key（转移给空间负责人 / 停用）。
 * 对齐原型 SpaceMemberRemovalImpactModal 的 onConfirm(strategy)。
 * 后端约定：DELETE /workspaces/:id/members/:accountId 带 body 指定 key 处理策略。
 */
export function removeWorkspaceMemberWithStrategy(
  workspaceId: string,
  accountId: string,
  body: { key_strategy: 'transfer' | 'disable' }
) {
  return del<null>(`workspaces/${workspaceId}/members/${accountId}`, body)
}

/**
 * 设置空间负责人（对齐原型「设为负责人」按钮）。
 * 后端接口已交付（qa#327 已完成）：PUT /workspaces/:id/owner，body { account_id }，
 * 仅当前 ws_owner 可调用，目标需已是该空间成员，原 owner 自动降级 ws_admin。
 * 与 updateWorkspaceMemberRole 不同——后者只改 ws_admin/ws_member，不含 owner。
 */
export function setWorkspaceOwner(workspaceId: string, accountId: string) {
  return put<null>(`workspaces/${workspaceId}/owner`, { account_id: accountId })
}
