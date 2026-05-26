import type { DeadLetter, PlatformItem, QueryParams } from '@/types'

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
  last_success_at: string | null
  last_error: string | null
}

export interface ApiDeadLetter {
  dead_letter_id: string
  destination_id: string
  provider_type: string
  payload_excerpt: string
  error_message: string
  attempts: number
  status: DeadLetter['status']
  created_at: string
  last_attempt_at: string
}

/** 死信列表查询参数 */
export interface DeadLetterListParams extends QueryParams {
  destination_id?: string
  status?: 'pending' | 'retrying' | 'ignored' | 'dropped'
  cursor?: string
}

export interface ApiPlatformListResponse {
  items: ApiPlatformItem[]
}

export interface ApiForwardListResponse {
  items: ApiForwardItem[]
}
