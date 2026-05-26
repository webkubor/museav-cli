/**
 * 邀请管理（§七）
 * 路由：/workspaces/:id/invitations
 * API：POST /workspaces/:id/invitations、GET|DELETE /invitations、GET /invitations/:token、POST /invitations/:token/accept
 */
import { del, get, post } from '@/lib/request'
import type { InvitationListParams, InvitationListResponse } from '@/interfaces/invitations'
import type {
  AcceptInvitationResult,
  CreateInvitationRequest,
  CreateInvitationResponse,
  InvitationPreview,
  WorkspaceInviteLink,
} from '@/types'

/** 在指定 workspace 下发起邀请 */
export function createInvitations(workspaceId: string, body: CreateInvitationRequest) {
  return post<CreateInvitationResponse>(`workspaces/${workspaceId}/invitations`, body)
}

/** 获取 workspace 下的邀请列表 */
export function listInvitations(workspaceId: string, params?: InvitationListParams) {
  return get<InvitationListResponse>(`workspaces/${workspaceId}/invitations`, params)
}

/** 撤销邀请（inviter 或 ws_owner / ws_admin 可操作） */
export function revokeInvitation(invitationId: string) {
  return del<null>(`invitations/${invitationId}`)
}

/**
 * 通过 token 预览邀请信息（未登录可调）。
 * 用于注册/登录前展示"你被邀请加入 XXX workspace"。
 */
export function previewInvitation(token: string) {
  return get<InvitationPreview>(`invitations/${token}`)
}

/**
 * 接受邀请（需已登录）。
 * workspaceId 仅组织邀请链接时传入，表示用户选择加入的工作区。
 */
export function acceptInvitation(token: string, workspaceId?: string) {
  return post<AcceptInvitationResult>(
    `invitations/${token}/accept`,
    workspaceId ? { workspace_id: workspaceId } : {}
  )
}

/** 获取工作区的开放邀请链接 */
export function getInviteLink(workspaceId: string) {
  return get<WorkspaceInviteLink>(`workspaces/${workspaceId}/invite-link`)
}

/** 重置工作区开放邀请链接（旧 token 立即失效） */
export function resetInviteLink(workspaceId: string, role: 'ws_member' | 'ws_admin') {
  return post<WorkspaceInviteLink>(`workspaces/${workspaceId}/invite-link/reset`, { role })
}
