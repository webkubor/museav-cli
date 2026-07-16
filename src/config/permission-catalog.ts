import {
  LEGACY_PERMISSION_IDS,
  PERMISSION_DEFINITIONS,
  PERMISSION_ID_PATTERN,
  PERMS,
  RESOURCE_LABELS,
  resourceOf,
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
    actions: [PERMS.LOGS_PAYLOAD_VIEW],
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
    // 「类型 × 动作」细分（需求方#68）：创建/编辑/删除/启停/轮转 按私有/成员/服务逐类型授权
    actions: [
      PERMS.API_KEYS_CREATE_PERSONAL,
      PERMS.API_KEYS_EDIT_PERSONAL,
      PERMS.API_KEYS_REVOKE_PERSONAL,
      PERMS.API_KEYS_DISABLE_PERSONAL,
      PERMS.API_KEYS_ROTATE_PERSONAL,
      PERMS.API_KEYS_CREATE_MEMBER,
      PERMS.API_KEYS_EDIT_MEMBER,
      PERMS.API_KEYS_REVOKE_MEMBER,
      PERMS.API_KEYS_DISABLE_MEMBER,
      PERMS.API_KEYS_ROTATE_MEMBER,
      PERMS.API_KEYS_CHANGE_OWNER_MEMBER,
      PERMS.API_KEYS_CREATE_SERVICE,
      PERMS.API_KEYS_EDIT_SERVICE,
      PERMS.API_KEYS_REVOKE_SERVICE,
      PERMS.API_KEYS_DISABLE_SERVICE,
      PERMS.API_KEYS_ROTATE_SERVICE,
      PERMS.API_KEYS_CHANGE_OWNER_SERVICE,
      PERMS.API_KEYS_REVEAL,
    ],
  },
  {
    key: 'guardrails',
    name: '安全护栏',
    name_en: 'Guardrails',
    scope: 'workspace',
    view_permission: PERMS.GUARDRAILS_VIEW,
    // 「分类 × 动作」细分（需求方#57）：创建/配置/删除 按全局/个人/Key 逐分类授权
    actions: [
      PERMS.GUARDRAILS_CREATE_GLOBAL,
      PERMS.GUARDRAILS_EDIT_GLOBAL,
      PERMS.GUARDRAILS_DELETE_GLOBAL,
      PERMS.GUARDRAILS_CREATE_MEMBER,
      PERMS.GUARDRAILS_EDIT_MEMBER,
      PERMS.GUARDRAILS_DELETE_MEMBER,
      PERMS.GUARDRAILS_CREATE_KEY,
      PERMS.GUARDRAILS_EDIT_KEY,
      PERMS.GUARDRAILS_DELETE_KEY,
      PERMS.GUARDRAILS_CREATE_BOOST,
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

/** 资源组标签 sync 项：资源段 → 中文名。随 catalog 下发落库,catalog 响应带回。 */
export interface SyncResourceLabel {
  resource: string
  label: string
}

/** RESOURCE_LABELS 转成数组形态的 sync 项(按资源段字典序稳定)。 */
export const PERMISSION_CATALOG_RESOURCE_LABELS: readonly SyncResourceLabel[] = Object.entries(
  RESOURCE_LABELS,
)
  .map(([resource, label]) => ({ resource, label }))
  .sort((a, b) => a.resource.localeCompare(b.resource))

export const PERMISSION_SYNC_PAYLOAD = {
  source: 'modelgo-console-web',
  menus: PERMISSION_CATALOG_MENUS,
  permissions: PERMISSION_CATALOG_DEFINITIONS,
  resource_labels: PERMISSION_CATALOG_RESOURCE_LABELS,
}

// ─── 市场维度：国内/国外菜单差异 ──────────────────────────────────────────────
export type CatalogMarket = 'china' | 'global'

/**
 * 市场限定：未列出的权限**两市场都有**;列出则**仅这些市场**。
 * 例:发票功能仅国内站 → billing.invoice.* 标 ['china'],国外那份 catalog 自动剔除。
 * 新的市场特例往这里加,推送前用 `sync:permissions:check` 核对差异。
 */
export const PERMISSION_MARKET_RESTRICT: Partial<Record<Permission, readonly CatalogMarket[]>> = {
  [PERMS.BILLING_INVOICE_VIEW]: ['china'],
  [PERMS.BILLING_INVOICE_APPLY]: ['china'],
  [PERMS.BILLING_INVOICE_DOWNLOAD]: ['china'],
  [PERMS.BILLING_INVOICE_TITLE_MANAGE]: ['china'],
}

function permInMarket(id: Permission, market: CatalogMarket): boolean {
  const r = PERMISSION_MARKET_RESTRICT[id]
  return !r || r.includes(market)
}

/** 按市场过滤后的 sync payload(body 不含 market,market 走 query)。 */
export function catalogPayloadForMarket(market: CatalogMarket) {
  const menus = PERMISSION_CATALOG_MENUS
    .filter((m) => permInMarket(m.view_permission, market))
    .map((m) => ({ ...m, actions: m.actions.filter((a) => permInMarket(a, market)) }))
  const used = new Set<Permission>(menus.flatMap((m) => [m.view_permission, ...m.actions]))
  const permissions = PERMISSION_CATALOG_DEFINITIONS.filter((p) => used.has(p.permission_id))
  // 资源组标签只下发该市场实际用到的资源段(如国外无 billing.invoice 就不带「发票」标签)。
  const usedResources = new Set<string>([...used].map(resourceOf))
  const resource_labels = PERMISSION_CATALOG_RESOURCE_LABELS.filter((r) => usedResources.has(r.resource))
  return { source: 'modelgo-console-web', menus, permissions, resource_labels }
}

/** 两市场差异:各自菜单/权限数 + 仅国内/仅国外的权限。供推送前 check 核对,确保一开始就推对。 */
export function marketPermissionDiff() {
  const cnPerms = new Set(catalogPayloadForMarket('china').permissions.map((p) => p.permission_id))
  const glPerms = new Set(catalogPayloadForMarket('global').permissions.map((p) => p.permission_id))
  return {
    china: { menus: catalogPayloadForMarket('china').menus.length, perms: cnPerms.size },
    global: { menus: catalogPayloadForMarket('global').menus.length, perms: glPerms.size },
    onlyChina: [...cnPerms].filter((id) => !glPerms.has(id)),
    onlyGlobal: [...glPerms].filter((id) => !cnPerms.has(id)),
  }
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

  // 资源组标签契约：所有出现的资源段必须有中文名(否则运营看到裸 key);标签 key 不得悬空。
  const allResources = new Set<string>([...referencedIds].map(resourceOf))
  for (const resource of allResources) {
    if (!RESOURCE_LABELS[resource]) errors.push(`资源组缺中文名(RESOURCE_LABELS): ${resource}`)
  }
  for (const resource of Object.keys(RESOURCE_LABELS)) {
    if (!allResources.has(resource)) errors.push(`RESOURCE_LABELS 悬空(无对应权限): ${resource}`)
  }

  return errors
}

/**
 * 权限目录版本号。**对齐前端/PRD 的 release 版本**(当前 V1.0.3)。
 * 语义:后端见版本号变化 → **全量刷新**该市场目录(丢弃旧、以本次为准),而非逐条增量 diff;
 * 不变则走增量对账(has_changes)。随前端 release 推进同步 bump。
 */
// ⚠️ 这是「权限目录结构版本」，不是产品发布版本（package.json 的 V1.0.3）——两者无关，
// 千万别「同步版本号」：它驱动后端全量刷新语义（版本变→整市场目录全量刷新），必须只增不减。
// 结构性改动（增删码/改层级）手动 bump minor；曾被 854f148 误降回 1.0.3（正确值 1.2.0），此处恢复并 +1 保单调。
export const PERMISSION_CATALOG_VERSION = '1.3.0'

export const permissionCatalogMeta = {
  version: PERMISSION_CATALOG_VERSION,
  legacy_permission_ids: LEGACY_PERMISSION_IDS,
  permission_count: PERMISSION_CATALOG_DEFINITIONS.length,
  menu_count: PERMISSION_CATALOG_MENUS.length,
  resource_label_count: PERMISSION_CATALOG_RESOURCE_LABELS.length,
} as const
