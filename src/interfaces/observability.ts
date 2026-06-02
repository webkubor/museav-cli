import type { PlatformItem } from '@/types'

export interface ApiPlatformItem {
  provider_type: string
  display_name: string
  config_schema?: PlatformItem['config_schema']['fields']
}

export interface ApiForwardItem {
  id: string
  provider_type: string
  name: string
  enabled: boolean
  config: Record<string, unknown>
  workspace_id: string
  tenant_id: string
  last_success_at: string | null
  last_error: string | null
  api_key_ids: string[] | null
  privacy_mode_enabled: boolean
  sampling_rate: number
  status: string
  endpoint_url: string | null
  protocol: string | null
  config_version: number
  headers_set: boolean
}

export interface ApiPlatformListResponse {
  items: ApiPlatformItem[]
}

export interface ApiForwardListResponse {
  items: ApiForwardItem[]
}
