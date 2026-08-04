import type { AccountBrief, Money } from '../account'
import type { CursorPage } from '../api'

// ─── Tenant ─────────────────────────────────────────

export interface TenantItem {
  tenant_id: string
  name: string
  slug: string
  type: 'personal' | 'enterprise'
  role: 'tenant_owner' | 'tenant_admin' | 'tenant_member'
  is_default: boolean
  max_workspaces: number
  current_workspace_count: number
  balance: Money | null
  logo_url?: string | null
}

export interface TenantDetail {
  tenant_id: string
  name: string
  slug: string
  type: 'personal' | 'enterprise'
  owner_account_id: string
  max_workspaces: number
  max_members: number
  status: 'active' | 'suspended' | 'deleted'
  created_at: string
  settings: TenantSettings
  logo_url?: string | null
}

export interface TenantSettings {
  billing_email: string
  invoice_company_name: string
  invoice_tax_id: string
}

export interface TenantMember {
  account: AccountBrief
  role: 'tenant_owner' | 'tenant_admin' | 'tenant_member'
  joined_at: string
  workspace_count: number
  api_key_count: number
  spend_30d: Money
  status: 'active' | 'suspended'
}

/** 待接受的邮件邀请项（Swagger tenant.PendingInviteItem，#11） */
export interface PendingTenantInvite {
  id: string
  email: string
  role: 'tenant_admin' | 'tenant_member'
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  invited_by?: string
  invited_by_display?: string
  created_at?: string
  expires_at?: string
}

/**
 * GET /tenants/:id/members 响应：成员分页 + 待接受邀请。
 * pending_invitations 不分页、恒存在（never null），与真实成员并列展示（#11）。
 */
export interface TenantMembersResponse extends CursorPage<TenantMember> {
  pending_invitations: PendingTenantInvite[]
}

/**
 * 成员被授权的单个 workspace（Swagger tenant.MemberWorkspaceItem，qa#420-3 / 需求方#175）。
 * 用于成员列表「授权工作空间」列点开后按需展示空间名称明细。
 */
export interface MemberWorkspaceItem {
  workspace_id: string
  name: string
  slug: string
  role: 'ws_owner' | 'ws_member'
  is_default: boolean
}

/** GET /tenants/:id/members/:accountId/workspaces 响应（Swagger tenant.MemberWorkspacesResponse） */
export interface MemberWorkspacesResponse {
  items: MemberWorkspaceItem[]
}

export interface AddTenantMemberRequest {
  emails: string[]
  role: 'tenant_admin' | 'tenant_member'
  target_workspace_id?: string
  expires_in_hours?: number
}

export interface AddTenantMemberResult {
  email: string
  invitation_id: string | null
  status: 'pending' | 'already_member'
}

export interface AddTenantMemberResponse {
  items: AddTenantMemberResult[]
}

export interface UpdateTenantMemberRoleRequest {
  role: 'tenant_admin' | 'tenant_member'
}

// ─── Tenant 操作审计（#342）───────────────────────────

export interface TenantAuditChange {
  field: string
  before: string
  after: string
}

export interface TenantAuditLog {
  id: string
  created_at: string
  tenant_id: string
  actor_account_id: string
  actor_display: string
  action: string
  target_type: string
  target_id: string
  target_label: string
  workspace_id: string
  result: 'success' | 'failure' | 'denied'
  request_id: string
  changes: TenantAuditChange[]
  metadata: Record<string, unknown>
}

export interface TenantAuditLogsResponse {
  items: TenantAuditLog[]
  next_cursor?: string
}
