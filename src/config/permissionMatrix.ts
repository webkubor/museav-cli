import { PERMS } from './permissions'
import type { Permission } from './permissions'
import type { TenantRole } from '@/hooks/use-tenant-role'
import type { WorkspaceRole } from '@/hooks/use-workspace-role'

export type Market = 'domestic' | 'global'
export type TenantType = 'enterprise' | 'personal'

const BASE: Permission[] = [
  PERMS.DASHBOARD_VIEW,
  PERMS.MODELS_VIEW,
  PERMS.ANALYTICS_VIEW,
  PERMS.LOGS_VIEW,
]

const BILLING_DOMESTIC: Permission[] = [
  PERMS.BILLING_VIEW,
  PERMS.BILLING_INVOICE_VIEW,
  PERMS.BILLING_RECHARGE_CREATE,
  PERMS.BILLING_RECHARGE_CANCEL,
]

const BILLING_GLOBAL: Permission[] = [
  PERMS.BILLING_VIEW,
  PERMS.BILLING_RECHARGE_CREATE,
  PERMS.BILLING_RECHARGE_CANCEL,
]

const ORG_MANAGE: Permission[] = [
  PERMS.ORG_SETTINGS_EDIT,
  PERMS.ORG_MEMBERS_MANAGE,
  PERMS.ORG_INVITE_MANAGE,
]

// 企业类型所有成员均可见邀请管理菜单（操作权限在 ws 维度控制）
const ENTERPRISE_MENU: Permission[] = [PERMS.INVITATIONS_VIEW]

export const TENANT_PERM_MATRIX: Record<
  Market,
  Record<TenantType, Record<TenantRole, Permission[]>>
> = {
  domestic: {
    enterprise: {
      tenant_owner:  [...BASE, ...BILLING_DOMESTIC, ...ORG_MANAGE, ...ENTERPRISE_MENU],
      tenant_admin:  [...BASE, ...BILLING_DOMESTIC, ...ORG_MANAGE, ...ENTERPRISE_MENU],
      tenant_member: [...BASE, ...ENTERPRISE_MENU],
    },
    personal: {
      tenant_owner:  [...BASE, ...BILLING_DOMESTIC],
      tenant_admin:  [...BASE],
      tenant_member: [...BASE],
    },
  },
  global: {
    enterprise: {
      tenant_owner:  [...BASE, ...BILLING_GLOBAL, ...ORG_MANAGE, ...ENTERPRISE_MENU],
      tenant_admin:  [...BASE, ...BILLING_GLOBAL, ...ORG_MANAGE, ...ENTERPRISE_MENU],
      tenant_member: [...BASE, ...ENTERPRISE_MENU],
    },
    personal: {
      tenant_owner:  [...BASE, ...BILLING_GLOBAL],
      tenant_admin:  [...BASE],
      tenant_member: [...BASE],
    },
  },
}

export const WS_PERM_MATRIX: Record<WorkspaceRole, Permission[]> = {
  ws_owner: [
    PERMS.API_KEYS_VIEW, PERMS.API_KEYS_CREATE, PERMS.API_KEYS_REVOKE,
    PERMS.GUARDRAILS_VIEW, PERMS.GUARDRAILS_CREATE, PERMS.GUARDRAILS_EDIT,
    PERMS.GUARDRAILS_DELETE, PERMS.GUARDRAILS_ASSIGNMENT_EDIT, PERMS.GUARDRAILS_BUDGET_EDIT,
    PERMS.OBSERVABILITY_VIEW, PERMS.OBSERVABILITY_LOGGING_EDIT, PERMS.OBSERVABILITY_FORWARD_MANAGE,
    PERMS.INVITATIONS_MANAGE,
  ],
  ws_admin: [
    PERMS.API_KEYS_VIEW, PERMS.API_KEYS_CREATE, PERMS.API_KEYS_REVOKE,
    PERMS.GUARDRAILS_VIEW, PERMS.GUARDRAILS_CREATE, PERMS.GUARDRAILS_EDIT,
    PERMS.GUARDRAILS_DELETE, PERMS.GUARDRAILS_ASSIGNMENT_EDIT, PERMS.GUARDRAILS_BUDGET_EDIT,
    PERMS.OBSERVABILITY_VIEW, PERMS.OBSERVABILITY_LOGGING_EDIT, PERMS.OBSERVABILITY_FORWARD_MANAGE,
    PERMS.INVITATIONS_MANAGE,
  ],
  ws_member: [
    PERMS.API_KEYS_VIEW, PERMS.API_KEYS_CREATE,
    PERMS.GUARDRAILS_VIEW,
    PERMS.OBSERVABILITY_VIEW,
  ],
}
