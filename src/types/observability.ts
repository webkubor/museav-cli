export interface LoggingConfig {
  input_output_logging_enabled: boolean
  broadcast_enabled: boolean
}

export interface UpdateLoggingConfigRequest {
  input_output_logging_enabled?: boolean
  broadcast_enabled?: boolean
}

export interface PlatformConfigField {
  key: string
  type: 'string' | 'secret' | 'json'
  required: boolean
  label: string
}

export interface PlatformItem {
  platform: string
  display_name: string
  logo_url: string
  config_schema: { fields: PlatformConfigField[] }
}

export interface ForwardItem {
  forward_id: string
  platform: string
  name: string
  enabled: boolean
  config: Record<string, unknown>
  scope: { workspace_ids: string[] }
  last_success_at: string | null
  last_error: string | null
  api_key_ids: string[]
  privacy_mode_enabled: boolean
  sampling_rate: number
  status: string
}

export interface CreateForwardRequest {
  platform: string
  name: string
  config: Record<string, unknown>
  enabled?: boolean
  api_key_ids?: string[]
  privacy_mode_enabled?: boolean
  sampling_rate?: number
}
