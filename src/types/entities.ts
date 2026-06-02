/** ModelGo 业务实体类型定义
 *
 * 所有类型严格对齐测试环境 Swagger API 文档 v1.2 的响应字段。
 * ID 全部为 string（ULID），金额字段为 string 小数。
 */

// ─── 通用 ───────────────────────────────────────────

/** 金额对象 */
export interface Money {
  /** 金额字符串，保留 6 位小数 */
  amount: string
  /** 币种，如 USD */
  currency: string
}

/** 带正负号的金额（用于交易记录前端展示） */
export interface SignedMoney extends Money {
  /** 带正负号的金额字符串，如 "+50.00" */
  signed_amount: string
}

// ─── Account ────────────────────────────────────────

/** 简化 Account（列表/嵌入用） */
export interface AccountBrief {
  account_id: string
  display_name: string
  email: string
  avatar_url: string | null
}

/** OAuth 第三方连接 */
export interface OAuthConnection {
  provider: 'google' | 'github' | 'wechat'
  /** 可能为 null */
  external_email: string | null
  /** ISO 8601 */
  connected_at: string | null
}

/** 完整 Account Profile（GET /account/profile） */
export interface AccountProfile {
  account_id: string
  email: string
  email_verified_at: string
  display_name: string
  avatar_url: string | null
  created_at: string
  connected_oauth: OAuthConnection[]
}

/** 会话信息（GET /auth/session） */
export interface SessionInfo {
  session_id: string
  expires_at: string
  last_seen_at: string
}

// ─── Auth ───────────────────────────────────────────

/** 注册响应 data */
export interface RegisterResult {
  account: AccountBrief
  default_tenant_id: string
  default_workspace_id: string
}

/** 登录响应 data */
export interface LoginResult {
  account: AccountBrief
  active_tenant_id: string
  active_workspace_id: string
  tenants: TenantBrief[]
}

/** 登录前邮箱校验响应 data */
export interface CheckLoginEmailResult {
  registered: boolean
  password_login_enabled: boolean
}

/** 会话响应 data */
export interface SessionResult {
  account: AccountBrief
  active_tenant_id: string
  active_workspace_id: string
  tenants: TenantBrief[]
  permissions: string[]
  session: SessionInfo
}

/** 注册请求体 */
export interface RegisterRequest {
  email: string
  password: string
  display_name: string
  email_code: string
  invitation_token?: string
}

/** 登录请求体 */
export interface LoginRequest {
  email: string
  password: string
}

/** 切换活跃 Tenant 请求体 */
export interface SwitchTenantRequest {
  tenant_id: string
}

// ─── Tenant ─────────────────────────────────────────

/** 简化 Tenant（列表嵌入用） */
export interface TenantBrief {
  tenant_id: string
  name: string
  slug: string
  /** personal | enterprise */
  type: 'personal' | 'enterprise'
  is_default: boolean
  logo_url?: string | null
}

/** Tenant 列表项（含当前用户在该 tenant 的角色/余额） */
export interface TenantItem {
  tenant_id: string
  name: string
  slug: string
  type: 'personal' | 'enterprise'
  /** 当前 account 在该 tenant 中的角色 */
  role: 'tenant_owner' | 'tenant_admin' | 'tenant_member'
  is_default: boolean
  max_workspaces: number
  current_workspace_count: number
  /** 余额；仅 tenant_owner / tenant_admin 可见，其他角色为 null */
  balance: Money | null
  logo_url?: string | null
}

/** Tenant 详情（GET /tenants/{tenantId}） */
export interface TenantDetail {
  tenant_id: string
  name: string
  slug: string
  type: 'personal' | 'enterprise'
  owner_account_id: string
  max_workspaces: number
  max_members: number
  status: 'active' | 'suspended'
  created_at: string
  settings: TenantSettings
  logo_url?: string | null
}

/** Tenant 设置 */
export interface TenantSettings {
  billing_email: string
  invoice_company_name: string
  invoice_tax_id: string
}

/** Tenant 成员列表项 */
export interface TenantMember {
  account: AccountBrief
  role: 'tenant_owner' | 'tenant_admin' | 'tenant_member'
  joined_at: string
  workspace_count: number
  api_key_count: number
  spend_30d: Money
  status: 'active'
}

/** 添加 Tenant 成员请求体 */
export interface AddTenantMemberRequest {
  emails: string[]
  role: 'tenant_admin' | 'tenant_member'
  target_workspace_id?: string
  expires_in_hours?: number
}

/** 添加 Tenant 成员的逐条结果 */
export interface AddTenantMemberResult {
  email: string
  invitation_id: string | null
  status: 'pending' | 'already_member'
}

/** 添加 Tenant 成员响应 */
export interface AddTenantMemberResponse {
  items: AddTenantMemberResult[]
}

/** 修改 Tenant 成员角色请求体 */
export interface UpdateTenantMemberRoleRequest {
  role: 'tenant_admin' | 'tenant_member'
}

// ─── Workspace ──────────────────────────────────────

/** Workspace 列表项 */
export interface WorkspaceItem {
  workspace_id: string
  tenant_id: string
  name: string
  slug: string
  /** personal | team */
  kind: 'personal' | 'team'
  is_default: boolean
  description: string
  owner: Pick<AccountBrief, 'account_id' | 'display_name'>
  member_count: number
  api_key_count: number
  spend_7d: Money
  created_at: string
  /** 当前 account 在该 workspace 中的角色 */
  my_role: 'ws_owner' | 'ws_admin' | 'ws_member'
}

/** Workspace 详情 */
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
  /** 原型 #88 状态 banner 标记 */
  no_api_keys_yet: boolean
  usage_7d: {
    spend: Money
    requests: number
    tokens: number
  }
  status: 'active' | 'deleted'
  created_at: string
}

/** 创建 Workspace 请求体 */
export interface CreateWorkspaceRequest {
  name: string
  slug: string
  description?: string
  kind?: 'team'
  invite_members?: Array<{
    email: string
    role: 'ws_member' | 'ws_admin'
  }>
}

/** 更新 Workspace 请求体 */
export interface UpdateWorkspaceRequest {
  name?: string
  description?: string
}

/** 删除 Workspace 确认请求体 */
export interface DeleteWorkspaceRequest {
  confirm_name: string
}

/** Workspace 成员列表项 */
export interface WorkspaceMember {
  account: AccountBrief
  role: 'ws_owner' | 'ws_admin' | 'ws_member'
  joined_at: string
  last_active_at: string
}

/** 修改 Workspace 成员角色请求体 */
export interface UpdateWorkspaceMemberRoleRequest {
  role: 'ws_admin' | 'ws_member'
}

// ─── Invitation ─────────────────────────────────────

/** 邀请列表项 */
export interface InvitationItem {
  invitation_id: string
  email: string
  role: 'ws_member' | 'ws_admin'
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  expires_at: string
  invited_by: string
}

/** 创建邀请请求体 */
export interface CreateInvitationRequest {
  invites: Array<{
    email: string
    role: 'ws_member' | 'ws_admin'
  }>
  expires_in_hours?: number
}

/** 创建邀请响应 */
export interface CreateInvitationResponse {
  items: InvitationItem[]
}

/** 邀请预览（未登录可调，通过 token） */
export interface InvitationPreview {
  invitation_id: string
  tenant: TenantBrief
  workspace: Omit<WorkspaceItem, 'spend_7d' | 'api_key_count' | 'member_count' | 'my_role'>
  invited_by: AccountBrief
  /** 邮件邀请时有值；开放邀请链接时为 undefined */
  email?: string
  role: 'ws_member' | 'ws_admin'
  expires_at: string
  /** 组织邀请链接时存在，展示可选工作区列表 */
  workspaces?: Array<{ workspace_id: string; name: string }>
}

/** 接受邀请响应 */
export interface AcceptInvitationResult {
  workspace_id: string
  tenant_id: string
  role: 'ws_member' | 'ws_admin'
}

/** 组织邀请链接 */
export interface TenantInviteLink {
  token: string
  created_at: string
  created_by: string
}

/** 组织邀请链接落地页预览数据 */
export interface TenantInviteLinkPreview {
  token: string
  tenant: { tenant_id: string; name: string; slug: string }
  workspaces: Array<{ workspace_id: string; name: string }>
  created_by: { account_id: string; display_name: string }
}

/** 接受组织邀请链接结果 */
export interface TenantInviteLinkAcceptResult {
  tenant_id: string
  workspace_id?: string
}

// ─── API Key ────────────────────────────────────────

/** 消费限额 */
export interface SpendingLimit {
  amount: string
  currency: string
  /** total（不限期）| monthly */
  period: 'total' | 'monthly'
}

/** API Key 列表项 */
export interface ApiKeyItem {
  api_key_id: string
  name: string
  prefix: string
  masked: string
  /** live | test */
  env: 'live' | 'test'
  status: 'active' | 'revoked'
  owner: Pick<AccountBrief, 'account_id' | 'display_name' | 'email'>
  expires_at: string | null
  last_used_at: string | null
  /** All-time cumulative settled spend, labelled with the platform settlement currency (USD international / CNY china). */
  total_spend: Money
  limit: SpendingLimit
  created_at: string
}

/** 创建 API Key 请求体 */
export interface CreateApiKeyRequest {
  name: string
  expires_at?: string | null
  spending_limit?: SpendingLimit
  /** 作用域：个人 / 工作区 / 成员 */
  scope?: 'personal' | 'workspace' | 'member'
  /** scope=member 时指定目标成员 */
  member_account_id?: string
}

/** 创建 API Key 响应（含仅一次返回的明文 key） */
export interface ApiKeyCreated {
  api_key_id: string
  name: string
  /** 明文 key，仅创建时返回一次 */
  key: string
  prefix: string
  masked: string
  env: 'live' | 'test'
  created_at: string
}

/** 更新 API Key 请求体 */
export interface UpdateApiKeyRequest {
  name?: string
  expires_at?: string | null
  spending_limit?: SpendingLimit
}

// ─── Account Profile 更新 ───────────────────────────

/** 更新个人资料请求体 */
export interface UpdateProfileRequest {
  display_name?: string
}

/** 修改密码请求体 */
export interface ChangePasswordRequest {
  current_password: string
  new_password: string
}

/** 删除账户请求体 */
export interface DeleteAccountRequest {
  password: string
  reason: string
}

/** 删除账户响应 */
export interface DeleteAccountResult {
  deletion_scheduled_at: string
}

// ─── Preferences ────────────────────────────────────

/** 用户偏好 */
export interface Preferences {
  ui: {
    language: 'zh-CN' | 'en-US'
  }
  notifications: {
    low_balance_alerts_enabled: boolean
  }
}

/** 更新偏好请求体（JSON Merge Patch） */
export interface UpdatePreferencesRequest {
  ui?: Partial<Preferences['ui']>
  notifications?: Partial<Preferences['notifications']>
}

// ─── Observability ──────────────────────────────────

/** Logging 配置 */
export interface LoggingConfig {
  input_output_logging_enabled: boolean
  broadcast_enabled: boolean
  retention_days: number
}

/** 更新 Logging 配置请求体 */
export interface UpdateLoggingConfigRequest {
  input_output_logging_enabled?: boolean
  broadcast_enabled?: boolean
  retention_days?: number
}

/** 可观测平台配置字段 schema */
export interface PlatformConfigField {
  key: string
  type: 'string' | 'secret' | 'json'
  required: boolean
  label: string
}

/** 可观测平台 */
export interface PlatformItem {
  platform: string
  display_name: string
  logo_url: string
  config_schema: {
    fields: PlatformConfigField[]
  }
}

/** Destination 配置 */
export interface ForwardItem {
  forward_id: string
  platform: string
  name: string
  enabled: boolean
  config: Record<string, unknown>
  scope: {
    workspace_ids: string[]
  }
  last_success_at: string | null
  last_error: string | null
  api_key_ids: string[]
  privacy_mode_enabled: boolean
  sampling_rate: number
  status: string
}

/** 创建 / 更新 Destination 请求体 */
export interface CreateForwardRequest {
  platform: string
  name: string
  config: Record<string, string>
  enabled?: boolean
  api_key_ids?: string[]
  privacy_mode_enabled?: boolean
  sampling_rate?: number
}

// ─── Billing ────────────────────────────────────────

/** 余额信息 */
export interface BalanceInfo {
  balance: Money
  reserved: Money
  available: Money
  low_balance_threshold: Money
}

/** Dashboard 金额类总览 */
export interface BillingMoneyStatsResponse {
  available_balance: Money
  frozen_balance: Money
  monthly_spend: Money
}

/** 创建充值订单请求体 */
export interface CreateRechargeRequest {
  amount: string
  currency: string
  /** alipay | wechat | stripe */
  channel: 'alipay' | 'wechat' | 'stripe'
  return_url?: string
  promo_code?: string
}

/** 创建充值订单响应 */
export interface RechargeCreated {
  order_no: string
  status: 'pending'
  payment: {
    channel: string
    qr_code_url?: string
    redirect_url?: string
  }
  expires_at: string
}

/** 充值订单详情 */
export interface RechargeOrder {
  order_no: string
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded'
  amount: string
  currency: string
  channel: string
  promo_code: string | null
  credited_amount: string
  paid_at: string | null
  invoice_url: string | null
}

/** 兑换 Promo Code 请求体 */
export interface RedeemPromoRequest {
  code: string
}

/** 兑换 Promo Code 响应 */
export interface RedeemPromoResult {
  credited: Money
  balance_after: Money
}

// ─── Usage ──────────────────────────────────────────

/** 用量汇总（usage.SummaryResponse） */
export interface UsageSummary {
  total: {
    spend: Money
    requests: number
    tokens: number
    input_tokens: number
    output_tokens: number
    average_latency_ms: number
    error_rate: number
  }
  period: { from: string; to: string }
  daily: Array<{ date: string; requests: number; spend: Money }>
  usage_series: UsageSeriesPoint[]
  request_series: UsageSeriesPoint[]
  groups?: Array<{
    key: string
    label: string
    spend: Money
    requests: number
    tokens: number
  }>
}

/** UI 内部折线图数据点（经过转换的） */
export interface SeriesDataPoint {
  bucket_start: string
  value: string
}

/** API 原始时序数据点（usage.SeriesPoint） */
export interface UsageSeriesPoint {
  bucket_start: string
  spend: Money
  requests: number
  tokens: number
}

/** 用量时间序列分组 */
interface UsageSeriesGroup {
  key: string
  label: string
  points: UsageSeriesPoint[]
  total: { spend: Money; requests: number; tokens: number }
}

/** 用量时间序列（usage.SeriesResponse） */
export interface UsageSeries {
  metric: 'spend' | 'requests' | 'tokens'
  granularity: 'day'
  group_by: 'none' | 'model' | 'provider' | 'workspace'
  groups: UsageSeriesGroup[]
  period: { from: string; to: string }
  totals: { spend: Money; requests: number; tokens: number }
}

// ─── Generation Logs ────────────────────────────────

/** 直方图桶 */
export interface HistogramBucket {
  bucket_start: string
  count: number
}

/** 直方图响应 */
export interface LogHistogram {
  granularity: string
  buckets: HistogramBucket[]
}

/** 调用日志列表项 */
export interface CallLogItem {
  call_log_id: string
  request_id: string
  started_at: string
  duration_ms: number
  model: { id: string; display_name: string }
  provider: { id: string; name: string; type: string }
  workspace_id: string
  api_key: { api_key_id: string; name: string; masked: string }
  account: { account_id: string; display_name: string }
  app_name: string | null
  status: 'accepted' | 'succeeded' | 'failed' | 'rejected'
  finish_reason: string | null
  usage: {
    input_tokens: number
    output_tokens: number
    total_tokens: number
    cache_read_tokens: number
  }
  usage_type: string
  speed: { tps: number; first_token_ms: number }
  cost: Money
  billing_status: string
  error: string | null
}

/** 调用日志详情 */
export interface CallLogDetail extends CallLogItem {
  finished_at: string
  protocol: string
  endpoint: string
  billing: {
    billing_session_id: string
    billing_status: string
    preauthorized_amount: string
    settled_amount: string
  }
  /** 仅开启 Input/Output Logging 时返回 */
  prompt?: {
    messages: Array<{ role: string; content: string }>
    redacted: boolean
  }
  /** 仅开启 Input/Output Logging 时返回 */
  completion?: {
    content: string
    tool_calls: unknown | null
  }
}

/** 调用日志统计摘要（GET /model-logs/stats） */
export interface LogStats {
  from: string
  to: string
  granularity: string
  group_by: string
  totals: {
    total_requests: number
    succeeded: number
    failed: number
    rejected: number
    error_rate: number
    avg_duration_ms: number
    total_tokens: number
    total_cost: Money
  }
}

/** 日志原始 Payload（GET /model-logs/{requestId}/payload） */
export interface LogPayload {
  body_b64: string
  content_type: string
  size: number
  truncated: boolean
}

// ─── Catalog ────────────────────────────────────────

/** 模型定价 */
export interface ModelPricing {
  input_per_1m: string
  output_per_1m: string
  cache_read_per_1m: string
  currency: string
}

/** 模型列表项 */
export interface CatalogModelItem {
  id: string
  model_id: string
  display_name: string
  vendor?: string
  modalities: string[]
  tags: string[]
  context_length: number
  max_output_tokens: number
  pricing: ModelPricing
  providers_count?: number
  released_at: string
  knowledge_cutoff: string
  monthly_tokens?: string
  zero_data_retention?: boolean
  in_region_routing?: boolean
  status: string
  logo_url: string
}

/** 模型变体 */
export interface ModelVariant {
  variant_id: string
  label: string
}

/** 模型详情 */
export interface CatalogModelDetail extends CatalogModelItem {
  description: string
  tags: string[]
  variants: ModelVariant[]
  benchmarks_summary?: Record<string, unknown>
}

/** 模型的 Provider 可用性项 */
export interface ProviderForModel {
  provider_id: string
  provider_name: string
  provider_type: string
  region?: string
  upstream_model?: string
  context_length?: number
  pricing?: ModelPricing
  uptime_30d_pct?: string
  latency_p50_ms?: number
  throughput_tps?: number
  /** API 实际返回 enabled | disabled */
  status: 'enabled' | 'disabled' | string
}

/** 模型标签 */
export interface CatalogModelTag {
  id: string
  code: string
  group_code: string
  name_zh: string
  name_en: string
  enabled: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

/** 供应商列表项 */
export interface CatalogProviderItem {
  provider_id: string
  provider_name: string
  provider_type: string
  logo_url: string
  regions: string[]
  models_count: number
  modalities: string[]
  uptime_30d_pct: string
  tags: string[]
  status: string
}

/** 定价方案功能 */
export interface PlanFeatures {
  platform_fees_pct: number
  models: string
  providers: string
  chat_api: boolean
  activity_logs_export: boolean
  budgets_and_spend_controls: boolean
  provisioning_keys_sso: boolean
  custom_data_policies: boolean
  soc2_hipaa: boolean
  dedicated_infra: boolean
  volume_discount: boolean
  priority_support: boolean
}

/** CTA 按钮 */
export interface PlanCTA {
  type: 'signup' | 'contact_sales'
  label: string
}

/** 定价方案 */
export interface PricingPlanItem {
  plan_id: string
  name: string
  monthly_fee: Money
  features: PlanFeatures
  cta: PlanCTA
}

/** FAQ 项 */
export interface PricingFAQ {
  id: string
  question: string
  answer: string
}

/** 定价方案响应 */
export interface PricingPlansResult {
  plans: PricingPlanItem[]
  faq: PricingFAQ[]
}

// ─── Docs ───────────────────────────────────────────

/** 文档导航节点 */
export interface DocsNavPage {
  id: string
  title: string
  slug: string
}

/** 文档导航分组 */
export interface DocsNavSection {
  id: string
  title: string
  pages: DocsNavPage[]
}

/** 文档导航树响应 */
export interface DocsNavResult {
  sections: DocsNavSection[]
}

/** 文档内容 */
export interface DocsPage {
  slug: string
  title: string
  html: string
  toc: Array<{ id: string; title: string; level: number }>
  code_examples: Array<{
    lang: string
    label: string
    code: string
  }>
  updated_at: string
}

// ─── 健康检查 ───────────────────────────────────────

/** 健康检查响应 */
export interface HealthStatus {
  status: 'healthy' | 'degraded'
}
