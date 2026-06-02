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
