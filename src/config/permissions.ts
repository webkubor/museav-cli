export const PERMS = {
  // ── 菜单级 ───────────────────────────────────
  DASHBOARD_VIEW:     'dashboard:view',
  MODELS_VIEW:        'models:view',
  ANALYTICS_VIEW:     'analytics:view',
  LOGS_VIEW:          'logs:view',
  BILLING_VIEW:       'billing:view',
  API_KEYS_VIEW:      'api_keys:view',
  GUARDRAILS_VIEW:    'guardrails:view',
  OBSERVABILITY_VIEW: 'observability:view',

  // ── 页面/区块级 ──────────────────────────────
  BILLING_INVOICE_VIEW:    'billing.invoice:view',
  BILLING_RECHARGE_CREATE: 'billing.recharge:create',
  BILLING_RECHARGE_CANCEL: 'billing.recharge:cancel',

  // ── 按钮/操作级 ──────────────────────────────
  API_KEYS_CREATE: 'api_keys:create',
  API_KEYS_REVOKE: 'api_keys:revoke',

  GUARDRAILS_CREATE:          'guardrails:create',
  GUARDRAILS_EDIT:            'guardrails:edit',
  GUARDRAILS_DELETE:          'guardrails:delete',
  GUARDRAILS_ASSIGNMENT_EDIT: 'guardrails.assignment:edit',
  GUARDRAILS_BUDGET_EDIT:     'guardrails.budget:edit',

  OBSERVABILITY_LOGGING_EDIT:   'observability.logging:edit',
  OBSERVABILITY_FORWARD_MANAGE: 'observability.forward:manage',

  REFERRAL_REWARD_TRANSFER: 'referral.reward:transfer',
  REFERRAL_REWARD_WITHDRAW: 'referral.reward:withdraw',

  WORKSPACE_RENAME:         'workspace:rename',
  WORKSPACE_DELETE:         'workspace:delete',
  WORKSPACE_MEMBERS_MANAGE: 'workspace.members:manage',

  ORG_SETTINGS_EDIT:  'org.settings:edit',
  ORG_MEMBERS_MANAGE: 'org.members:manage',
  ORG_INVITE_MANAGE:  'org.invite:manage',
} as const

export type Permission = typeof PERMS[keyof typeof PERMS]
