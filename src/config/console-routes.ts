import { PERMS, type Permission } from './permissions'

/**
 * ============================================================================
 * 控制台菜单驱动页面的路由「单一真源」 + 权限设计方案
 * ============================================================================
 *
 * 【为什么有这个文件】
 * 早期路由（App.tsx）是按老菜单手写的扁平列表、无逐路由权限；菜单（nav.ts）却是
 * 权限感知的。两者各写各的 → 菜单隐藏了入口，但直接敲 URL 仍进得去（访问控制缺口），
 * 且菜单/路由的权限、scope 各维护一份、易漂移。本文件把这三者收敛到一处。
 *
 * 【权限权威来源】
 * 唯一权威 = 后端 `GET /auth/session` 下发的 `permissions.granted`，由 modelgo-permissions
 * 基于 DB 权威矩阵按「当前激活 租户 × 工作区」解析（运营在 controller-web 编辑，≤30s 生效）。
 * 前端不存本地权限矩阵（#344 已下线本地回退）。
 *
 * 【三层门禁】（由外到内，逐层收窄；任一层都不可省）
 *   1) RequireAuth        —— 是否登录。未登录跳登录页。（App.tsx 顶层）
 *   2) RequirePermission  —— 路由级「view 权限」。本清单的 permission 字段驱动；
 *                            无权限渲染 403（ForbiddenPage），不回跳登录。
 *   3) 后端 API 鉴权       —— 数据权威闸。前端守卫只挡「页面入口」，真正的数据可见性/写权限
 *                            以后端为准（前端隐藏 ≠ 安全）。
 *
 * 【菜单 ↔ 路由 同源】
 *   - nav.ts：菜单项经 `routePermission(itemKey)` 取 view 权限 → 无权限则从侧边栏隐藏；
 *             `workspaceScopedKeys` 也从本清单派生（决定跳转是否前缀 /workspace/:id/）。
 *   - App.tsx：按本清单渲染 <Route>，有 permission 的套 <RequirePermission> 守卫。
 *   → 隐藏（菜单）与拦截（路由）用同一份 permission，永不漂移。
 *
 * 【fail-closed，但避开过渡窗误伤】（见 RequirePermission）
 *   - granted 为权威数组且缺该权限 → 403（fail-closed，Deny 优先）。
 *   - granted === null（会话加载中 / 切组织重拉的过渡窗，此时 hasPermission 对一切返回 false）
 *     → 放行子内容、不重定向，否则会把合法用户从当前页踢走。
 *
 * 【权限粒度分层】
 *   - 菜单/页面级 `*_VIEW`（dashboard/analytics/logs/billing/api_keys/guardrails/observability）：
 *     用于「能不能进这个页」——本清单 + 路由守卫。
 *   - 按钮/操作级（`*_CREATE/EDIT/DELETE/…`）：用于「进了页后能不能做某动作」——
 *     由页面内 `usePermissions().hasPermission()` 就地控制，**不在路由层**。
 *   - 无 view 权限项（如 referral、settings/*）：仅需登录；其可见性由业务上下文
 *     （isOrgManager/isSpaceManager 等，见 nav.ts）或页面自身决定。
 *
 * 【scope 两级】
 *   - tenant   —— 租户级，路径挂在 '/xxx'（如 /usage、/logs）。
 *   - workspace—— 工作区级，路径挂在 '/workspace/:workspaceId/xxx'（如 api-keys/guardrails）；
 *                 侧边栏在该组内渲染工作空间选择器，页面数据随所选工作区变化。
 *
 * 【命名规范 —— 路由 / 菜单 / 权限 / 埋点 四者同源，新增务必遵守】
 *   - menu_key（= 本清单 key = nav.ts itemKey = 路由 path）：kebab-case，可含层级 '/'。
 *     例：'api-keys'、'models/catalog'、'settings/organization'。
 *   - permission_id：'<resource>:<action>'，resource 用 snake_case；菜单级 view = '<resource>:view'，
 *     块/动作级 '<resource>[.<sub>]:<action>'（如 'billing.recharge:create'、'guardrails.budget:edit'）。
 *     注意：menu_key 用连字符（api-keys），permission 用下划线（api_keys:view），两者不必字面相同。
 *   - 埋点直接复用上面两者，禁止另起 event 名：页面浏览 `trackPageView(menu_key)`；
 *     动作按钮 `trackAction(PERMS.*)`（event key = permission_id，与按钮的权限 gate 同一常量）。
 *     无 permission_id 对应的动作（如自助建组织）才用冒号约定自定义 key（'org:create'）+ trackEvent。
 *   - 权威注册在后端权限矩阵（运营在 controller-web「菜单权限管理」编辑，≤30s 生效，见 #345）；
 *     前端 key 必须与后端登记一致，否则 fail-closed 隐藏/禁用。
 *
 * 【新增一个菜单页的 checklist】
 *   1) 本清单加一条 { key, path, scope, permission? }（key = kebab-case 路由 path = nav.ts itemKey）；
 *   2) App.tsx 的 CONSOLE_ELEMENTS 里补 key → 页面元素；
 *   3) nav.ts 对应分组加 { itemKey:key, text, icon }（permission 走 routePermission(key)，不重复写）；
 *   4) 若引入新 view/动作权限，先在 permissions.ts 的 PERMS 登记（按上面命名规范），并让后端矩阵下发；
 *   5) 埋点无需额外命名：页面用 trackPageView(key)、动作按钮用 trackAction(对应 PERMS.*)，key 自动复用。
 *
 * 不含：登录/注册等公共页、纯工具页（dev-config）、二级详情页（工作空间详情、个人设置子页），
 * 这些不由菜单直接驱动，仍在 App.tsx 内联声明。
 */
export type RouteScope = 'tenant' | 'workspace'

export interface ConsoleRouteMeta {
  /** 与 nav.ts 的 itemKey 对齐 */
  key: string
  /** tenant 页相对 '/'；workspace 页相对 '/workspace/:workspaceId/' */
  path: string
  scope: RouteScope
  /** 菜单级 view 权限；缺省 = 仅需登录（如推荐计划） */
  permission?: Permission
}

export const CONSOLE_ROUTES: ConsoleRouteMeta[] = [
  { key: 'dashboard', path: 'dashboard', scope: 'tenant', permission: PERMS.DASHBOARD_VIEW },
  { key: 'billing', path: 'billing', scope: 'tenant', permission: PERMS.BILLING_VIEW },
  { key: 'usage', path: 'usage', scope: 'tenant', permission: PERMS.ANALYTICS_VIEW },
  { key: 'logs', path: 'logs', scope: 'tenant', permission: PERMS.LOGS_VIEW },
  { key: 'referral', path: 'referral', scope: 'tenant' },
  { key: 'api-keys', path: 'api-keys', scope: 'workspace', permission: PERMS.API_KEYS_VIEW },
  { key: 'guardrails', path: 'guardrails', scope: 'workspace', permission: PERMS.GUARDRAILS_VIEW },
  { key: 'observability', path: 'observability', scope: 'workspace', permission: PERMS.OBSERVABILITY_VIEW },
]

/** 工作区级页面 key 集合（DashboardLayout 据此把跳转前缀成 /workspace/:id/…） */
export const workspaceScopedKeys: ReadonlySet<string> = new Set(
  CONSOLE_ROUTES.filter((r) => r.scope === 'workspace').map((r) => r.key),
)

/** 按 itemKey 取菜单/路由的 view 权限（菜单过滤与路由守卫共用同一份） */
export function routePermission(key: string): Permission | undefined {
  return CONSOLE_ROUTES.find((r) => r.key === key)?.permission
}
