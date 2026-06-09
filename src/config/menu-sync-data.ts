export interface MenuSyncItem {
  key: string
  name: string
  name_en: string
  scope: 'tenant' | 'workspace' | 'settings'
  view_permission: string | null
  actions: string[]
}

export const MENUS: MenuSyncItem[] = [
  // ── Tenant 级 ──────────────────────────────────────────────────────────
  {
    key: 'dashboard',
    name: '仪表盘',
    name_en: 'Dashboard',
    scope: 'tenant',
    view_permission: 'dashboard:view',
    actions: [],
  },
  {
    key: 'models',
    name: '模型',
    name_en: 'Models',
    scope: 'tenant',
    view_permission: 'models:view',
    actions: [],
  },
  {
    key: 'models/catalog',
    name: '所有模型',
    name_en: 'Catalog',
    scope: 'tenant',
    view_permission: 'models:view',
    actions: [],
  },
  {
    key: 'models/playground',
    name: '模型体验',
    name_en: 'Playground',
    scope: 'tenant',
    view_permission: 'models:view',
    actions: [],
  },
  {
    key: 'analytics',
    name: '分析',
    name_en: 'Analytics',
    scope: 'tenant',
    view_permission: 'analytics:view',
    actions: [],
  },
  {
    key: 'usage',
    name: '用量分析',
    name_en: 'Usage',
    scope: 'tenant',
    view_permission: 'analytics:view',
    actions: [],
  },
  {
    key: 'logs',
    name: '调用日志',
    name_en: 'Logs',
    scope: 'tenant',
    view_permission: 'logs:view',
    actions: [],
  },
  {
    key: 'billing',
    name: '账单',
    name_en: 'Billing',
    scope: 'tenant',
    view_permission: 'billing:view',
    actions: [
      'billing.invoice:view',
      'billing.recharge:create',
      'billing.recharge:cancel',
    ],
  },
  {
    key: 'referral',
    name: '推荐有奖',
    name_en: 'Referral',
    scope: 'tenant',
    view_permission: null,
    actions: ['referral.reward:transfer', 'referral.reward:withdraw'],
  },

  // ── Workspace 级 ────────────────────────────────────────────────────────
  {
    key: 'api-keys',
    name: 'API Keys',
    name_en: 'API Keys',
    scope: 'workspace',
    view_permission: 'api_keys:view',
    actions: ['api_keys:create', 'api_keys:revoke'],
  },
  {
    key: 'guardrails',
    name: '配额管理',
    name_en: 'Guardrails',
    scope: 'workspace',
    view_permission: 'guardrails:view',
    actions: [
      'guardrails:create',
      'guardrails:edit',
      'guardrails:delete',
      'guardrails.assignment:edit',
      'guardrails.budget:edit',
    ],
  },
  {
    key: 'observability',
    name: '可观测性',
    name_en: 'Observability',
    scope: 'workspace',
    view_permission: 'observability:view',
    actions: ['observability.logging:edit', 'observability.forward:manage'],
  },
  {
    key: 'settings/workspace',
    name: '工作区设置',
    name_en: 'Workspace Settings',
    scope: 'workspace',
    view_permission: null,
    actions: ['workspace:rename', 'workspace:delete', 'workspace.members:manage'],
  },

  // ── Settings 级 ─────────────────────────────────────────────────────────
  {
    key: 'settings/org',
    name: '企业管理',
    name_en: 'Organization',
    scope: 'settings',
    view_permission: null,
    actions: ['org.settings:edit', 'org.members:manage', 'org.invite:manage'],
  },
]
