import type { AccountBrief, Money, TenantBrief } from './account'
import type { CursorPage } from './api'

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

// ─── API Key ────────────────────────────────────────

/** 消费限额时间维度 —— 与安全护栏 budget policy 的 period_unit 完全一致 */
export type SpendingPeriodUnit = 'hour' | 'day' | 'week' | 'month'

export interface SpendingLimit {
  amount: string
  currency: string
  /** 时间维度，对齐护栏（每小时/每日/每周/每月）；与 period_length 组合 */
  period_unit: SpendingPeriodUnit
  /** 周期长度，默认 1（如 period_unit=month, period_length=1 即每月） */
  period_length: number
}

/** API Key 类型（PRD v1.0.3 #382）：私有 / 成员 / 服务；后端未回时由 scope 派生 */
export type ApiKeyType = 'personal' | 'member' | 'service'

/**
 * 状态（对齐 PRD 原型 apiKeyStatusOptions）。后端现回 active|disabled|revoked，
 * expired/limited 待 #407、rotation_required 待 #385 落地——UI 已就绪。
 * revoked=软删（PRD 无此态，后端软删保留，列表一般不返回）。
 */
export type ApiKeyStatus = 'active' | 'disabled' | 'expired' | 'limited' | 'rotation_required' | 'revoked'

export type ApiKeyMember = Pick<AccountBrief, 'account_id' | 'display_name' | 'email'>

/** 行级能力位（后端 apikey.Capabilities，对象形式）。缺失时由 usePermissions 权限回退。 */
export interface ApiKeyCapabilities {
  can_view?: boolean
  can_update_limit?: boolean
  can_disable?: boolean
  can_enable?: boolean
  can_rotate?: boolean
  can_delete?: boolean
}

export interface ApiKeyItem {
  api_key_id: string
  name: string
  prefix: string
  masked: string
  /** 轮转宽限期内的旧 Token 掩码（qa#515）；确认完成轮转后为空。 */
  previous_masked?: string
  env: 'live' | 'test'
  status: ApiKeyStatus
  owner: ApiKeyMember
  expires_at: string | null
  last_used_at: string | null
  total_spend: Money
  limit: SpendingLimit
  /**
   * 实际约束该 key 的最严 per_api_key 预算（qa#516，接口权威）：key 自身
   * spending_limit 与生效护栏层 active per_api_key budget 中金额最小者；
   * 全部无限额时缺失。限额列展示优先读它，limit 仍为 key 自身限额。
   */
  effective_limit?: SpendingLimit
  created_at: string
  scope: 'personal' | 'workspace' | 'member'
  guardrail_id?: string
  guardrails?: ApiKeyGuardrailSummary[]
  /** 可通过 reveal 端点取回完整明文（#298）；早期 key 无密文为 false，复制按钮置灰 */
  revealable?: boolean

  // ── PRD v1.0.3 扩字段（#382/#383 已交付，全部 optional，缺失时由 derive.ts 回退）──
  /** Key 类型；缺失时由 scope 派生 */
  key_type?: ApiKeyType
  /** 负责人；缺失时回退 owner（PRD：owner=创建人 creator，responsible_member=负责人） */
  responsible_member?: ApiKeyMember
  /** 本期消费；缺失时回退 total_spend */
  period_spend?: Money
  /** 行级能力位（对象）；缺失时由权限回退 */
  capabilities?: ApiKeyCapabilities
}

/** 顶部摘要卡（#383 GET /api-keys/summary）；后端未交付时由列表客户端派生 */
export interface ApiKeySummary {
  total: number
  active: number
  expiring_soon: number
  limit_reached: number
  month_spend: Money
}

/** 详情最近调用条目（#383） */
export interface ApiKeyRecentCall {
  log_id: string
  created_at: string
  model: string
  status: string
  cost: Money
}

/** 操作审计条目（后端 apikey.AuditLog） */
export interface ApiKeyAuditEntry {
  id: string
  created_at: string
  action: string
  /** 操作人展示名 */
  actor_display?: string
  actor_account_id?: string
  /** 结果 */
  result?: string
  request_id?: string
  target_label?: string
  changes?: { field: string; before?: string; after?: string }[]
}

/** 审计列表响应（后端 apikey.AuditLogsResponse） */
export interface ApiKeyAuditLogsResponse {
  items: ApiKeyAuditEntry[]
  next_cursor?: string
}

/** 详情用量（后端 apikey.DetailUsage） */
export interface ApiKeyDetailUsage {
  period_spend?: Money
  request_count?: number
  token_count?: number
}

/** Key 详情（#383 GET /api-keys/{keyId}）；= 列表项 + 用量 + 最近调用 + 内嵌审计 */
export interface ApiKeyDetail extends ApiKeyItem {
  usage?: ApiKeyDetailUsage
  recent_calls?: ApiKeyRecentCall[]
  recent_audit?: ApiKeyAuditEntry[]
}

/** 轮转返回（#384 POST /api-keys/{keyId}/rotate）；新 Token 只回一次 */
export interface ApiKeyRotateResponse {
  new_key: string
  rotated_at: string
  /** 旧 Token 掩码(服务端权威返回,宽限期内仍有效)——#515/#218 */
  previous_masked?: string
  /** 旧 Token 过渡期截止 */
  old_key_grace_until?: string
}

/** 变更负责人（POST /api-keys/{keyId}/change-owner，已就绪） */
export interface ChangeApiKeyOwnerRequest {
  new_owner_account_id: string
}

export interface ApiKeyGuardrailSummary {
  id: string
  name: string
  is_default: boolean
  /** 护栏作用域（需求方#246/#147）：区分全局/个人/Key，列表「Key护栏」列按 scope==='key' 筛 */
  scope?: 'global' | 'personal' | 'member' | 'key'
  kind?: 'regular' | 'boost'
}

export interface CreateApiKeyRequest {
  name: string
  expires_at?: string | null
  spending_limit?: SpendingLimit
  scope?: 'personal' | 'workspace' | 'member'
  member_account_id?: string
  guardrail_ids?: string[]
}

export interface ApiKeyCreated {
  api_key_id: string
  name: string
  key: string
  prefix: string
  masked: string
  env: 'live' | 'test'
  created_at: string
  scope: 'personal' | 'workspace' | 'member'
}

/** 后端 PATCH 更新用「可空包装」区分「设值/清空」与「不变」：set=true 表示本次设置 value（含清空）。 */
export interface NullableExpiry {
  set: boolean
  /** ISO 时间；空串表示永不过期 */
  value?: string
}
export interface NullableSpendingLimit {
  set: boolean
  /** null 表示不限额 */
  value?: SpendingLimit | null
}

export interface UpdateApiKeyRequest {
  name?: string
  expires_at?: NullableExpiry
  spending_limit?: NullableSpendingLimit
  guardrail_ids?: string[] | null
}
