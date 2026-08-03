/**
 * 模型目录筛选逻辑
 * 路由：/models/catalog
 * API：无直接请求，消费模型目录页已获取的模型数据
 */

import type { CatalogModelItem } from '@/types'

/**
 * 单选筛选组 → 它在列表 / facets 请求里对应的参数名（shared/modelgo_prd#330）。
 *
 * 每组「全部」一行要展示的是「排除本组自身条件之后的总数」，而不是 `facets.total`
 * （后者的语义是「应用全部条件后列表会返回的条数」）。拿 total 当每组的「全部」，
 * 选中某个厂商后厂商组的「全部」就会从 19 跳成 4 —— 用户既看不到候选总量，也判断
 * 不出筛选缩小了多少。
 *
 * 后端每个**桶**的计数已排除本维度自身条件（标准 faceted search），但没有下发按维度的
 * total，前端也凑不出来：厂商 / 价格求和能对上，模型类型是多值（一个模型可同时命中
 * 文本与图像）求和会重复计，上下文是累进阈值（≥128K/≥256K/≥1M 互相包含）求和无意义，
 * 协议桶线上还是空数组。所以由 catalog/index.tsx 按维度补发一次「剔除本维度条件」的
 * facets 请求取 total，结果经 groupTotals 传给 CatalogSidebar。
 * 后端补上 per-dimension total 后这一整套可以删掉。
 *
 * 能力标签是多选下拉、没有「全部」行，折扣是开关（用 facets.promo_count），都不在此列。
 */
export const GROUP_PARAM_KEY = {
  vendor: 'provider',
  modality: 'modality',
  protocol: 'protocol',
  ctx: 'context_min',
  price: 'price',
} as const

export type FilterGroupId = keyof typeof GROUP_PARAM_KEY

/** 模型目录高级筛选状态。 */
export interface AdvancedFilterState {
  language: string
  context: string
  scenario: string
}

/** 模型目录高级筛选默认值。 */
export const DEFAULT_ADVANCED_FILTERS: AdvancedFilterState = {
  language: 'all',
  context: 'all',
  scenario: 'all',
}

/** 模型上下文长度筛选配置。 */
export const CONTEXT_FILTERS = [
  { code: '512', min: 512 },
  { code: '8k', min: 8_000 },
  { code: '16k', min: 16_000 },
  { code: '32k', min: 32_000 },
  { code: '64k', min: 64_000 },
  { code: '128k', min: 128_000 },
  { code: '192k', min: 192_000 },
  { code: '198k', min: 198_000 },
  { code: '200k', min: 200_000 },
  { code: '256k', min: 256_000 },
  { code: '1m', min: 1_000_000 },
] as const

const CHINESE_LANGUAGE_HINTS = [
  'qwen',
  'deepseek',
  'baidu',
  'zhipu',
  'glm',
  'moonshot',
  'yi-',
  'minimax',
  'doubao',
  'ark/',
  'hunyuan',
  'tencent',
  'alibaba',
  'baichuan',
  'internlm',
]

const ENGLISH_LANGUAGE_HINTS = [
  'openai',
  'anthropic',
  'claude',
  'mistral',
  'google',
  'gemini',
  'meta',
  'llama',
  'cohere',
  'xai',
  'stability',
  'bigcode',
]

function getModelSearchText(model: CatalogModelItem) {
  return [
    model.model_id,
    model.display_name,
    model.provider,
    ...(model.tags ?? []),
    ...(model.modalities ?? []),
  ].filter(Boolean).join(' ').toLowerCase()
}

function matchesLanguage(model: CatalogModelItem, language: string) {
  if (language === 'all') return true

  const text = getModelSearchText(model)
  if (language === 'zh') return CHINESE_LANGUAGE_HINTS.some((hint) => text.includes(hint))
  if (language === 'en') return ENGLISH_LANGUAGE_HINTS.some((hint) => text.includes(hint))

  return (
    language === 'multilingual' &&
    (
      text.includes('multi') ||
      text.includes('translation') ||
      text.includes('translate') ||
      text.includes('多语言') ||
      (
        CHINESE_LANGUAGE_HINTS.some((hint) => text.includes(hint)) &&
        ENGLISH_LANGUAGE_HINTS.some((hint) => text.includes(hint))
      )
    )
  )
}

function matchesContext(model: CatalogModelItem, context: string) {
  if (context === 'all') return true
  const selected = CONTEXT_FILTERS.find((item) => item.code === context)
  return selected ? model.context_length >= selected.min : true
}

/** 判断单个模型是否满足高级筛选条件。 */
export function matchesAdvancedFilters(model: CatalogModelItem, filters: AdvancedFilterState) {
  return (
    matchesLanguage(model, filters.language) &&
    matchesContext(model, filters.context) &&
    (
      filters.scenario === 'all' ||
      model.tags?.some((tag) => tag.toLowerCase() === filters.scenario.toLowerCase())
    )
  )
}
