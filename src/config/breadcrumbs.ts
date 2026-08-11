export interface BreadcrumbItem {
  label: string
  path?: string
}

export type BreadcrumbConfig = Record<string, BreadcrumbItem[]>

// 面包屑结构对齐 PRD 原型（#168）：原型 breadcrumb = 「所属分组 > 当前页」两级，
// 分组为纯文本（不可点击、无「首页/总览」根节点）。分组取值同原型 pageGroup：
//   租户 = 总览 / 企业管理 / 空间管理
//   账单与用量 = 账单管理 / 用量统计 / 调用日志
//   工作空间 = API Keys / 安全护栏 / 可观测性
//   活动中心 = 推荐计划 / 任务历史
// nav.home（首页）仅保留给顶栏跳官网外链，不进面包屑。
export const HOME_CRUMB: BreadcrumbItem[] = [{ label: 'nav.tenant' }, { label: 'nav.dashboard' }]

export const breadcrumbConfig: BreadcrumbConfig = {
  // 租户级
  dashboard:        [{ label: 'nav.tenant' }, { label: 'nav.dashboard' }],
  organization:     [{ label: 'nav.tenant' }, { label: 'nav.organization' }],
  workspaces:       [{ label: 'nav.tenant' }, { label: 'nav.workspace' }],
  // 账单与用量
  billing:          [{ label: 'nav.groupBilling' }, { label: 'nav.billing' }],
  usage:            [{ label: 'nav.groupBilling' }, { label: 'nav.usage' }],
  logs:             [{ label: 'nav.groupBilling' }, { label: 'nav.logs' }],
  // 工作空间（工作区级）
  'api-keys':       [{ label: 'nav.sidebarWorkspace' }, { label: 'nav.apiKeys' }],
  guardrails:       [{ label: 'nav.sidebarWorkspace' }, { label: 'nav.guardrails' }],
  // 活动中心
  referral:         [{ label: 'nav.groupActivity' }, { label: 'nav.referral' }],
  tasks:            [{ label: 'nav.groupActivity' }, { label: 'nav.tasks' }],
  // 模型广场
  'models/playground': [{ label: 'nav.models' }, { label: 'nav.modelExplore' }],
  'models/compare':    [{ label: 'nav.models' }, { label: 'nav.modelCompare' }],
  // 账号
  'settings/account':  [{ label: 'nav.settings' }, { label: 'nav.account' }],
  // 开发者工具（dev-only，无 PRD 分组）
  'dev-config':     [{ label: '开发者菜单' }],
}

export const FLAT_ROUTES = ['logs', 'usage', 'billing', 'referral', 'tasks', 'dev-config', 'organization', 'workspaces', 'models/playground', 'models/compare']
