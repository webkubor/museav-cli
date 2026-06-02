/**
 * 可观测性配置（§九）
 * 路由：/observability
 * API：GET|PATCH /workspaces/:id/observability/settings、
 * GET /workspaces/:id/observability/platforms、
 * GET|POST|PATCH|DELETE /workspaces/:id/observability/broadcast-destinations
 */
import { del, get, patch, post } from '@/lib/request'
import type {
  ApiForwardItem,
  ApiForwardListResponse,
  ApiPlatformItem,
  ApiPlatformListResponse,
} from '@/interfaces/observability'
import type {
  CreateForwardRequest,
  ForwardItem,
  LoggingConfig,
  PlatformItem,
  UpdateLoggingConfigRequest,
} from '@/types'

function toPlatform(item: ApiPlatformItem): PlatformItem {
  return {
    platform: item.provider_type,
    display_name: item.display_name,
    logo_url: '',
    config_schema: { fields: item.config_schema ?? [] },
  }
}

function toForward(item: ApiForwardItem): ForwardItem {
  return {
    forward_id: item.id,
    platform: item.provider_type,
    name: item.name,
    enabled: item.enabled,
    config: item.config,
    scope: { workspace_ids: [item.workspace_id] },
    last_success_at: item.last_success_at,
    last_error: item.last_error,
    api_key_ids: item.api_key_ids ?? [],
    privacy_mode_enabled: item.privacy_mode_enabled,
    sampling_rate: item.sampling_rate,
    status: item.status,
  }
}

// ─── Logging 开关 ─────────────────────────────────

/** 读取 workspace 级 Input/Output Logging 开关配置 */
export function getLoggingConfig(workspaceId: string) {
  return get<Omit<LoggingConfig, 'retention_days'>>(
    `workspaces/${workspaceId}/observability/settings`
  ).then((config) => ({ ...config, retention_days: 30 }))
}

/** 更新 workspace 级 Logging 配置 */
export function updateLoggingConfig(workspaceId: string, body: UpdateLoggingConfigRequest) {
  return patch<Omit<LoggingConfig, 'retention_days'>>(
    `workspaces/${workspaceId}/observability/settings`,
    {
      input_output_logging_enabled: body.input_output_logging_enabled,
      broadcast_enabled: body.broadcast_enabled,
    }
  ).then((config) => ({ ...config, retention_days: body.retention_days ?? 30 }))
}

// ─── 平台目录（只读） ─────────────────────────────

/** 获取可观测平台目录（Datadog / OpenTelemetry 等） */
export function listPlatforms(workspaceId: string) {
  return get<ApiPlatformListResponse>(`workspaces/${workspaceId}/observability/platforms`).then(
    ({ items }) => ({ items: items.map(toPlatform) })
  )
}

// ─── Destination（Forward）管理 ──────────────────

/** 获取 workspace 下已配置的 Destination 列表 */
export function listForwards(workspaceId: string) {
  return get<ApiForwardListResponse>(
    `workspaces/${workspaceId}/observability/broadcast-destinations`
  ).then(({ items }) => ({ items: items.map(toForward) }))
}

/** 创建新 Destination */
export function createForward(workspaceId: string, body: CreateForwardRequest) {
  return post<ApiForwardItem>(`workspaces/${workspaceId}/observability/broadcast-destinations`, {
    provider_type: body.platform,
    name: body.name,
    config: body.config,
    enabled: body.enabled,
    sampling_rate: body.sampling_rate ?? 1,
    api_key_ids: body.api_key_ids,
    privacy_mode_enabled: body.privacy_mode_enabled,
  }).then(toForward)
}

/** 更新 Destination 配置 */
export function updateForward(
  workspaceId: string,
  forwardId: string,
  body: Partial<CreateForwardRequest>
) {
  return patch<ApiForwardItem>(
    `workspaces/${workspaceId}/observability/broadcast-destinations/${forwardId}`,
    {
      name: body.name,
      config: body.config,
      enabled: body.enabled,
      sampling_rate: body.sampling_rate,
      api_key_ids: body.api_key_ids,
      privacy_mode_enabled: body.privacy_mode_enabled,
    }
  ).then(toForward)
}

/** 删除 Destination */
export function deleteForward(workspaceId: string, forwardId: string) {
  return del<null>(`workspaces/${workspaceId}/observability/broadcast-destinations/${forwardId}`)
}
