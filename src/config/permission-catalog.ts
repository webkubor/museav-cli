import {
  LEGACY_PERMISSION_IDS,
  PERMISSION_DEFINITIONS,
  PERMISSION_ID_PATTERN,
  PERMS,
  type Permission,
  type PermissionGranularity,
} from './permissions.ts'

export type PermissionScope = 'tenant' | 'workspace' | 'settings'

export interface PermissionCatalogMenu {
  key: string
  name: string
  name_en: string
  scope: PermissionScope
  view_permission: Permission
  actions: readonly Permission[]
}

export interface SyncPermissionDefinition {
  permission_id: Permission
  granularity: PermissionGranularity
  description: string
}

/**
 * Console 页面与业务按钮权限目录。
 * menu key 用于菜单 upsert；view_permission/actions 才是角色矩阵使用的 Permission ID。
 */
export const PERMISSION_CATALOG_MENUS = [
  {
    key: 'dashboard',
    name: '总览',
    name_en: 'Dashboard',
    scope: 'tenant',
    view_permission: PERMS.DASHBOARD_VIEW,
    actions: [],
  },
  {
    key: 'organization',
    name: '企业管理',
    name_en: 'Enterprise',
    scope: 'tenant',
    view_permission: PERMS.ORG_VIEW,
    actions: [
      PERMS.ORG_SETTINGS_EDIT,
      PERMS.ORG_MEMBERS_MANAGE,
      PERMS.ORG_INVITE_MANAGE,
      PERMS.ORG_AUDIT_VIEW,
      PERMS.ORG_AUDIT_EXPORT,
      PERMS.ORG_OWNERSHIP_TRANSFER,
      PERMS.ORG_DELETE,
    ],
  },
  {
    key: 'workspaces',
    name: '空间管理',
    name_en: 'Space Management',
    scope: 'workspace',
    view_permission: PERMS.WORKSPACE_VIEW,
    actions: [
      PERMS.WORKSPACE_CREATE,
      PERMS.WORKSPACE_MEMBERS_VIEW,
      PERMS.WORKSPACE_MEMBERS_MANAGE,
      PERMS.WORKSPACE_SETTINGS_EDIT,
      PERMS.WORKSPACE_RENAME,
      PERMS.WORKSPACE_DELETE,
      PERMS.WORKSPACE_AUDIT_VIEW,
    ],
  },
  {
    key: 'billing',
    name: '账单管理',
    name_en: 'Billing',
    scope: 'tenant',
    view_permission: PERMS.BILLING_VIEW,
    actions: [
      PERMS.BILLING_INVOICE_VIEW,
      PERMS.BILLING_INVOICE_APPLY,
      PERMS.BILLING_INVOICE_DOWNLOAD,
      PERMS.BILLING_INVOICE_TITLE_MANAGE,
      PERMS.BILLING_RECHARGE_CREATE,
      PERMS.BILLING_RECHARGE_CANCEL,
      PERMS.BILLING_PROMO_REDEEM,
    ],
  },
  {
    key: 'usage',
    name: '用量统计',
    name_en: 'Usage',
    scope: 'tenant',
    view_permission: PERMS.ANALYTICS_VIEW,
    actions: [],
  },
  {
    key: 'logs',
    name: '调用日志',
    name_en: 'Call Logs',
    scope: 'tenant',
    view_permission: PERMS.LOGS_VIEW,
    actions: [],
  },
  {
    key: 'referral',
    name: '推荐计划',
    name_en: 'Referral',
    scope: 'tenant',
    view_permission: PERMS.REFERRAL_VIEW,
    actions: [PERMS.REFERRAL_REWARD_TRANSFER, PERMS.REFERRAL_REWARD_WITHDRAW],
  },
  {
    key: 'api-keys',
    name: 'API Keys',
    name_en: 'API Keys',
    scope: 'workspace',
    view_permission: PERMS.API_KEYS_VIEW,
    actions: [
      PERMS.API_KEYS_CREATE,
      PERMS.API_KEYS_CREATE_PERSONAL,
      PERMS.API_KEYS_CREATE_MEMBER,
      PERMS.API_KEYS_CREATE_SERVICE,
      PERMS.API_KEYS_EDIT,
      PERMS.API_KEYS_REVEAL,
      PERMS.API_KEYS_REVOKE,
    ],
  },
  {
    key: 'guardrails',
    name: '安全护栏',
    name_en: 'Guardrails',
    scope: 'workspace',
    view_permission: PERMS.GUARDRAILS_VIEW,
    actions: [
      PERMS.GUARDRAILS_CREATE,
      PERMS.GUARDRAILS_EDIT,
      PERMS.GUARDRAILS_DELETE,
      PERMS.GUARDRAILS_ASSIGNMENT_EDIT,
      PERMS.GUARDRAILS_BUDGET_EDIT,
    ],
  },
  {
    key: 'observability',
    name: '日志与转发',
    name_en: 'Logging & Forwarding',
    scope: 'workspace',
    view_permission: PERMS.OBSERVABILITY_VIEW,
    actions: [PERMS.OBSERVABILITY_LOGGING_EDIT, PERMS.OBSERVABILITY_FORWARD_MANAGE],
  },
] as const satisfies readonly PermissionCatalogMenu[]

export const PERMISSION_CATALOG_DEFINITIONS: readonly SyncPermissionDefinition[] = Object.values(
  PERMISSION_DEFINITIONS,
).map((definition) => ({
  permission_id: definition.id,
  granularity: definition.granularity,
  description: definition.description,
}))

export const PERMISSION_SYNC_PAYLOAD = {
  source: 'modelgo-console-web',
  menus: PERMISSION_CATALOG_MENUS,
  permissions: PERMISSION_CATALOG_DEFINITIONS,
}

const MENU_KEY_PATTERN = /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/

/** 同步前的纯本地契约校验；返回空数组才允许发请求。 */
export function validatePermissionCatalog(): string[] {
  const errors: string[] = []
  const menuKeys = new Set<string>()
  const definedIds = new Set<string>(PERMISSION_CATALOG_DEFINITIONS.map((item) => item.permission_id))
  const referencedIds = new Set<string>()

  for (const menu of PERMISSION_CATALOG_MENUS) {
    if (!MENU_KEY_PATTERN.test(menu.key)) errors.push(`非法 menu key: ${menu.key}`)
    if (menuKeys.has(menu.key)) errors.push(`重复 menu key: ${menu.key}`)
    menuKeys.add(menu.key)

    const ids = [menu.view_permission, ...menu.actions]
    if (new Set(ids).size !== ids.length) errors.push(`菜单 ${menu.key} 存在重复 Permission ID`)

    for (const id of ids) {
      referencedIds.add(id)
      if (!PERMISSION_ID_PATTERN.test(id)) errors.push(`非法 Permission ID: ${id}`)
      if (!definedIds.has(id)) errors.push(`菜单 ${menu.key} 引用了未登记 Permission ID: ${id}`)
    }
  }

  for (const definition of PERMISSION_CATALOG_DEFINITIONS) {
    if (!PERMISSION_ID_PATTERN.test(definition.permission_id)) {
      errors.push(`权限定义命名非法: ${definition.permission_id}`)
    }
    if (!referencedIds.has(definition.permission_id)) {
      errors.push(`权限定义未关联页面或按钮: ${definition.permission_id}`)
    }
  }

  return errors
}

export const permissionCatalogMeta = {
  legacy_permission_ids: LEGACY_PERMISSION_IDS,
  permission_count: PERMISSION_CATALOG_DEFINITIONS.length,
  menu_count: PERMISSION_CATALOG_MENUS.length,
} as const
