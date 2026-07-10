/**
 * 操作审计「动作」文案映射
 * 后端审计 action 是 `<域>.<动作>` 枚举 key（如 guardrail.created / membership.role_changed），
 * swagger 未给枚举清单。这里把已知 key 映成中文；未知 key 由「域+动作」词表兜底组合，
 * 再兜底原样返回——新增后端动作不会漏成一坨点号 key，也不误翻。
 */

// 少数需要特定措辞的整 key 覆盖（域+动作直译读着别扭时）
const FULL_LABEL: Record<string, string> = {
  'tenant.updated': '更新企业信息',
  'tenant.dissolved': '解散企业',
  'workspace.ownership_transferred': '转移工作空间负责人',
  'membership.role_changed': '变更成员角色',
}

const DOMAIN_LABEL: Record<string, string> = {
  tenant: '企业',
  workspace: '工作空间',
  guardrail: '安全护栏',
  membership: '成员',
  member: '成员',
  api_key: 'API Key',
  apikey: 'API Key',
  invite: '邀请',
  invitation: '邀请',
  budget: '预算',
  account: '账号',
}

const VERB_LABEL: Record<string, string> = {
  created: '创建',
  updated: '更新',
  deleted: '删除',
  removed: '移除',
  added: '添加',
  suspended: '停用',
  reactivated: '启用',
  enabled: '启用',
  disabled: '停用',
  revoked: '吊销',
  rotated: '轮转',
  exported: '导出',
  role_changed: '变更角色',
  ownership_transferred: '转移负责人',
  // 邀请生命周期动词（#13：invitation.accepted 等此前漏词表 → 显示成原始 key）
  accepted: '接受',
  declined: '拒绝',
  sent: '发送',
  resent: '重新发送',
  expired: '过期',
  canceled: '取消',
  cancelled: '取消',
  joined: '加入',
  left: '退出',
  invited: '邀请',
  transferred: '转移',
}

/** action 枚举 key → 中文文案；未知 key 兜底组合/原样。 */
export function auditActionLabel(action: string): string {
  if (!action) return '—'
  if (FULL_LABEL[action]) return FULL_LABEL[action]
  const dot = action.indexOf('.')
  if (dot > 0) {
    const domain = action.slice(0, dot)
    const verb = action.slice(dot + 1)
    const d = DOMAIN_LABEL[domain]
    const v = VERB_LABEL[verb]
    if (d && v) return `${v}${d}` // 创建 + 安全护栏 → 创建安全护栏
  }
  return action // 未知 key 兜底原样，不误翻
}
