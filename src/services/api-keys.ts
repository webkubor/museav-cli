/**
 * API 密钥管理（§八）
 * 路由：/api-keys
 * API：GET|POST /api-keys、PATCH|DELETE /api-keys/:id
 */
import { del, get, patch, post } from '@/lib/request'
import type {
  ApiKeyCreated,
  ApiKeyItem,
  CreateApiKeyRequest,
  CursorPage,
  UpdateApiKeyRequest,
} from '@/types'
import type { ApiKeyListParams } from '@/interfaces/api-keys'

/** 获取 workspace 下的 API Key 列表 */
export function listApiKeys(workspaceId: string, params?: ApiKeyListParams) {
  return get<CursorPage<ApiKeyItem>>(`workspaces/${workspaceId}/api-keys`, params)
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
