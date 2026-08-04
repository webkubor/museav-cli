import type { AccountBrief, Money } from '../account'

// ─── API Key ────────────────────────────────────────

/** 消费限额时间维度 —— 与安全护栏 budget policy 的 period_unit 完全一致 */
export type SpendingPeriodUnit = 'hour' | 'day' | 'week' | 'month'

export interface SpendingLimit {
  amount: string
  currency: string
  /** 时间维度，对齐护栏（每小时/每日/每周/每月）；与 period_length 组合 */
  period_unit: SpendingPeriodUnit
  /** 周期长度，默认 1（如 period_unit=month, period_length=1 即每月） */
  period_length: number
}

/** API Key 类型（PRD v1.0.3 #382）：私有 / 成员 / 服务；后端未回时由 scope 派生 */
export type ApiKeyType = 'personal' | 'member' | 'service'

/**
 * 状态（对齐 PRD 原型 apiKeyStatusOptions）。后端现回 active|disabled|revoked，
 * expired/limited 待 #407、rotation_required 待 #385 落地——UI 已就绪。
 * revoked=软删（PRD 无此态，后端软删保留，列表一般不返回）。
 */
export type ApiKeyStatus = 'active' | 'disabled' | 'expired' | 'limited' | 'rotation_required' | 'revoked'

export type ApiKeyMember = Pick<AccountBrief, 'account_id' | 'display_name' | 'email'>

/** 行级能力位（后端 apikey.Capabilities，对象形式）。缺失时由 usePermissions 权限回退。 */
export interface ApiKeyCapabilities {
  can_view?: boolean
  can_update_limit?: boolean
  can_disable?: boolean
  can_enable?: boolean
  can_rotate?: boolean
  can_delete?: boolean
}

export interface ApiKeyItem {
  api_key_id: string
  name: string
  prefix: string
  masked: string
  /** 轮转宽限期内的旧 Token 掩码（qa#515）；确认完成轮转后为空。 */
  previous_masked?: string
  env: 'live' | 'test'
  status: ApiKeyStatus
  owner: ApiKeyMember
  expires_at: string | null
  last_used_at: string | null
  total_spend: Money
  limit: SpendingLimit
  /**
   * 实际约束该 key 的最严 per_api_key 预算（qa#516，接口权威）：key 自身
   * spending_limit 与生效护栏层 active per_api_key budget 中金额最小者；
   * 全部无限额时缺失。限额列展示优先读它，limit 仍为 key 自身限额。
   */
  effective_limit?: SpendingLimit
  created_at: string
  scope: 'personal' | 'workspace' | 'member'
  guardrail_id?: string
  guardrails?: ApiKeyGuardrailSummary[]
  /** 可通过 reveal 端点取回完整明文（#298）；早期 key 无密文为 false，复制按钮置灰 */
  revealable?: boolean

  // ── PRD v1.0.3 扩字段（#382/#383 已交付，全部 optional，缺失时由 derive.ts 回退）──
  /** Key 类型；缺失时由 scope 派生 */
  key_type?: ApiKeyType
  /** 负责人；缺失时回退 owner（PRD：owner=创建人 creator，responsible_member=负责人） */
  responsible_member?: ApiKeyMember
  /** 本期消费；缺失时回退 total_spend */
  period_spend?: Money
  /** 行级能力位（对象）；缺失时由权限回退 */
  capabilities?: ApiKeyCapabilities
}

/** 顶部摘要卡（#383 GET /api-keys/summary）；后端未交付时由列表客户端派生 */
export interface ApiKeySummary {
  total: number
  active: number
  expiring_soon: number
  limit_reached: number
  month_spend: Money
}

/** 详情最近调用条目（#383） */
export interface ApiKeyRecentCall {
  log_id: string
  created_at: string
  model: string
  status: string
  cost: Money
}

/** 操作审计条目（后端 apikey.AuditLog） */
export interface ApiKeyAuditEntry {
  id: string
  created_at: string
  action: string
  /** 操作人展示名 */
  actor_display?: string
  actor_account_id?: string
  /** 结果 */
  result?: string
  request_id?: string
  target_label?: string
  changes?: { field: string; before?: string; after?: string }[]
}

/** 审计列表响应（后端 apikey.AuditLogsResponse） */
export interface ApiKeyAuditLogsResponse {
  items: ApiKeyAuditEntry[]
  next_cursor?: string
}

/** 详情用量（后端 apikey.DetailUsage） */
export interface ApiKeyDetailUsage {
  period_spend?: Money
  request_count?: number
  token_count?: number
}

/** Key 详情（#383 GET /api-keys/{keyId}）；= 列表项 + 用量 + 最近调用 + 内嵌审计 */
export interface ApiKeyDetail extends ApiKeyItem {
  usage?: ApiKeyDetailUsage
  recent_calls?: ApiKeyRecentCall[]
  recent_audit?: ApiKeyAuditEntry[]
}

/** 轮转返回（#384 POST /api-keys/{keyId}/rotate）；新 Token 只回一次 */
export interface ApiKeyRotateResponse {
  new_key: string
  rotated_at: string
  /** 旧 Token 掩码(服务端权威返回,宽限期内仍有效)——#515/#218 */
  previous_masked?: string
  /** 旧 Token 过渡期截止 */
  old_key_grace_until?: string
}

/** 变更负责人（POST /api-keys/{keyId}/change-owner，已就绪） */
export interface ChangeApiKeyOwnerRequest {
  new_owner_account_id: string
}

export interface ApiKeyGuardrailSummary {
  id: string
  name: string
  is_default: boolean
  /** 护栏作用域（需求方#246/#147）：区分全局/个人/Key，列表「Key护栏」列按 scope==='key' 筛 */
  scope?: 'global' | 'personal' | 'member' | 'key'
  kind?: 'regular' | 'boost'
}

export interface CreateApiKeyRequest {
  name: string
  expires_at?: string | null
  spending_limit?: SpendingLimit
  scope?: 'personal' | 'workspace' | 'member'
  member_account_id?: string
  guardrail_ids?: string[]
}

export interface ApiKeyCreated {
  api_key_id: string
  name: string
  key: string
  prefix: string
  masked: string
  env: 'live' | 'test'
  created_at: string
  scope: 'personal' | 'workspace' | 'member'
}

/** 后端 PATCH 更新用「可空包装」区分「设值/清空」与「不变」：set=true 表示本次设置 value（含清空）。 */
export interface NullableExpiry {
  set: boolean
  /** ISO 时间；空串表示永不过期 */
  value?: string
}
export interface NullableSpendingLimit {
  set: boolean
  /** null 表示不限额 */
  value?: SpendingLimit | null
}

export interface UpdateApiKeyRequest {
  name?: string
  expires_at?: NullableExpiry
  spending_limit?: NullableSpendingLimit
  guardrail_ids?: string[] | null
}
