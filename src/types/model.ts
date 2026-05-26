/** AI 模型 */
export interface Model {
  /** 模型唯一标识，通常用于接口路径和调用参数。 */
  id: string
  /** 模型展示名称。 */
  name: string
  /** 默认或主展示供应商名称。 */
  provider: string
  /** 上下文长度，单位为 token。 */
  context_length: number
  /** 输入价格，按 API 文档中的字符串格式展示，避免前端自行换算精度。 */
  input_price: string
  /** 输出价格，按 API 文档中的字符串格式展示，避免前端自行换算精度。 */
  output_price: string
  /** 模型描述，用于模型详情和卡片摘要。 */
  description: string
  /** 能力标签，例如文本、视觉、推理、工具调用等。 */
  tags: string[]
  /** 可用状态 */
  status?: 'available' | 'unavailable' | 'degraded'
  /** 适用场景列表（详情页用） */
  use_cases?: string[]
  /** 该模型的供应商可用性列表（详情页用） */
  providers?: ModelProvider[]
}

/** 模型的单个供应商可用性信息 */
export interface ModelProvider {
  name: string
  status: 'online' | 'degraded' | 'offline'
  data_retention: string
  privacy_url?: string
}

/** 模型列表筛选参数 */
export interface ModelFilters {
  keyword?: string
  capabilities?: string[]
  providers?: string[]
  sort_by?: 'input_price' | 'output_price'
  sort_dir?: 'asc' | 'desc'
}

/** 定价套餐 */
export type PricingTier =
  | 'free' // 免费或试用套餐，用于低门槛体验。
  | 'payg' // Pay as you go，按量付费套餐。
  | 'enterprise' // 企业套餐，需要销售或定制化支持。

export interface PricingPlan {
  /** 套餐层级。 */
  tier: PricingTier
  /** 套餐展示名称。 */
  name: string
  /** 套餐价格；企业套餐或联系销售场景可以为 null。 */
  price: number | null
  /** 套餐能力点列表。 */
  features: string[]
}
