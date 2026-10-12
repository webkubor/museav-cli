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
  phone?: string
  avatar_url: string | null
}

export interface OAuthConnection {
  provider: 'google' | 'github' | 'wechat'
  external_email: string | null
  connected_at: string | null
}

export interface AccountProfile {
  account_id: string
  has_password: boolean
  /** 当前账号保存的默认空间；未设置或已失去访问权限时为空字符串。 */
  default_workspace_id: string
  email: string
  email_verified_at: string
  display_name: string
  phone?: string
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
  /**
   * 本次调用是否建了号（prd#1228 / prd#1242）。注册端点恒为 true；`/auth/register`
   * 之外的两个「登录即注册」端点在 `LoginResult` 上给同一字段。
   */
  is_new_account?: boolean
}

export interface LoginResult {
  account: AccountBrief
  active_tenant_id: string
  active_workspace_id: string
  tenants: TenantBrief[]
  /**
   * 本次登录是否顺带建了号（国际站「登录即注册」，prd#1242 后端已上线）。
   * `true` 才补发 `sign_up`，其余（含字段缺失）一律按老账号处理。
   */
  is_new_account?: boolean
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
  /**
   * 本会话的 CSRF 派生值，写请求的 X-CSRF-Token 必须用它（需求方#676）。
   * 不能改回读 cookie —— 浏览器里存在同名影子 cookie 时 document.cookie 取到的
   * 是先创建那一枚，而服务端按最后一枚校验，方向相反必然 40302。见 lib/auth/csrf-token.ts。
   */
  csrf_token?: string
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
  current_password?: string
  new_password: string
}

export interface SetDefaultWorkspaceRequest {
  /** 空字符串明确取消默认空间；不能省略或传 null。 */
  workspace_id: string
}

export interface SetDefaultWorkspaceResponse {
  default_workspace_id: string
}

export interface DeleteAccountRequest {
  password: string
  reason: string
}

export interface DeleteAccountResult {
  deletion_scheduled_at: string
}

export interface Preferences {
  /** timezone：IANA 名（如 Asia/Shanghai）| 'browser'（跟随浏览器哨兵）| 空（未设置）。后端 #409 落地前为 optional，缺失时前端回退 localStorage/浏览器。 */
  ui: { language: 'zh-CN' | 'en-US'; timezone?: string }
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
