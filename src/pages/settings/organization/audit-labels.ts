/**
 * 操作审计「动作」文案映射
 * 后端审计 action 是 `<域>.<动作>` 枚举 key（如 guardrail.created / membership.role_changed），
 * swagger 未给枚举清单。这里把已知 key 映成中文；未知 key 由「域+动作」词表兜底组合，
 * 再兜底原样返回——新增后端动作不会漏成一坨点号 key，也不误翻。
 */

// 少数需要特定措辞的整 key 覆盖（域+动作直译读着别扭时）
const FULL_LABEL: Record<string, string> = {
  'tenant.updated': 'enterprise.audit.action.tenantUpdated',
  'tenant.dissolved': 'enterprise.audit.action.tenantDissolved',
  'workspace.ownership_transferred': 'enterprise.audit.action.workspaceOwnershipTransferred',
  'membership.role_changed': 'enterprise.audit.action.membershipRoleChanged',
  // api_key 域整组走专属措辞（qa#411：revealed/issued 此前漏词表，裸 key 直出生产）
  'api_key.issued': 'enterprise.audit.action.apiKeyIssued',
  'api_key.updated': 'enterprise.audit.action.apiKeyUpdated',
  'api_key.revoked': 'enterprise.audit.action.apiKeyRevoked',
  'api_key.revealed': 'enterprise.audit.action.apiKeyRevealed',
}

const DOMAIN_LABEL: Record<string, string> = {
  tenant: 'enterprise.audit.domain.tenant',
  workspace: 'enterprise.audit.domain.workspace',
  guardrail: 'enterprise.audit.domain.guardrail',
  membership: 'enterprise.audit.domain.member',
  member: 'enterprise.audit.domain.member',
  api_key: 'API Key',
  apikey: 'API Key',
  invite: 'enterprise.audit.domain.invite',
  invitation: 'enterprise.audit.domain.invite',
  budget: 'enterprise.audit.domain.budget',
  account: 'enterprise.audit.domain.account',
}

const VERB_LABEL: Record<string, string> = {
  created: 'enterprise.audit.verb.created',
  updated: 'enterprise.audit.verb.updated',
  deleted: 'enterprise.audit.verb.deleted',
  removed: 'enterprise.audit.verb.removed',
  added: 'enterprise.audit.verb.added',
  suspended: 'enterprise.audit.verb.suspended',
  reactivated: 'enterprise.audit.verb.reactivated',
  enabled: 'enterprise.audit.verb.enabled',
  disabled: 'enterprise.audit.verb.disabled',
  revoked: 'enterprise.audit.verb.revoked',
  rotated: 'enterprise.audit.verb.rotated',
  exported: 'enterprise.audit.verb.exported',
  role_changed: 'enterprise.audit.verb.roleChanged',
  ownership_transferred: 'enterprise.audit.verb.ownershipTransferred',
  // 邀请生命周期动词（#13：invitation.accepted 等此前漏词表 → 显示成原始 key）
  accepted: 'enterprise.audit.verb.accepted',
  declined: 'enterprise.audit.verb.declined',
  sent: 'enterprise.audit.verb.sent',
  resent: 'enterprise.audit.verb.resent',
  expired: 'enterprise.audit.verb.expired',
  canceled: 'enterprise.audit.verb.canceled',
  cancelled: 'enterprise.audit.verb.canceled',
  joined: 'enterprise.audit.verb.joined',
  left: 'enterprise.audit.verb.left',
  invited: 'enterprise.audit.verb.invited',
  transferred: 'enterprise.audit.verb.transferred',
}

type Translate = (key: string, options?: Record<string, unknown>) => string

/** action 枚举 key → 中文文案；未知 key 兜底组合/原样。 */
export function auditActionLabel(action: string, t: Translate): string {
  if (!action) return '—'
  if (FULL_LABEL[action]) return t(FULL_LABEL[action])
  const dot = action.indexOf('.')
  if (dot > 0) {
    const domain = action.slice(0, dot)
    const verb = action.slice(dot + 1)
    const d = DOMAIN_LABEL[domain]
    const v = VERB_LABEL[verb]
    if (d && v) return t('enterprise.audit.action.composed', { verb: t(v), domain: t(d) })
  }
  // 未知 key（新增但词表未同步的 <域>.<动作>）：不能把原始枚举 key 直接吐给用户，
  // 退到跟后端 auditActionLabel() 目录未命中时同语义的通用兜底文案（qa#411）
  return t('enterprise.audit.action.other')
}
