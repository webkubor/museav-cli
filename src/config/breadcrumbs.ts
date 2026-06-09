export interface BreadcrumbItem {
  label: string
  path?: string
}

export type BreadcrumbConfig = Record<string, BreadcrumbItem[]>

export const HOME_CRUMB: BreadcrumbItem[] = [{ label: 'nav.home', path: '/dashboard' }]

export const breadcrumbConfig: BreadcrumbConfig = {
  dashboard: [{ label: 'nav.home', path: '/dashboard' }],
  'models/catalog':    [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.models' }, { label: 'nav.modelCatalog' }],
  'models/playground': [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.models', path: '/models/catalog' }, { label: 'nav.modelExplore' }],
  'models/compare':    [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.models', path: '/models/catalog' }, { label: 'nav.modelCompare' }],
  'api-keys':       [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.workspace', path: '/settings/workspace' }, { label: 'nav.apiKeys' }],
  usage:            [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.analytics' }, { label: 'nav.usage' }],
  logs:             [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.analytics' }, { label: 'nav.logs' }],
  billing:          [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.billing' }],
  referral:         [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.referral' }],
  guardrails:       [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.workspace', path: '/settings/workspace' }, { label: 'nav.guardrails' }],
  observability:    [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.workspace', path: '/settings/workspace' }, { label: 'nav.observability' }],
  'chat-test':      [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.workspace', path: '/settings/workspace' }, { label: '测试区' }, { label: '对话测试' }],
  'dev-config':     [{ label: 'nav.home', path: '/dashboard' }, { label: '开发者菜单' }],
  'settings/account':      [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.settings' }, { label: 'nav.account' }],
  'settings/workspace':    [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.settings' }, { label: 'nav.workspace' }],
  'settings/organization': [{ label: 'nav.home', path: '/dashboard' }, { label: 'nav.settings' }, { label: 'nav.organization' }],
}

export const FLAT_ROUTES = ['logs', 'usage', 'observability', 'billing', 'referral', 'dev-config', 'settings/organization']
