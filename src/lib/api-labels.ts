const MODULE_LABEL_MAP: Array<[RegExp, string]> = [
  // Auth
  [/\/auth\/session/,              '会话检查'],
  [/\/auth\/login/,                '登录'],
  [/\/auth\/register/,             '注册'],
  [/\/auth\/logout/,               '登出'],
  [/\/auth\/email-code/,           '邮箱验证码'],
  [/\/auth\/email\/check/,         '邮箱预检'],
  [/\/auth\/password/,             '密码重置'],
  [/\/auth\/oauth/,                'OAuth 授权'],
  [/\/auth\/device/,               '设备码授权'],
  // Account
  [/\/account\/avatar/,            '账号头像'],
  [/\/account\/password/,          '修改密码'],
  [/\/account\/preferences/,       '偏好设置'],
  [/\/account\/connect/,           '第三方绑定'],
  [/\/account\/delete-request/,    '注销账号'],
  [/\/account\/profile/,           '账号信息'],
  [/\/account\/active-tenant/,     '切换组织'],
  // Tenant 成员
  [/\/tenants\/[^/]+\/members\/[^/]+/, '组织成员详情'],
  [/\/tenants\/[^/]+\/members/,    '组织成员'],
  [/\/tenants\/[^/]+\/invite-link/,'组织邀请链接'],
  // Tenant 财务
  [/\/tenants\/[^/]+\/balance/,    '账户余额'],
  [/\/tenants\/[^/]+\/recharges/,  '充值订单'],
  [/\/tenants\/[^/]+\/promo-codes/,'促销码兑换'],
  [/\/tenants\/[^/]+\/billing\/transactions/, '账单流水'],
  [/\/tenants\/[^/]+\/overview\/billing/, 'Dashboard 看板'],
  [/\/tenants\/[^/]+\/logo/,       '组织头像'],
  [/\/tenants(?:\/|$)/,            '组织'],
  // Workspace
  [/\/workspaces\/[^/]+\/api-keys\/[^/]+/, 'API Key 详情'],
  [/\/workspaces\/[^/]+\/api-keys/,'API Keys'],
  [/\/workspaces\/[^/]+\/members\/[^/]+/, '工作区成员详情'],
  [/\/workspaces\/[^/]+\/members/, '工作区成员'],
  [/\/workspaces\/[^/]+\/invite-link/, '工作区邀请链接'],
  [/\/workspaces\/[^/]+\/invitations/, '工作区邀请'],
  [/\/workspaces\/[^/]+\/guardrails/, '安全护栏列表'],
  [/\/workspaces\/[^/]+\/observability\/broadcast-dead-letters/, '死信队列'],
  [/\/workspaces\/[^/]+\/observability\/broadcast-destinations/, '推送目标'],
  [/\/workspaces\/[^/]+\/observability\/platforms/, '可观测平台'],
  [/\/workspaces\/[^/]+\/observability/, '可观测性'],
  [/\/workspaces(?:\/|$)/,         '工作区'],
  // Guardrail
  [/\/guardrails\/[^/]+\/budget-policies/, '预算策略'],
  [/\/guardrails\/[^/]+\/assignments/, '护栏分配'],
  [/\/guardrails(?:\/|$)/,         '安全护栏'],
  // Logs
  [/\/model-logs\/[^/]+\/payload/, '日志 Payload'],
  [/\/model-logs\/histogram/,      '用量直方图'],
  [/\/model-logs\/stats/,          '调用统计'],
  [/\/model-logs(?:\/|$)/,         '调用日志'],
  // Usage
  [/\/usage\/summary/,             '用量总览'],
  [/\/usage\/series/,              '用量趋势'],
  // Catalog
  [/\/catalog\/models\/[^/]+\/providers/, '模型服务商'],
  [/\/catalog\/models\//,          '模型详情'],
  [/\/catalog\/models/,            '模型目录'],
  [/\/catalog\/providers/,         '服务商列表'],
  [/\/catalog\/model-tags/,        '模型标签'],
  [/\/catalog\/pricing/,           '定价方案'],
  // Agent / CS
  [/\/agent\/chat/,                '客服 AI 聊天'],
  [/\/agent\/conversations\/[^/]+\/stop/, '停止对话'],
  [/\/agent\/conversations\//,     '对话记录'],
  // Invitations
  [/\/invitations\/[^/]+\/accept/, '接受邀请'],
  [/\/invitations(?:\/|$)/,        '邀请'],
  // Platform / Misc
  [/\/platform-config/,            '平台配置'],
  [/\/organizations/,              '创建组织'],
  [/\/docs\//,                     '文档'],
]

export function getModuleLabel(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  for (const [pattern, label] of MODULE_LABEL_MAP) {
    if (pattern.test(p)) return label
  }
  return ''
}
