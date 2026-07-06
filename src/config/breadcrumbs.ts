export interface BreadcrumbItem {
  label: string
  path?: string
}

export type BreadcrumbConfig = Record<string, BreadcrumbItem[]>

export const HOME_CRUMB: BreadcrumbItem[] = [{ label: 'nav.home', path: '/dashboard' }]

export const breadcrumbConfig: BreadcrumbConfig = {
  dashboard: [{ label: 'nav.home', path: '/dashboard' }],
  'models/playground': [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.models' }, { label: 'nav.modelExplore' }],
  'models/compare':    [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.models', path: '/models/playground' }, { label: 'nav.modelCompare' }],
  'api-keys':       [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.workspace', path: '/settings/workspace' }, { label: 'nav.apiKeys' }],
  usage:            [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.analytics' }, { label: 'nav.usage' }],
  logs:             [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.analytics' }, { label: 'nav.logs' }],
  billing:          [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.billing' }],
  referral:         [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.referral' }],
  tasks:            [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.tasks' }],
  guardrails:       [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.workspace', path: '/settings/workspace' }, { label: 'nav.guardrails' }],
  observability:    [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.workspace', path: '/settings/workspace' }, { label: 'nav.observability' }],
  'dev-config':     [{ label: 'nav.home', path: '/dashboard' }, { label: '开发者菜单' }],
  'settings/account':      [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.settings' }, { label: 'nav.account' }],
  'settings/workspace':    [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.settings' }, { label: 'nav.workspace' }],
  'settings/organization': [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.settings' }, { label: 'nav.organization' }],
}

export const FLAT_ROUTES = ['logs', 'usage', 'observability', 'billing', 'referral', 'tasks', 'dev-config', 'settings/organization', 'models/playground', 'models/compare']
