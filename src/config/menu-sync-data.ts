/**
 * 菜单上报数据源（权限拉平）
 * 职责：定义控制台侧边栏全部菜单项，供 sync-menus 脚本推送到后端 admin/menus/sync。
 * 真源：菜单结构以 src/config/nav.ts（PRD 重构后 IA）为准；
 *       权限码以 src/config/permissions.ts 的 PERMS 常量为准；
 *       中文/英文文案与 src/locales/zh.json、en.json 的 nav.* 保持一致。
 * API：POST /api/v1/admin/menus/sync（后端按 key upsert，upsert-only，不删除未上报项）。
 */

export interface MenuSyncItem {
  /** 稳定业务键，与 nav.ts 的 itemKey 对齐；admin 按此 upsert */
  key: string
  /** 中文展示名，与 i18n nav.* 一致 */
  name: string
  /** 英文展示名，与 i18n nav.* 一致 */
  name_en: string
  /** 权限域：tenant 租户级 / workspace 工作空间级 / settings 设置级 */
  scope: 'tenant' | 'workspace' | 'settings'
  /** 查看该菜单所需权限码；null 表示无独立 view，靠持有任一 action 判断可见 */
  view_permission: string | null
  /** 菜单内按钮/操作级权限码集合 */
  actions: string[]
}

export const MENUS: MenuSyncItem[] = [
  // ── Tenant 级 · 主入口组 ────────────────────────────────────────────────
  {
    key: 'dashboard',
    name: '总览',
    name_en: 'Dashboard',
    scope: 'tenant',
    view_permission: 'dashboard:view',
    actions: [],
  },
  // 企业管理入口：PRD nav.ts key=organization（受 isOrgManager 控制）
  // 注：key 由 settings/organization 改名而来（fix/nav-route-naming）；旧 key 已在后端 upsert 登记但不再上报，是无害孤儿记录。
  {
    key: 'organization',
    name: '企业管理',
    name_en: 'Enterprise',
    scope: 'tenant',
    view_permission: null,
    actions: ['org.settings:edit', 'org.members:manage', 'org.invite:manage'],
  },
  // 空间管理入口：PRD nav.ts key=workspaces（受 isSpaceManager 控制）
  // 注：key 由 settings/workspace 改名而来（fix/nav-route-naming）；旧 key 已在后端 upsert 登记但不再上报，是无害孤儿记录。
  {
    key: 'workspaces',
    name: '空间管理',
    name_en: 'Space Management',
    scope: 'workspace',
    view_permission: null,
    actions: ['workspace:rename', 'workspace:delete', 'workspace.members:manage'],
  },

  // ── Tenant 级 · 账单与用量组 ────────────────────────────────────────────
  {
    key: 'billing',
    name: '账单管理',
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
    key: 'usage',
    name: '用量统计',
    name_en: 'Usage',
    scope: 'tenant',
    view_permission: 'analytics:view',
    actions: [],
  },
  {
    key: 'logs',
    name: '调用日志',
    name_en: 'Call Logs',
    scope: 'tenant',
    view_permission: 'logs:view',
    actions: [],
  },

  // ── Workspace 级 · 工作空间组 ───────────────────────────────────────────
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
    name: '安全护栏',
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

  // ── Tenant 级 · 活动中心组 ──────────────────────────────────────────────
  {
    key: 'tasks',
    name: '任务历史',
    name_en: 'Task History',
    scope: 'tenant',
    view_permission: null,
    actions: [],
  },
  {
    key: 'referral',
    name: '推荐计划',
    name_en: 'Referral',
    scope: 'tenant',
    view_permission: null,
    actions: ['referral.reward:transfer', 'referral.reward:withdraw'],
  },
]
