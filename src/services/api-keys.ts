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

/** 撤销 API Key（立即对网关生效，status=revoked） */
export function revokeApiKey(workspaceId: string, keyId: string) {
  return del<null>(`workspaces/${workspaceId}/api-keys/${keyId}`)
}
