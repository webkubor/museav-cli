import type { QueryParams } from '@/types'

/** API Key 列表查询参数 */
export interface ApiKeyListParams extends QueryParams {
  /** 关键词搜索 name */
  q?: string
  /** 按创建者筛选 */
  owner_account_id?: string
  cursor?: string
  page_size?: number
}
