// ─── 通用金额 ────────────────────────────────────────

export interface Money {
  amount: string
  currency: string
}

export interface SignedMoney extends Money {
  signed_amount: string
}

// ─── Account ────────────────────────────────────────

export interface AccountBrief {
  account_id: string
  display_name: string
  email: string
  avatar_url: string | null
}

export interface OAuthConnection {
  provider: 'google' | 'github' | 'wechat'
  external_email: string | null
  connected_at: string | null
}

export interface AccountProfile {
  account_id: string
  email: string
  email_verified_at: string
  display_name: string
  avatar_url: string | null
  created_at: string
  connected_oauth: OAuthConnection[]
}

export interface SessionInfo {
  session_id: string
  expires_at: string
  last_seen_at: string
}

// ─── Auth ───────────────────────────────────────────

export interface RegisterResult {
  account: AccountBrief
  default_tenant_id: string
  default_workspace_id: string
}

export interface LoginResult {
  account: AccountBrief
  active_tenant_id: string
  active_workspace_id: string
  tenants: TenantBrief[]
}

export interface CheckLoginEmailResult {
  registered: boolean
  password_login_enabled: boolean
}

export interface SessionMenu {
  key: string
  name: string
  scope: 'tenant' | 'workspace' | 'settings'
  visible: boolean
  view_permission?: string
  actions: Record<string, boolean>
}

export interface SessionPermissions {
  active_tenant_id: string
  active_tenant_type: string
  active_workspace_id: string
  region: 'domestic' | 'global'
  tenant_role: string
  workspace_role: string
  granted: string[]
  menus: SessionMenu[]
}

export interface SessionResult {
  account: AccountBrief
  active_tenant_id: string
  active_workspace_id: string
  tenants: TenantBrief[]
  permissions: SessionPermissions
  session: SessionInfo
}

export interface RegisterRequest {
  email: string
  password: string
  display_name: string
  email_code: string
  invitation_token?: string
  referral_code?: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface SwitchTenantRequest {
  tenant_id: string
}

// ─── Profile & Preferences ──────────────────────────

export interface UpdateProfileRequest {
  display_name?: string
}

export interface ChangePasswordRequest {
  current_password: string
  new_password: string
}

export interface DeleteAccountRequest {
  password: string
  reason: string
}

export interface DeleteAccountResult {
  deletion_scheduled_at: string
}

export interface Preferences {
  ui: { language: 'zh-CN' | 'en-US' }
  notifications: { low_balance_alerts_enabled: boolean }
}

export interface UpdatePreferencesRequest {
  ui?: Partial<Preferences['ui']>
  notifications?: Partial<Preferences['notifications']>
}

// referenced by LoginResult / SessionResult — defined here to avoid circular import
export interface TenantBrief {
  tenant_id: string
  name: string
  slug: string
  type: 'personal' | 'enterprise'
  is_default: boolean
  logo_url?: string | null
}
