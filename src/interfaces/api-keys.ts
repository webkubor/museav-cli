import type { QueryParams } from '@/types'

/**
 * API Key 列表查询参数（对齐 Swagger GET /workspaces/{id}/api-keys）。
 * 注：后端支持 q / owner_account_id / responsible_member_id / key_type / view / cursor / page_size；
 * 无 status 筛选参数——status 只能客户端过滤。当前页用大 page_size 拉全量、四筛选统一走客户端（#383）。
 */
export interface ApiKeyListParams extends QueryParams {
  /** 关键词搜索 name */
  q?: string
  /** 按 owner 筛选 */
  owner_account_id?: string
  /** 按负责人/维护人筛选 */
  responsible_member_id?: string
  /** 按类型筛选 */
  key_type?: 'personal' | 'member' | 'service'
  /** 数据范围视图：mine=仅自己 / company=企业视图 */
  view?: 'mine' | 'company'
  cursor?: string
  page_size?: number
}
