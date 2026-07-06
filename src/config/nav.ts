import type React from 'react'
import { PERMS } from './permissions'
import type { Permission } from './permissions'

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
 *   isDomestic     — market === 'domestic'
 *   isDevTools     — VITE_SHOW_DEV_TOOLS === 'true'
 *   isOrgManager   — 企业租户 Owner/Admin（决定「企业管理」入口）
 *   isSpaceManager — Owner/Admin、个人租户或任一空间负责人（决定「空间管理」入口）
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
  // observability 路由保留（第二阶段并入空间详情的「日志与转发」），但不再出现在侧边栏
  workspaceScopedKeys: new Set([
    'api-keys',
    'guardrails',
    'observability',
  ]),

  groups: (ctx, t, icons) => [
    {
      key: 'main',
      scope: 'tenant',
      items: [
        { itemKey: 'dashboard', text: t('nav.dashboard'), icon: icons.home, permission: PERMS.DASHBOARD_VIEW },
        ...(ctx.isOrgManager
          ? [{ itemKey: 'settings/organization', text: t('nav.organization'), icon: icons.building }]
          : []),
        ...(ctx.isSpaceManager
          ? [{ itemKey: 'settings/workspace', text: t('nav.workspace'), icon: icons.apps }]
          : []),
      ],
    },
    {
      key: 'billing',
      label: t('nav.groupBilling'),
      scope: 'tenant',
      items: [
        { itemKey: 'billing', text: t('nav.billing'), icon: icons.creditCard, permission: PERMS.BILLING_VIEW },
        { itemKey: 'usage', text: t('nav.usage'), icon: icons.histogram, permission: PERMS.ANALYTICS_VIEW },
        { itemKey: 'logs', text: t('nav.logs'), icon: icons.list, permission: PERMS.LOGS_VIEW },
      ],
    },
    {
      key: 'workspace',
      label: t('nav.sidebarWorkspace'),
      scope: 'workspace',
      items: [
        { itemKey: 'api-keys', text: t('nav.apiKeys'), icon: icons.key, permission: PERMS.API_KEYS_VIEW },
        { itemKey: 'guardrails', text: t('nav.guardrails'), icon: icons.shield, permission: PERMS.GUARDRAILS_VIEW },
      ],
    },
    {
      key: 'activity',
      label: t('nav.groupActivity'),
      scope: 'tenant',
      items: [
        // 任务历史（异步任务）已并入「调用日志」，通过页头「记录类型」切换查看（#361）；
        // /tasks 路由重定向到 /logs?record_type=async，此处不再单列入口。
        { itemKey: 'referral', text: t('nav.referral'), icon: icons.gift },
      ],
    },
  ],
}
