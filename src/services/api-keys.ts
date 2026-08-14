/**
 * API 密钥管理（§八）
 * 路由：/api-keys
 * API：GET|POST /api-keys、PATCH|DELETE /api-keys/:id
 */
import { del, get, getPage, patch, post } from '@/lib/request'
import type {
  ApiKeyAuditLogsResponse,
  ApiKeyCreated,
  ApiKeyDetail,
  ApiKeyItem,
  ApiKeyRotateResponse,
  ApiKeySummary,
  ChangeApiKeyOwnerRequest,
  CreateApiKeyRequest,
  CursorPage,
  QueryParams,
  UpdateApiKeyRequest,
} from '@/types'
import type { ApiKeyListParams } from '@/interfaces/api-keys'

/** 获取 workspace 下的 API Key 列表 */
export function listApiKeys(workspaceId: string, params?: ApiKeyListParams) {
  return getPage<CursorPage<ApiKeyItem>>(`workspaces/${workspaceId}/api-keys`, params)
}

/**
 * 创建 API Key。
 * 响应中的 `key` 字段（明文）仅此一次返回，前端必须立即让用户复制。
 */
export function createApiKey(workspaceId: string, body: CreateApiKeyRequest) {
  return post<ApiKeyCreated>(`workspaces/${workspaceId}/api-keys`, body)
}

/** 更新 API Key（name / expires_at / spending_limit） */
export function updateApiKey(workspaceId: string, keyId: string, body: UpdateApiKeyRequest) {
  return patch<ApiKeyItem>(`workspaces/${workspaceId}/api-keys/${keyId}`, body)
}

/** 删除 API Key：后端做软删除（revoke + deleted_at），立即对网关失效并从列表移除；
 *  行保留以维持计费/审计的 FK 引用完整性。 */
export function revokeApiKey(workspaceId: string, keyId: string) {
  return del<null>(`workspaces/${workspaceId}/api-keys/${keyId}`)
}

/**
 * 取回 API Key 完整明文（#298 复制 key）。仅 revealable=true 的 active 键；
 * 后端鉴权（key 属主或 ws_owner/ws_admin）+ 审计 + 限流。明文只进剪贴板，不落组件状态。
 */
export function revealApiKey(workspaceId: string, keyId: string) {
  return post<{ key: string }>(`workspaces/${workspaceId}/api-keys/${keyId}/reveal`, {})
}

/**
 * 取回轮转前旧 Key 明文（需求方#218）。轮转后、点「已轮转」确认前有效；
 * 服务端持久保存旧密文，刷新页面后仍可读，不再依赖前端本地暂存。
 */
export function revealPreviousApiKey(workspaceId: string, keyId: string) {
  return post<{ key: string }>(`workspaces/${workspaceId}/api-keys/${keyId}/reveal-previous`, {})
}

// ─── 治理动作（后端已就绪，S3）────────────────────────

/** 停用 API Key（可逆）：立即对网关失效，可再启用 */
export function disableApiKey(workspaceId: string, keyId: string) {
  return post<ApiKeyItem>(`workspaces/${workspaceId}/api-keys/${keyId}/disable`, {})
}

/** 启用（恢复）已停用的 API Key */
export function enableApiKey(workspaceId: string, keyId: string) {
  return post<ApiKeyItem>(`workspaces/${workspaceId}/api-keys/${keyId}/enable`, {})
}

/** 变更负责人 */
export function changeApiKeyOwner(workspaceId: string, keyId: string, body: ChangeApiKeyOwnerRequest) {
  return post<ApiKeyItem>(`workspaces/${workspaceId}/api-keys/${keyId}/change-owner`, body)
}

// ─── 以下依赖后端 #382-384，尚未交付；前端已接好，落地即生效。────────
// 调用失败（404/未实现）时由调用方 react-query 降级为隐藏/空态，不阻塞页面。

/** 顶部摘要卡（#383）；未交付时前端用 deriveSummary 从列表派生兜底 */
export function getApiKeySummary(workspaceId: string) {
  return get<ApiKeySummary>(`workspaces/${workspaceId}/api-keys/summary`)
}

/** Key 详情（#383）；未交付时前端用列表项兜底 */
export function getApiKeyDetail(workspaceId: string, keyId: string) {
  return get<ApiKeyDetail>(`workspaces/${workspaceId}/api-keys/${keyId}`)
}

/** 操作审计（GET .../{keyId}/audit）；返回 { items, next_cursor } */
export function getApiKeyAudit(workspaceId: string, keyId: string) {
  return get<ApiKeyAuditLogsResponse>(`workspaces/${workspaceId}/api-keys/${keyId}/audit`)
}

/** 生效护栏预算（单条闸门） */
export interface EffectiveBudget {
  aggregation_scope: string
  currency: string
  period_length: number
  period_unit: string
  spend_limit_amount: string
  /** 后端 effective 额外返回：本期已用 / 剩余 / 来源护栏（创建前预览 per_api_key 已用为 0） */
  spent?: string
  remaining?: string
  source_guardrail_id?: string
}

/** 单层护栏（组织/空间默认/Key 绑定等来源之一） */
export interface EffectiveGuardrailLayer {
  layer: string
  source: string
  guardrail_id: string
  guardrail_name: string
  is_default: boolean
  budgets: EffectiveBudget[]
  ip_whitelist: string[]
  model_blacklist: string[]
}

/** API Key 三层生效护栏预览（qa#379，GET .../{keyId}/effective-guardrails） */
export interface EffectiveGuardrails {
  key_id: string
  enforcement_note: string
  effective: {
    filter_source: string
    budgets: EffectiveBudget[]
    ip_whitelist: string[]
    model_blacklist: string[]
  }
  layers: EffectiveGuardrailLayer[]
}

/** 取 Key 的三层生效护栏（qa#379）：由 resolver 合并组织/空间默认/Key 绑定后的最终生效规则 */
export function getEffectiveGuardrails(workspaceId: string, keyId: string) {
  return get<EffectiveGuardrails>(`workspaces/${workspaceId}/api-keys/${keyId}/effective-guardrails`)
}

/** 创建前「生效护栏预览」入参（qa#420 第1项）：Key 未创建，按类型/负责人/所选 Key 护栏/创建人预览 */
export interface EffectiveGuardrailPreviewParams extends QueryParams {
  api_key_type?: string
  responsible_member_id?: string
  key_guardrail_id?: string
  created_by_member_id?: string
}

/**
 * 工作区级三层生效护栏预览（qa#420 第1项，GET .../guardrails/effective-preview）。
 * 与 .../{keyId}/effective-guardrails 同一 resolver（预览=实际拦截）：黑名单并集 / 白名单交集 / 预算最严。
 * 返回同 EffectiveGuardrails 形状，key_id 为空。不含提示词注入（那部分仍由前端 resolveKeyPromptInjection 解析）。
 */
export function getEffectiveGuardrailPreview(workspaceId: string, params: EffectiveGuardrailPreviewParams) {
  return get<EffectiveGuardrails>(`workspaces/${workspaceId}/guardrails/effective-preview`, params)
}

/** 轮转（#384）：新 Token 只回一次，旧 Token 进入过渡期 */
export function rotateApiKey(workspaceId: string, keyId: string) {
  return post<ApiKeyRotateResponse>(`workspaces/${workspaceId}/api-keys/${keyId}/rotate`, {})
}

/** 确认轮转（#384）：用户点「已轮转」后旧 Token 立即失效 */
export function confirmRotateApiKey(workspaceId: string, keyId: string) {
  return post<null>(`workspaces/${workspaceId}/api-keys/${keyId}/rotate/confirm`, {})
}
