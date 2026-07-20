export interface BreadcrumbItem {
  label: string
  path?: string
}

export type BreadcrumbConfig = Record<string, BreadcrumbItem[]>

// 面包屑根节点用 nav.dashboard（总览）而非 nav.home（首页）：/dashboard 就是侧边栏「总览」页，
// 与侧边栏及 PRD 导航文案统一（#168）；nav.home（首页）保留给顶栏跳官网的外链。
export const HOME_CRUMB: BreadcrumbItem[] = [{ label: 'nav.dashboard', path: '/dashboard' }]

export const breadcrumbConfig: BreadcrumbConfig = {
  dashboard: [{ label: 'nav.dashboard', path: '/dashboard' }],
  'models/playground': [{ label: 'nav.dashboard', path: '/dashboard' }, { label: 'nav.models' }, { label: 'nav.modelExplore' }],
  'models/compare':    [{ label: 'nav.dashboard', path: '/dashboard' }, { label: 'nav.models', path: '/models/playground' }, { label: 'nav.modelCompare' }],
  'api-keys':       [{ label: 'nav.dashboard', path: '/dashboard' }, { label: 'nav.workspace', path: '/workspaces' }, { label: 'nav.apiKeys' }],
  usage:            [{ label: 'nav.dashboard', path: '/dashboard' }, { label: 'nav.groupBilling' }, { label: 'nav.usage' }],
  logs:             [{ label: 'nav.dashboard', path: '/dashboard' }, { label: 'nav.groupBilling' }, { label: 'nav.logs' }],
  billing:          [{ label: 'nav.dashboard', path: '/dashboard' }, { label: 'nav.billing' }],
  referral:         [{ label: 'nav.dashboard', path: '/dashboard' }, { label: 'nav.referral' }],
  tasks:            [{ label: 'nav.dashboard', path: '/dashboard' }, { label: 'nav.tasks' }],
  guardrails:       [{ label: 'nav.dashboard', path: '/dashboard' }, { label: 'nav.workspace', path: '/workspaces' }, { label: 'nav.guardrails' }],
  observability:    [{ label: 'nav.dashboard', path: '/dashboard' }, { label: 'nav.workspace', path: '/workspaces' }, { label: 'nav.observability' }],
  'dev-config':     [{ label: 'nav.dashboard', path: '/dashboard' }, { label: '开发者菜单' }],
  'settings/account':      [{ label: 'nav.dashboard', path: '/dashboard' }, { label: 'nav.settings' }, { label: 'nav.account' }],
  // 企业管理/空间管理是主入口顶层页，不挂在「设置」下——面包屑不再插入 nav.settings 这一级假分组。
  workspaces:       [{ label: 'nav.dashboard', path: '/dashboard' }, { label: 'nav.workspace' }],
  organization:     [{ label: 'nav.dashboard', path: '/dashboard' }, { label: 'nav.organization' }],
}

export const FLAT_ROUTES = ['logs', 'usage', 'observability', 'billing', 'referral', 'tasks', 'dev-config', 'organization', 'workspaces', 'models/playground', 'models/compare']
