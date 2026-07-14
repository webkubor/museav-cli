export type PermissionGranularity = 'menu' | 'page' | 'action'

interface PermissionDefinition {
  id: string
  granularity: PermissionGranularity
  description: string
}

export const PERMISSION_ID_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*:[a-z][a-z0-9_]*$/

/**
 * Console 当前生效的 Permission ID 真源。
 *
 * Permission 描述授权能力；同一业务动作的埋点可以复用相同 key 与命名规则，
 * 但权限目录同步、埋点上报和审计链路仍是三个独立的数据契约。
 * 菜单、路由、按钮和本地权限同步目录只能引用这里导出的 PERMS。
 */
export const PERMISSION_DEFINITIONS = {
  // ── 菜单 / 页面访问 ───────────────────────────
  DASHBOARD_VIEW:     { id: 'dashboard:view',     granularity: 'menu', description: '查看总览' },
  ANALYTICS_VIEW:     { id: 'analytics:view',     granularity: 'menu', description: '查看用量统计' },
  LOGS_VIEW:          { id: 'logs:view',          granularity: 'menu', description: '查看调用日志' },
  BILLING_VIEW:       { id: 'billing:view',       granularity: 'menu', description: '查看账单管理' },
  API_KEYS_VIEW:      { id: 'api_keys:view',      granularity: 'menu', description: '查看 API Keys' },
  GUARDRAILS_VIEW:    { id: 'guardrails:view',    granularity: 'menu', description: '查看安全护栏' },
  OBSERVABILITY_VIEW: { id: 'observability:view', granularity: 'menu', description: '查看日志与转发配置' },
  WORKSPACE_VIEW:     { id: 'workspace:view',     granularity: 'menu', description: '查看空间管理' },
  ORG_VIEW:           { id: 'org:view',           granularity: 'menu', description: '查看企业管理' },
  REFERRAL_VIEW:      { id: 'referral:view',      granularity: 'menu', description: '查看推荐计划' },

  // ── 账单 ─────────────────────────────────────
  BILLING_INVOICE_VIEW:    { id: 'billing.invoice:view',    granularity: 'page', description: '查看发票信息' },
  BILLING_INVOICE_APPLY:   { id: 'billing.invoice:apply',   granularity: 'action', description: '申请开票' },
  BILLING_INVOICE_DOWNLOAD:{ id: 'billing.invoice:download',granularity: 'action', description: '下载发票' },
  BILLING_INVOICE_TITLE_MANAGE: { id: 'billing.invoice_title:manage', granularity: 'action', description: '管理发票抬头' },
  BILLING_RECHARGE_CREATE: { id: 'billing.recharge:create', granularity: 'action', description: '创建充值订单' },
  BILLING_RECHARGE_CANCEL: { id: 'billing.recharge:cancel', granularity: 'action', description: '取消充值订单' },
  BILLING_PROMO_REDEEM:    { id: 'billing.promo:redeem',    granularity: 'action', description: '兑换优惠码' },

  // ── API Keys ─────────────────────────────────
  API_KEYS_CREATE: { id: 'api_keys:create', granularity: 'action', description: '创建 API Key' },
  // 按类型细分创建权限（#54）：不同角色可创建的 Key 类型不同（成员=仅私有；owner/admin/空间负责人=全部）。
  // 粒度细化后，后台角色矩阵可按类型单独授权，API 层可按类型强制，取代前端角色启发式。
  API_KEYS_CREATE_PERSONAL: { id: 'api_keys.personal:create', granularity: 'action', description: '创建私有 Key' },
  API_KEYS_CREATE_MEMBER:   { id: 'api_keys.member:create',   granularity: 'action', description: '创建成员 Key' },
  API_KEYS_CREATE_SERVICE:  { id: 'api_keys.service:create',  granularity: 'action', description: '创建服务 Key' },
  API_KEYS_EDIT:   { id: 'api_keys:edit',   granularity: 'action', description: '编辑 API Key' },
  API_KEYS_REVEAL: { id: 'api_keys:reveal', granularity: 'action', description: '查看 API Key 明文' },
  API_KEYS_REVOKE: { id: 'api_keys:revoke', granularity: 'action', description: '撤销 API Key' },

  // ── 安全护栏 ──────────────────────────────────
  GUARDRAILS_CREATE:          { id: 'guardrails:create',          granularity: 'action', description: '创建安全护栏' },
  GUARDRAILS_EDIT:            { id: 'guardrails:edit',            granularity: 'action', description: '编辑安全护栏' },
  GUARDRAILS_DELETE:          { id: 'guardrails:delete',          granularity: 'action', description: '删除安全护栏' },
  GUARDRAILS_ASSIGNMENT_EDIT: { id: 'guardrails.assignment:edit', granularity: 'action', description: '编辑护栏作用范围' },
  GUARDRAILS_BUDGET_EDIT:     { id: 'guardrails.budget:edit',     granularity: 'action', description: '编辑护栏预算' },

  // ── 可观测性 ──────────────────────────────────
  OBSERVABILITY_LOGGING_EDIT:   { id: 'observability.logging:edit',   granularity: 'action', description: '编辑日志采集配置' },
  OBSERVABILITY_FORWARD_MANAGE: { id: 'observability.forward:manage', granularity: 'action', description: '管理日志转发目标' },

  // ── 推荐计划 ──────────────────────────────────
  REFERRAL_REWARD_TRANSFER: { id: 'referral.reward:transfer', granularity: 'action', description: '划转推荐奖励' },
  REFERRAL_REWARD_WITHDRAW: { id: 'referral.reward:withdraw', granularity: 'action', description: '提现推荐奖励' },

  // ── 空间管理 ──────────────────────────────────
  WORKSPACE_CREATE:         { id: 'workspace:create',         granularity: 'action', description: '创建空间' },
  WORKSPACE_RENAME:         { id: 'workspace:rename',         granularity: 'action', description: '重命名空间' },
  WORKSPACE_DELETE:         { id: 'workspace:delete',         granularity: 'action', description: '删除空间' },
  WORKSPACE_MEMBERS_VIEW:   { id: 'workspace.members:view',   granularity: 'page', description: '查看空间成员' },
  WORKSPACE_MEMBERS_MANAGE: { id: 'workspace.members:manage', granularity: 'action', description: '管理空间成员' },
  WORKSPACE_SETTINGS_EDIT:  { id: 'workspace.settings:edit',  granularity: 'action', description: '编辑空间设置' },
  WORKSPACE_AUDIT_VIEW:     { id: 'workspace.audit:view',     granularity: 'page', description: '查看空间审计记录' },

  // ── 企业管理 ──────────────────────────────────
  ORG_SETTINGS_EDIT:      { id: 'org.settings:edit',      granularity: 'action', description: '编辑企业设置' },
  ORG_MEMBERS_MANAGE:     { id: 'org.members:manage',     granularity: 'action', description: '管理企业成员' },
  ORG_INVITE_MANAGE:      { id: 'org.invite:manage',      granularity: 'action', description: '管理企业邀请' },
  ORG_AUDIT_VIEW:         { id: 'org.audit:view',         granularity: 'page', description: '查看企业审计日志' },
  ORG_AUDIT_EXPORT:       { id: 'org.audit:export',       granularity: 'action', description: '导出企业审计日志' },
  ORG_OWNERSHIP_TRANSFER: { id: 'org.ownership:transfer', granularity: 'action', description: '转移企业所有权' },
  ORG_DELETE:             { id: 'org:delete',             granularity: 'action', description: '解散企业' },
} as const satisfies Record<string, PermissionDefinition>

type PermissionDefinitions = typeof PERMISSION_DEFINITIONS

export const PERMS = Object.fromEntries(
  Object.entries(PERMISSION_DEFINITIONS).map(([key, definition]) => [key, definition.id]),
) as { readonly [K in keyof PermissionDefinitions]: PermissionDefinitions[K]['id'] }

export type Permission = PermissionDefinitions[keyof PermissionDefinitions]['id']

/**
 * 后端历史目录中仍可能存在、但当前 Console 不再使用的 ID。
 * 仅供首次 dry-run 对账，不能重新上报，也不能在前端继续引用。
 */
export const LEGACY_PERMISSION_IDS = [
  'models:view',
  'invitations:view',
  'invitations:manage',
  'dashboard:view.org',
  'logs:view.org',
] as const
