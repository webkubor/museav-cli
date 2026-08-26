import type { CatalogModelTag, PublicProtocol, QueryParams } from '@/types'

/** 模型列表查询参数 */
export interface CatalogModelListParams extends QueryParams {
  /** 关键词搜索 */
  q?: string
  /** 模态：后端按 output_modality 匹配 */
  modality?: 'text' | 'image' | 'audio' | 'video' | 'embedding' | 'rerank' | 'transcription'
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
  /**
   * 排序。默认 recommended（精选轮播位 → sort_order → 发布时间），
   * 由服务端决定；popular 目前仍是前端本地排序，待服务端热度排序上线后替换。
   */
  sort?: 'recommended' | 'newest' | 'cheapest' | 'longest_context' | 'popular'
  cursor?: string
  page_size?: number

  // ─── 模型广场服务端筛选 ───
  /** 公开协议；双协议模型在任一值下都命中。2026-08 起为端点粒度 7 值，过渡期内
   *  也接受未迁移模型仍在用的旧 3 值（openai/anthropic/other） */
  protocol?: PublicProtocol
  /** 按适配的编程客户端筛选；coding_tools 为空的模型（QA 夹具/内部模型）永不命中（qa#583） */
  coding_tool?: 'claude-code' | 'codex'
  /**
   * 把广场里设为「隐藏」的模型也带出来。**仅在同时传 `coding_tool` 时服务端才认**，
   * 单独传不影响广场公开列表——隐藏语义是「不出现在公开浏览列表」，不是「不能接入」
   * （后端口径见 qa#601，需求来自 shared/modelgo_prd#567）。
   */
  include_hidden?: boolean
  /** 能力标签，可重复；多个为 AND 语义 */
  capability_tag?: string[]
  /** free = 存在生效的显式限免促销，不是「价格为 0」 */
  price?: 'free' | 'paid'
  /** 折扣开关：只看有生效促销的模型 */
  promo?: boolean
  experience_type?: string
  compare_only?: boolean
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
