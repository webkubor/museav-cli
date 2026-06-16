/**
 * 模型目录筛选逻辑
 * 路由：/models/catalog
 * API：无直接请求，消费模型目录页已获取的模型数据
 */

import type { CatalogModelItem } from '@/types'

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
