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

export interface ProviderForModel {
  provider_id: string
  provider_name: string
  provider_type: string
  region?: string
  upstream_model?: string
  context_length?: number
  pricing?: ModelPricing
  uptime_30d_pct?: string
  latency_p50_ms?: number
  throughput_tps?: number
  status: 'enabled' | 'disabled' | string
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
