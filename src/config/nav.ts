import type React from 'react'
import type { Permission } from './permissions'
import { workspaceScopedKeys, routePermission } from './console-routes'

export type NavItem = {
  itemKey: string
  text: string
  icon: React.ReactNode
  items?: NavItem[]
  permission?: Permission
}

/**
 * 侧边栏分组。对象边界优先的 IA（PRD：左侧导航与总览 v0.1）。
 *   - label 为空 = 主入口组，不渲染分组小标题
 *   - scope='workspace' 的组在组内渲染工作空间选择器，其页面受选择器影响
 */
export type NavGroup = {
  key: string
  label?: string
  scope: 'tenant' | 'workspace'
  items: NavItem[]
}

/**
 * 菜单可见性条件集中定义。DashboardLayout 直接消费结果。
 *
 * 维度说明：
 *   isNonPersonal  — tenant.type !== 'personal'
 *   isDomestic     — market === 'china'
 *   isDevTools     — VITE_SHOW_DEV_TOOLS === 'true'
 *   isOrgManager / isSpaceManager — 保留给非权限型业务文案；菜单访问权统一由 Permission ID 决定。
 */
export interface NavVisibilityContext {
  isNonPersonal: boolean
  isDomestic: boolean
  isDevTools: boolean
  isOrgManager: boolean
  isSpaceManager: boolean
}

export type NavIcons = Record<string, React.ReactNode>

export interface NavConfig {
  /** 侧边栏分组（五分组 IA） */
  groups: (ctx: NavVisibilityContext, t: (key: string) => string, icons: NavIcons) => NavGroup[]
  /** 工作区级页面 key 集合（用于 WorkspaceGuard 和路由前缀判断） */
  workspaceScopedKeys: ReadonlySet<string>
}

export const navConfig: NavConfig = {
  // 工作区级 key 从路由单一真源派生（config/console-routes），与路由/守卫同源，杜绝漂移。
  // observability 路由保留（第二阶段并入空间详情），但不出现在侧边栏 items。
  workspaceScopedKeys,

  groups: (ctx, t, icons) => [
    {
      key: 'main',
      scope: 'tenant',
      items: [
        { itemKey: 'dashboard', text: t('nav.dashboard'), icon: icons.home, permission: routePermission('dashboard') },
        // 企业管理仅企业租户展示（PRD 企业&空间管理：Member 和个人租户看不到入口）。
        // 权限码只按角色下发，个人租户 owner 同样持有 ORG_VIEW，须叠加租户类型门。
        ...(ctx.isNonPersonal
          ? [{ itemKey: 'organization', text: t('nav.organization'), icon: icons.building, permission: routePermission('organization') }]
          : []),
        { itemKey: 'workspaces', text: t('nav.workspace'), icon: icons.apps, permission: routePermission('workspaces') },
      ],
    },
    {
      key: 'billing',
      label: t('nav.groupBilling'),
      scope: 'tenant',
      items: [
        { itemKey: 'billing', text: t('nav.billing'), icon: icons.creditCard, permission: routePermission('billing') },
        { itemKey: 'usage', text: t('nav.usage'), icon: icons.histogram, permission: routePermission('usage') },
        { itemKey: 'logs', text: t('nav.logs'), icon: icons.list, permission: routePermission('logs') },
      ],
    },
    {
      key: 'workspace',
      label: t('nav.sidebarWorkspace'),
      scope: 'workspace',
      items: [
        { itemKey: 'api-keys', text: t('nav.apiKeys'), icon: icons.key, permission: routePermission('api-keys') },
        { itemKey: 'guardrails', text: t('nav.guardrails'), icon: icons.shield, permission: routePermission('guardrails') },
      ],
    },
    {
      key: 'activity',
      label: t('nav.groupActivity'),
      scope: 'tenant',
      items: [
        // 任务历史（异步任务）已并入「调用日志」，通过页头「记录类型」切换查看（#361）；
        // /tasks 路由重定向到 /logs?record_type=async，此处不再单列入口。
        { itemKey: 'referral', text: t('nav.referral'), icon: icons.gift, permission: routePermission('referral') },
      ],
    },
  ],
}
