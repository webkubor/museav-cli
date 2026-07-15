import type { QueryParams } from '@/types'

/**
 * API Key 列表查询参数（对齐 Swagger GET /workspaces/{id}/api-keys）。
 * 注：后端支持 q / owner_account_id / responsible_member_id / key_type / view / cursor / page_size；
 * 无 status 筛选参数——status 只能客户端过滤。
 * #60 起响应为 CursorPage 分页对象：列表页走 page_size+cursor 真分页（q/key_type/responsible_member_id
 * 下推服务端）；下拉候选类不带分页参数（page_size:0=不限）拿全量。
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
