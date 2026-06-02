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
 * 菜单可见性条件集中定义。
 * 所有「某菜单是否显示」的判断只在此处写，DashboardLayout 直接消费结果。
 *
 * 维度说明：
 *   isNonPersonal — tenant.type !== 'personal'（企业组织，含 enterprise 及未来新类型）
 *   isDomestic    — market === 'domestic'（国内域名）
 *   isDevTools    — VITE_SHOW_DEV_TOOLS === 'true'（内部调试）
 */
export interface NavVisibilityContext {
  /** 当前 tenant 不是个人账户 */
  isNonPersonal: boolean
  /** 国内市场 */
  isDomestic: boolean
  /** 开发调试模式 */
  isDevTools: boolean
}

export interface NavConfig {
  /** Tenant 级导航（切换工作区不影响） */
  tenantItems: (ctx: NavVisibilityContext, t: (key: string) => string, icons: NavIcons) => NavItem[]
  /** 工作区级导航（切换工作区内容随之变） */
  workspaceItems: (ctx: NavVisibilityContext, t: (key: string) => string, icons: NavIcons) => NavItem[]
  /** 测试区导航（工作区下，单独分隔线） */
  sandboxItems: (ctx: NavVisibilityContext, icons: NavIcons) => NavItem[]
  /** 工作区级页面 key 集合（用于 WorkspaceGuard 和高亮判断） */
  workspaceScopedKeys: ReadonlySet<string>
}

export type NavIcons = Record<string, React.ReactNode>

export const navConfig: NavConfig = {
  workspaceScopedKeys: new Set([
    'api-keys',
    'guardrails',
    'observability',
    'invitations-mgmt',
    'chat-test',
  ]),

  tenantItems: (_ctx, t, icons) => [
    { itemKey: 'dashboard',    text: t('nav.dashboard'),  icon: icons.home,       permission: PERMS.DASHBOARD_VIEW },
    {
      itemKey: 'models',
      text: t('nav.models'),
      icon: icons.apps,
      permission: PERMS.MODELS_VIEW,
      items: [
        { itemKey: 'models/explore', text: t('nav.modelExplore'), icon: icons.apps,        permission: PERMS.MODELS_VIEW },
        { itemKey: 'models/chat',    text: t('nav.modelChat'),    icon: icons.histogramSm, permission: PERMS.MODELS_VIEW },
      ],
    },
    {
      itemKey: 'analytics',
      text: t('nav.analytics'),
      icon: icons.histogram,
      permission: PERMS.ANALYTICS_VIEW,
      items: [
        { itemKey: 'usage', text: t('nav.usage'), icon: icons.histogramSm, permission: PERMS.ANALYTICS_VIEW },
        { itemKey: 'logs',  text: t('nav.logs'),  icon: icons.list,        permission: PERMS.LOGS_VIEW },
      ],
    },
    { itemKey: 'billing', text: t('nav.billing'), icon: icons.creditCard, permission: PERMS.BILLING_VIEW },
  ],

  workspaceItems: (_ctx, t, icons) => [
    { itemKey: 'api-keys',         text: t('nav.apiKeys'),       icon: icons.key,    permission: PERMS.API_KEYS_VIEW },
    { itemKey: 'guardrails',       text: t('nav.guardrails'),    icon: icons.shield, permission: PERMS.GUARDRAILS_VIEW },
    { itemKey: 'observability',    text: t('nav.observability'), icon: icons.eye,    permission: PERMS.OBSERVABILITY_VIEW },
    { itemKey: 'settings/workspace', text: t('nav.workspace'),   icon: icons.apps },
    { itemKey: 'invitations-mgmt', text: t('nav.invitations'),   icon: icons.mail,   permission: PERMS.INVITATIONS_VIEW },
  ],

  sandboxItems: (_ctx, icons) => [
    { itemKey: 'platform-config', text: '接口调试', icon: icons.wrench },
  ],
}
