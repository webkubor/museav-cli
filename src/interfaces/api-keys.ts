import type { QueryParams } from '@/types'

/** API Key 列表查询参数 */
export interface ApiKeyListParams extends QueryParams {
  /** 关键词搜索 name */
  q?: string
  /** 按负责人筛选 */
  owner_account_id?: string
  /** 按类型筛选（#382 待后端支持；未支持前前端本地过滤） */
  key_type?: 'personal' | 'member' | 'service'
  /** 按状态筛选（#382 待后端支持） */
  status?: 'active' | 'disabled' | 'expired' | 'limit_reached'
  cursor?: string
  page_size?: number
}
