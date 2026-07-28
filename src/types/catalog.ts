import type { Money } from './account'

export interface ModelPricing {
  input_per_1m: string
  output_per_1m: string
  cache_read_per_1m: string
  currency: string
}

export interface CatalogModelItem {
  id: string
  model_id: string
  display_name: string
  /** 官方模型提供方（厂商）——对外展示用，替代暴露上游的 vendor */
  provider?: string
  /** 上游供应方（内部/图标解析用，勿直接对外展示） */
  vendor?: string
  modalities: string[]
  tags: string[]
  context_length: number
  max_output_tokens: number
  pricing: ModelPricing
  providers_count?: number
  released_at: string
  knowledge_cutoff: string
  monthly_tokens?: string
  zero_data_retention?: boolean
  in_region_routing?: boolean
  status: string
  logo_url: string

  // ─── 模型广场字段 ───
  /** 稳定公开 URL 片段；缺省时回落 model_id */
  slug?: string
  /**
   * 输入 / 输出模态分开下发。卡片要渲染「输入 → 输出」图标流，而合并后的
   * modalities 是并集，恢复不出方向。
   */
  input_modalities?: string[]
  output_modalities?: string[]
  /** 模型级公开协议 */
  protocols?: ('openai' | 'anthropic' | 'other')[]
  /** 可体验任务；空数组 = 未开放在线体验 */
  experience_types?: string[]
  default_experience_type?: string
  /** 模型级对比总开关 */
  compare_enabled?: boolean
  /** 一句话卖点 */
  tagline?: string
  /**
   * 「最新发布」角标由服务端判定（released_at 30 天窗口）。不要在前端按
   * released_at 自行计算 —— 会随本地时钟与时区翻转。
   */
  is_new?: boolean
  cache_write_5m_per_1m?: string
  cache_write_1h_per_1m?: string
  /** 计价单位：缺省为每 1M token；张 / 秒 / 万字符等用于媒体模型 */
  price_unit?: string
  /** 媒体模型的文本 Token 分项价，作为主价格下的次行展示 */
  text_input_price?: string
  text_output_price?: string
  /**
   * 促销叠加层。**存在即代表此刻生效** —— 生效判定在服务端用服务端时钟做，
   * 前端不得按时间窗口自行重算（接口也刻意不下发窗口）。
   * original_price 只是划线装饰，真实扣费是 pricing 里的正常价格。
   */
  promotion?: CatalogPromotion
}

export interface CatalogPromotion {
  /** 显式限免标记，绝不从「价格为 0」推断 */
  free: boolean
  original_price?: string
  /** 中文角标文案 */
  discount_label?: string
  /** 英文角标文案；为空时回落中文 */
  discount_label_en?: string
}

export interface CatalogFacetBucket {
  value: string
  count: number
}

/**
 * 模型广场侧栏筛选计数。每个维度的计数都排除该维度自身的条件（标准 faceted
 * search），所以选中一个选项不会让同组其它选项归零。
 * total 是应用全部条件后的数量，即列表会返回的条数。
 */
export interface CatalogFacets {
  total: number
  vendors: CatalogFacetBucket[]
  modalities: CatalogFacetBucket[]
  protocols: CatalogFacetBucket[]
  capabilities: CatalogFacetBucket[]
  /** 上下文阈值桶，value 是 token 数字符串；阈值由服务端定义 */
  contexts: CatalogFacetBucket[]
  prices: CatalogFacetBucket[]
  promo_count: number
}

/** 精选轮播位。轮播内容完全由后台配置，前端不得写死 model_id。 */
export interface CatalogFeaturedSlide {
  carousel_item_id: string
  model_id: string
  slug?: string
  name: string
  vendor: string
  /** 模型自身的一句话卖点；featured_pitch 为该轮播位的覆盖文案 */
  tagline?: string
  featured_pitch?: string
  featured_pitch_en?: string
  /** default_01..default_05；为空时按 model_id 稳定映射 */
  background_key?: string
  /** 可选底部装饰图；失效只隐藏装饰，不破图 */
  bottom_image_url?: string
  logo_url?: string
  input_price: string
  output_price: string
  currency: string
  /** 「最新发布」角标由服务端判定（released_at 30 天窗口），前端不得自行计算 */
  is_new?: boolean
  promotion?: CatalogPromotion
}

export interface CatalogRelatedModel {
  id: string
  model_id: string
  slug?: string
  name: string
  vendor: string
  context_length: number
  input_price: string
  output_price: string
  currency: string
  is_free: boolean
  logo_url?: string
}

/** 相关模型。curated 标明来源（运营配置 vs 回退算法），两者渲染一致。 */
export interface CatalogRelatedResult {
  items: CatalogRelatedModel[]
  total: number
  curated: boolean
}

export interface ModelVariant {
  variant_id: string
  label: string
}

export interface CatalogModelDetail extends CatalogModelItem {
  description: string
  tags: string[]
  variants: ModelVariant[]
  benchmarks_summary?: Record<string, unknown>
}

export interface CatalogModelTag {
  id: string
  code: string
  group_code: string
  name_zh: string
  name_en: string
  enabled: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface CatalogProviderItem {
  provider_id: string
  provider_name: string
  provider_type: string
  logo_url: string
  regions: string[]
  models_count: number
  modalities: string[]
  uptime_30d_pct: string
  tags: string[]
  status: string
}

export interface PlanFeatures {
  platform_fees_pct: number
  models: string
  providers: string
  chat_api: boolean
  activity_logs_export: boolean
  budgets_and_spend_controls: boolean
  provisioning_keys_sso: boolean
  custom_data_policies: boolean
  soc2_hipaa: boolean
  dedicated_infra: boolean
  volume_discount: boolean
  priority_support: boolean
}

export interface PlanCTA {
  type: 'signup' | 'contact_sales'
  label: string
}

export interface PricingPlanItem {
  plan_id: string
  name: string
  monthly_fee: Money
  features: PlanFeatures
  cta: PlanCTA
}

export interface PricingFAQ {
  id: string
  question: string
  answer: string
}

export interface PricingPlansResult {
  plans: PricingPlanItem[]
  faq: PricingFAQ[]
}

export interface DocsNavPage {
  id: string
  title: string
  slug: string
}

export interface DocsNavSection {
  id: string
  title: string
  pages: DocsNavPage[]
}

export interface DocsNavResult {
  sections: DocsNavSection[]
}

export interface DocsPage {
  slug: string
  title: string
  html: string
  toc: Array<{ id: string; title: string; level: number }>
  code_examples: Array<{ lang: string; label: string; code: string }>
  updated_at: string
}

export interface HealthStatus {
  status: 'healthy' | 'degraded'
}
