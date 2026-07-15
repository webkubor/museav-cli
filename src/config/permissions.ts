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
  // 动作细分（#54 举一反三）：轮转/变更负责人/启停 原全挤在 edit，拆出独立 perm 供后台按角色单独授权、API 层按动作强制。
  API_KEYS_ROTATE:       { id: 'api_keys:rotate',       granularity: 'action', description: '轮转 API Key' },
  API_KEYS_CHANGE_OWNER: { id: 'api_keys:change_owner', granularity: 'action', description: '变更 API Key 负责人' },
  API_KEYS_DISABLE:      { id: 'api_keys:disable',      granularity: 'action', description: '启用/停用 API Key' },

  // ── 安全护栏 ──────────────────────────────────
  GUARDRAILS_CREATE:          { id: 'guardrails:create',          granularity: 'action', description: '创建安全护栏' },
  // 按护栏分类/类型的细粒度创建权限（PRD §11：Member 仅可建常规 Key 护栏，不可建全局/个人/提额）
  GUARDRAILS_CREATE_GLOBAL: { id: 'guardrails.global:create', granularity: 'action', description: '创建全局护栏' },
  GUARDRAILS_CREATE_MEMBER: { id: 'guardrails.member:create', granularity: 'action', description: '创建个人护栏' },
  GUARDRAILS_CREATE_KEY:    { id: 'guardrails.key:create',    granularity: 'action', description: '创建 Key 护栏' },
  GUARDRAILS_CREATE_BOOST:  { id: 'guardrails.boost:create',  granularity: 'action', description: '创建提额护栏' },
  GUARDRAILS_EDIT:            { id: 'guardrails:edit',            granularity: 'action', description: '编辑安全护栏' },
  GUARDRAILS_DELETE:          { id: 'guardrails:delete',          granularity: 'action', description: '删除安全护栏' },
  GUARDRAILS_ASSIGNMENT_EDIT: { id: 'guardrails.assignment:edit', granularity: 'action', description: '编辑护栏作用范围' },
  GUARDRAILS_BUDGET_EDIT:     { id: 'guardrails.budget:edit',     granularity: 'action', description: '编辑护栏预算' },

  // ── 可观测性 ──────────────────────────────────
  OBSERVABILITY_LOGGING_EDIT:   { id: 'observability.logging:edit',   granularity: 'action', description: '编辑日志采集配置' },
  OBSERVABILITY_FORWARD_MANAGE: { id: 'observability.forward:manage', granularity: 'action', description: '管理日志转发目标' },

  // ── 调用日志 ──────────────────────────────────
  // 原文（请求/响应 prompt+completion）是敏感内容，原仅 logs:view 罩着，拆独立 perm 按角色控（#54 举一反三）。
  LOGS_PAYLOAD_VIEW: { id: 'logs.payload:view', granularity: 'action', description: '查看调用日志请求/响应原文' },

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

/**
 * 资源组中文名：Permission ID 的「资源段」(冒号前) → 中文标签。
 *
 * 后端权限目录会按资源段把权限收成分组节点(如 `billing.invoice:view/apply/download`
 * 归到「发票」节点),但节点本身此前没有人话名称——运营侧看到的就是裸 key(#发票节点没描述)。
 * 此表随 catalog sync 一并下发落库、并由 catalog 响应带回,给这些分组节点提供显示名。
 * 延续「sync 即单一来源」:标签真源在前端,后端只存储与回吐,不自行造名。
 *
 * key 必须是某个 Permission ID 的资源段(冒号前),否则 validatePermissionCatalog 视为悬空标签。
 * 顶层资源(如 billing/api_keys)与菜单名重合,列出是为让后端任意层级节点都能取到名。
 */
export const RESOURCE_LABELS: Record<string, string> = {
  dashboard: '总览',
  analytics: '用量统计',
  logs: '调用日志',
  'logs.payload': '调用原文',
  billing: '账单',
  'billing.invoice': '发票',
  'billing.invoice_title': '发票抬头',
  'billing.recharge': '充值',
  'billing.promo': '优惠码',
  api_keys: 'API Key',
  'api_keys.personal': '私有 Key',
  'api_keys.member': '成员 Key',
  'api_keys.service': '服务 Key',
  guardrails: '安全护栏',
  'guardrails.global': '全局护栏',
  'guardrails.member': '个人护栏',
  'guardrails.key': 'Key 护栏',
  'guardrails.boost': '提额护栏',
  'guardrails.assignment': '护栏作用范围',
  'guardrails.budget': '护栏预算',
  observability: '日志与转发',
  'observability.logging': '日志采集',
  'observability.forward': '日志转发',
  workspace: '空间管理',
  'workspace.members': '空间成员',
  'workspace.settings': '空间设置',
  'workspace.audit': '空间审计',
  org: '企业管理',
  'org.settings': '企业设置',
  'org.members': '企业成员',
  'org.invite': '企业邀请',
  'org.audit': '企业审计',
  'org.ownership': '企业所有权',
  referral: '推荐计划',
  'referral.reward': '推荐奖励',
}

/** 取 Permission ID 的资源段(冒号前),用于按资源分组与匹配 RESOURCE_LABELS。 */
export function resourceOf(permissionId: string): string {
  return permissionId.split(':')[0] ?? permissionId
}
