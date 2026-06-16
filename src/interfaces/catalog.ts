import type { CatalogModelTag, QueryParams } from '@/types'

/** 模型列表查询参数 */
export interface CatalogModelListParams extends QueryParams {
  /** 关键词搜索 */
  q?: string
  /** 模态：text | image | embedding */
  modality?: 'text' | 'image' | 'embedding'
  /** Prompt Pricing 范围（每 1M 输入 token 价格，单位 USD） */
  min_input_price?: number
  max_input_price?: number
  /** Context Length 范围 */
  context_min?: number
  context_max?: number
  /** 供应商类型多选，逗号分隔 */
  provider_type?: string
  /** 模型作者多选，逗号分隔 */
  author?: string
  /** 按模型族（模型组）精确筛选，大小写不敏感，取 family 的 code */
  family?: string
  /** 是否仅返回支持零数据留存的模型 */
  zero_data_retention?: boolean
  /** 是否仅返回支持区域内路由的模型 */
  in_region_routing?: boolean
  /** 能力标签筛选，如 reasoning | vision | code */
  capability?: string
  /** 排序：newest | cheapest | popular（默认 popular） */
  sort?: 'newest' | 'cheapest' | 'popular'
  cursor?: string
  page_size?: number
}

/** 供应商列表查询参数 */
export interface CatalogProviderListParams extends QueryParams {
  q?: string
  /** 排序：uptime | models | daily_tokens */
  sort?: 'uptime' | 'models' | 'daily_tokens'
  cursor?: string
  page_size?: number
}

export interface CatalogModelTagsResponse {
  items: CatalogModelTag[]
  total: number
}

/** 模型族（模型组）—— 官方分组，用于「模型组」筛选，替代暴露上游的 vendor */
export interface CatalogModelFamily {
  id: string
  code: string
  name_zh: string
  name_en: string
  sort_order: number
  enabled: boolean
}

export interface CatalogModelFamiliesResponse {
  items: CatalogModelFamily[]
  total: number
}
