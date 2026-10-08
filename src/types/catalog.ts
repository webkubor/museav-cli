import type { Money } from './account'

/**
 * 模型级公开协议。闭集由 modelgo-model-gateway 的 pkg/publicprotocols 拥有，按网关
 * **实际入站面**定义：每个入站 wire surface 一个值（openai_chat_completions /
 * openai_images / openai_images_edits / openai_video / content_generation / mcp …），
 * 原生透传家族则按厂商操作细分（gemini_* / ark_* / kling_* / hailuo_* / vidu_*）。
 * 前端运行时从 /catalog/public-protocols 取标签，不硬编码。
 *
 * 过渡期内未重新打标的模型仍可能下发更旧的 openai/anthropic 两值——这是渐进迁移的
 * 预期状态，不是 bug，展示与筛选都要兼容。
 */
export type PublicProtocol =
  | 'openai_chat_completions'
  | 'openai_responses'
  | 'openai_completions'
  | 'openai_embeddings'
  | 'openai_embeddings_multimodal'
  | 'openai_rerank'
  | 'openai_images'
  | 'openai_images_edits'
  | 'openai_speech'
  | 'openai_transcriptions'
  | 'openai_translations'
  | 'anthropic_messages'
  | 'openai_video'
  | 'content_generation'
  | 'dashscope_realtime'
  | 'gemini_generate_content'
  | 'gemini_predict'
  | 'gemini_predict_long_running'
  | 'gemini_files'
  | 'ark_batch_chat_completions'
  | 'ark_context_create'
  | 'ark_context_chat_completions'
  | 'ark_tokenization'
  | 'kling_text2video'
  | 'kling_image2video'
  | 'kling_multi_image2video'
  | 'kling_omni_video'
  | 'kling_video_extend'
  | 'kling_motion_control'
  | 'kling_avatar_image2video'
  | 'kling_multi_elements'
  | 'kling_advanced_lip_sync'
  | 'kling_text_to_audio'
  | 'kling_video_to_audio'
  | 'kling_tts'
  | 'hailuo_video_generation'
  | 'vidu_text2video'
  | 'vidu_img2video'
  | 'vidu_start_end2video'
  | 'vidu_reference2video'
  | 'other'
  | 'openai'
  | 'anthropic'

export interface ModelPricing {
  input_per_1m: string
  output_per_1m: string
  cache_read_per_1m: string
  currency: string
  /** 计价模式：token（每 1M token）/ per_call（按次计，如图片「每张」）。缺省按 token。 */
  mode?: 'token' | 'per_call' | string
  /** 按次计价的单价（mode=per_call 时生效，如每张图片的价格）。 */
  per_call_price?: string
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
  /** 服务端判定的免费模型标记；限频提示等免费额度能力只能按此字段判断。 */
  free?: boolean
  /** 免费模型的服务端限频规则；未配置时整个字段省略，前端不展示限频提示。 */
  rate_limit?: CatalogModelRateLimit

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
  protocols?: PublicProtocol[]
  /** 适配的编程客户端；恒下发（可能为空数组），不会是 null（qa#583） */
  coding_tools?: ('claude-code' | 'codex')[]
  /** @deprecated 后端将删除（2026-07-31 口径变更）：可体验任务一律由 input/output_modalities
   *  推导（modelExperienceTasks），前端已不读这两个字段，仅保留类型定义待后端下线后移除 */
  experience_types?: string[]
  /** @deprecated 同 experience_types */
  default_experience_type?: string
  /** 模型级对比总开关 */
  compare_enabled?: boolean
  /** 一句话卖点（PRD §9.1 的「卡片短描述」）；缺失时卡片回落 description，见 cardSummary */
  tagline?: string
  /**
   * 长描述（PRD §9.1 的「详情简介」）。**列表接口恒下发**（空值给空串，不省略键 ——
   * shared/modelgo_prd#820 后端契约用例已守住），所以卡片回落到它不需要二次请求。
   * 此前这个字段只声明在 CatalogModelDetail 上，卡片拿不到，才有了 #820 的症状。
   */
  description?: string
  /**
   * 「最新发布」角标由服务端判定（released_at 30 天窗口）。不要在前端按
   * released_at 自行计算 —— 会随本地时钟与时区翻转。
   */
  is_new?: boolean
  cache_write_5m_per_1m?: string
  cache_write_1h_per_1m?: string
  /** 计价单位：缺省为每 1M token；张 / 秒 / 万字符等用于媒体模型 */
  price_unit?: string
  /** 英文站的计价单位（「秒」→「s」）；为空时回落 price_unit。 */
  price_unit_en?: string
  /** 媒体模型的文本 Token 分项价，作为主价格下的次行展示 */
  text_input_price?: string
  text_output_price?: string
  /**
   * 矩阵 / 额外分项价（视频按秒、图片按张）。有值时卡片/详情用它展示，
   * 不要把缺失的 input/output token 单价当成免费。
   */
  price_tiers?: CatalogPriceTier[]
  /**
   * token 模型的上下文分档 / 峰时价（shared/modelgo_prd#800）。与 price_tiers
   * （视频按秒/图片按张的媒体矩阵价）是两套东西，互不替代；平坦一口价模型接口
   * 省略该字段。起始档价格后端已写进 pricing.*，规格条继续展示起始档并加「起」，
   * 完整档位在详情页「价格梯度」区块渲染。
   */
  pricing_rules?: CatalogPricingRule[]
  /**
   * 促销叠加层。**存在即代表此刻生效** —— 生效判定在服务端用服务端时钟做，
   * 前端不得按时间窗口自行重算（接口也刻意不下发窗口）。
   * original_price 只是划线装饰，真实扣费是 pricing 里的正常价格。
   */
  promotion?: CatalogPromotion
}

/** 免费模型的限频规则（shared/modelgo_prd#914）。 */
export interface CatalogModelRateLimit {
  /** 窗口内最多请求数 */
  request_limit?: number
  /** 窗口内最多 Token 数 */
  token_limit?: number
  /** 限频窗口（秒） */
  window_seconds?: number
}

export interface CatalogPriceTier {
  label: string
  label_en?: string
  price: string
  unit: string
  /** 英文站的计价单位（「秒」→「s」）；为空时回落 unit。 */
  unit_en?: string
  bucket: string
  /**
   * 本档的折前价，**仅**在促销真的改动了这一档价格时下发。矩阵促销作用于每一档，
   * 单靠 promotion.original_price 撑不起「价格梯度」表的逐行划线
   * （shared/modelgo_prd#863）。与 promotion.original_* 同口径：只是划线装饰。
   */
  original_price?: string
}

/** 阶梯价规则（#800 契约）。dimension 目前两种：context_length（上下文分档）/
 *  peak_time（峰值时段）；未知维度降级渲染（prd#864 A3）。 */
export interface CatalogPricingRule {
  dimension: 'context_length' | 'peak_time' | string
  /** 区间展示文案，优先用（不要前端自己拼区间） */
  label?: string
  /** 英文文案；缺省回落 label */
  label_en?: string
  /** 上下文 token 上下界；最高档可能只有 min（「以上」） */
  min?: number
  max?: number
  /** 次级分档（prd#864）：同一区间内再按输出长度等条件拆行，
   *  sub_label 是该行的条件文案（如「输出 <200」），缺省即无次级条件 */
  sub_dimension?: string
  sub_label?: string
  sub_label_en?: string
  sub_min?: number
  sub_max?: number
  /** 每 1M token 单价，十进制字符串；促销期为折后价（#867 后端算好，前端只渲染） */
  input_per_1m?: string
  output_per_1m?: string
  cache_read_per_1m?: string
  /** 促销期逐档折前原价（#867/#860）：仅划线装饰，缺失或 ≤ 现价时不划 */
  original_input_per_1m?: string
  original_output_per_1m?: string
  original_cache_read_per_1m?: string
  /** 峰值时段（dimension=peak_time） */
  start_time?: string
  end_time?: string
  timezone?: string
  /** replace（绝对价）或 multiplier（倍率） */
  mode?: 'replace' | 'multiplier' | string
  /** mode=multiplier 时的倍率 */
  rate?: string
  /** 计价单位，一般为 M */
  unit?: string
}

export interface CatalogPromotion {
  /** 显式限免标记，绝不从「价格为 0」推断 */
  free: boolean
  /** @deprecated 兼容字段，等于 original_input_per_1m */
  original_price?: string
  original_input_per_1m?: string
  original_output_per_1m?: string
  original_cache_read_per_1m?: string
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
  /** 可选 banner 背景图；失效时回退默认底色，不破图 */
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
  /**
   * 计价模式（shared/modelgo_prd#852 契约定稿，恒下发）：token / per_call / ""（未配价行）。
   * per_call（按张）模型的每张价镜像在 input_price、output_price 恒 "0"，没有这个字段时
   * 前端无从与「便宜的 token 模型」区分——渲染必须按它分支，不要从价格形态推断。
   */
  pricing_mode?: 'token' | 'per_call' | '' | string
  /** 每张/每次价（#852，恒下发；token 模型为 "0"）。单位渲染走 priceUnitSuffix(undefined, 'per_call')。 */
  per_call_price?: string
  /**
   * 以下六项是列表卡片同名字段在相关模型扁平结构下的镜像（shared/modelgo_prd#871，
   * 后端 release-20260828-1 起下发）。此前 /related 是一份独立窄投影：没有媒体判别位、
   * 没有档位价、价格取最低档且为折前价 —— Seedance 系相关模型条渲染成
   * 「¥0 / ¥14 每M + 128K 上下文」而同页卡片是 ¥77（#861）。
   *
   * output_modalities 是媒体判别位：输出为 video/image/audio 的模型按 price_tiers
   * 最高档渲染主价格（#853 口径）并隐藏上下文行；文本模型仍渲染 input/output_price。
   * 老后端不下发时为 undefined → 退回文本形态（与升级前行为一致，不误伤）。
   */
  output_modalities?: string[]
  /** 档位矩阵（与卡片 price_tiers 逐字同源）；普通每 M token 模型缺省。 */
  price_tiers?: CatalogPriceTier[]
  price_unit?: string
  price_unit_en?: string
  /** input_price / output_price 已是折后现价；promotion 只带角标文案与划线原价。 */
  promotion?: CatalogPromotion | null
  text_input_price?: string
  text_output_price?: string
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

/**
 * 协议标签目录项（GET /catalog/public-protocols，公开、无需鉴权）。
 * 展示文案的真源现在是 modelgo-model-gateway `pkg/publicprotocols` 的静态注册表，
 * 经 controller（10min TTL 缓存 + 降级回源）→ web-api 逐层透传下发；前端不再手写
 * 协议 label 映射，只在这个接口不可用（未上线/未合并/请求失败）时回落本地兜底文案
 * （见 model-format.ts PROTOCOL_LABEL_ZH/EN、api-code-samples.ts PROTOCOL_LABEL/_EN）。
 * endpoint 对 code='other' 缺省（该协议不对应单一具体端点）。
 */
export interface PublicProtocolLabelItem {
  code: string
  label: string
  label_en: string
  endpoint?: string
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
