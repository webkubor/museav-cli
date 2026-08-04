import type { AccountBrief, TenantBrief } from '../account'
import type { WorkspaceItem } from './workspace'

// ─── Invitation ─────────────────────────────────────

export interface InvitationItem {
  invitation_id: string
  email: string
  role: 'ws_member' | 'ws_admin'
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  expires_at: string
  invited_by: string
}

export interface CreateInvitationRequest {
  invites: Array<{ email: string; role: 'ws_member' | 'ws_admin' }>
  expires_in_hours?: number
}

export interface CreateInvitationResponse {
  items: InvitationItem[]
}

export interface InvitationPreview {
  invitation_id: string
  tenant: TenantBrief
  workspace: Omit<WorkspaceItem, 'spend_7d' | 'api_key_count' | 'member_count' | 'my_role'>
  invited_by: AccountBrief
  email?: string
  role: 'ws_member' | 'ws_admin'
  expires_at: string
  workspaces?: Array<{ workspace_id: string; name: string }>
}

export interface AcceptInvitationResult {
  workspace_id: string
  tenant_id: string
  role: 'ws_member' | 'ws_admin'
}

export interface TenantInviteLink {
  token: string
  created_at: string
  created_by: string
  /** 链接绑定的初始角色（后端 #326；旧链接为空串） */
  role?: 'tenant_admin' | 'tenant_member' | ''
  /** 到期时间（空=永不过期） */
  expires_at?: string
  /** 是否一次性使用（接受一次即失效） */
  single_use?: boolean
}

export interface TenantInviteLinkPreview {
  token: string
  tenant: { tenant_id: string; name: string; slug: string }
  workspaces: Array<{ workspace_id: string; name: string }>
  created_by: { account_id: string; display_name: string }
}

export interface TenantInviteLinkAcceptResult {
  tenant_id: string
  workspace_id?: string
}
