import type { AccountBrief, Money } from '../account'

// ─── Workspace ──────────────────────────────────────

export interface WorkspaceItem {
  workspace_id: string
  tenant_id: string
  name: string
  slug: string
  kind: 'personal' | 'team'
  is_default: boolean
  description: string
  owner: Pick<AccountBrief, 'account_id' | 'display_name'>
  member_count: number
  api_key_count: number
  spend_7d: Money
  created_at: string
  my_role: 'ws_owner' | 'ws_admin' | 'ws_member'
  /** 以下 3 项后端待接（issue #329），未返回时前端展示占位 —/未知 */
  guardrail_count?: number
  logging_enabled?: boolean
  forward_enabled?: boolean
}

export interface WorkspaceDetail {
  workspace_id: string
  tenant_id: string
  name: string
  slug: string
  kind: 'personal' | 'team'
  is_default: boolean
  description: string
  owner: AccountBrief
  api_key_count: number
  no_api_keys_yet: boolean
  /** 运行资源（后端 workspace.Detail 已返回，对齐原型概览「运行资源」区） */
  member_count: number
  guardrail_count: number
  logging_enabled: boolean
  forward_enabled: boolean
  /** 最近一次调用时间（空=从未调用） */
  last_request_at: string
  usage_7d: { spend: Money; requests: number; tokens: number }
  status: 'active' | 'deleted'
  created_at: string
}

export interface CreateWorkspaceRequest {
  name: string
  slug: string
  description?: string
  kind?: 'team'
  invite_members?: Array<{ email: string; role: 'ws_owner' | 'ws_member' }>
}

export interface UpdateWorkspaceRequest {
  name?: string
  description?: string
}

export interface DeleteWorkspaceRequest {
  confirm_name: string
}

export interface WorkspaceMember {
  account: AccountBrief
  role: 'ws_owner' | 'ws_admin' | 'ws_member'
  joined_at: string
  last_active_at: string
  /** 该成员在本空间拥有的 API Key 数（后端待接 · issue #327），未返回时前端展示 — */
  api_key_count?: number
}

export interface AddWorkspaceMemberRequest {
  account_id: string
  role: 'ws_admin' | 'ws_member'
}

export interface UpdateWorkspaceMemberRoleRequest {
  role: 'ws_admin' | 'ws_member'
}
