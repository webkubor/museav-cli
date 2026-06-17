import type { QueryParams, TenantItem, TenantSettings } from '@/types'

export interface UpdateTenantRequest {
  name?: string
  settings?: Partial<TenantSettings>
}

/** 成员列表查询参数 */
export interface TenantMemberListParams extends QueryParams {
  /** 关键词搜索 display_name 或 email */
  q?: string
  cursor?: string
  page_size?: number
}

export interface TenantListResponse {
  items: TenantItem[]
  can_create_org?: boolean
}
