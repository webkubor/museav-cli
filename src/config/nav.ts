import type React from 'react'

export type NavItem = {
  itemKey: string
  text: string
  icon: React.ReactNode
  items?: NavItem[]
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
    'api-playground',
    'chat-test',
  ]),

  tenantItems: (ctx, t, icons) => [
    { itemKey: 'dashboard',    text: t('nav.dashboard'),  icon: icons.home },
    {
      itemKey: 'models',
      text: t('nav.models'),
      icon: icons.apps,
      items: [
        { itemKey: 'models/explore', text: t('nav.modelExplore'), icon: icons.apps },
        { itemKey: 'models/compare', text: t('nav.modelCompare'), icon: icons.list },
        { itemKey: 'models/chat',    text: t('nav.modelChat'),    icon: icons.histogramSm },
        { itemKey: 'models/history', text: t('nav.modelHistory'), icon: icons.list },
      ],
    },
    {
      itemKey: 'analytics',
      text: t('nav.analytics'),
      icon: icons.histogram,
      items: [
        { itemKey: 'usage', text: t('nav.usage'), icon: icons.histogramSm },
        { itemKey: 'logs',  text: t('nav.logs'),  icon: icons.list },
      ],
    },
    { itemKey: 'billing', text: t('nav.billing'), icon: icons.creditCard },
    // 内部调试入口，仅 VITE_SHOW_DEV_TOOLS=true 时可见
    ...(ctx.isDevTools ? [{
      itemKey: 'platform-config',
      text: '接口调试',
      icon: icons.wrench,
    }] : []),
  ],

  workspaceItems: (ctx, t, icons) => [
    { itemKey: 'api-keys',      text: t('nav.apiKeys'),       icon: icons.key },
    { itemKey: 'guardrails',    text: t('nav.guardrails'),    icon: icons.shield },
    { itemKey: 'observability', text: t('nav.observability'), icon: icons.eye },
    {
      itemKey: 'sandbox',
      text: '测试区',
      icon: icons.terminal,
      items: [
        { itemKey: 'api-playground', text: '接口调试', icon: icons.list },
        { itemKey: 'chat-test',      text: '对话测试', icon: icons.histogramSm },
      ],
    },
    // 邀请管理：只要不是个人账户即可见（enterprise 或未来其他非 personal 类型）
    ...(ctx.isNonPersonal ? [{
      itemKey: 'invitations-mgmt',
      text: t('nav.invitations'),
      icon: icons.mail,
    }] : []),
  ],
}
