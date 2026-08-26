/**
 * 模型目录筛选逻辑
 * 路由：/models（模型广场）
 * API：无直接请求，消费模型目录页已获取的模型数据
 *
 * 2026-08 筛选改版（shared/modelgo_prd#872）：输入类型/厂商/协议多选、上下文滑杆、
 * 输出模态分类栏均为**前端本地筛选** —— 后端 catalog/models 的 provider/protocol/
 * modality 参数只收单值、且没有输入模态参数（2026-08-26 test 实测：重复 provider
 * 只认一个、逗号分隔返回空集），服务端筛不动多选组合。列表本就 page_size=100
 * 一次拉全（真实目录 35 个），本地过滤成本可忽略；筛选项计数已按原型删除，
 * 侧栏 facets 计数链路（GROUP_PARAM_KEY / groupTotals）一并下线。
 * 后端补齐多值参数后可回迁服务端，见工单 #872。
 */

import type { CatalogModelItem } from '@/types'

/** 输入类型选项（原型 marketplaceFilterGroups「输入类型」）。
 *  取值对齐后端 input_modalities 字段的枚举（file 是真实下发值，非前端推断）。 */
export const INPUT_TYPE_CODES = ['text', 'image', 'audio', 'video', 'file'] as const
export type InputTypeCode = (typeof INPUT_TYPE_CODES)[number]

/** API 协议选项（原型 marketplaceProtocolFilterOptions）。 */
export const PROTOCOL_CODES = ['openai', 'anthropic', 'other'] as const

/**
 * 上下文滑杆档位（原型 marketplaceContextOptions，#872 需求点 8）。
 * code 是 token 下限（含边界，与旧 context_min 语义一致）；'all' = 任意（不限）。
 * 标签是无需翻译的容量记号，两种语言下相同。
 */
export const CONTEXT_SLIDER_STOPS = [
  { code: 'all', label: '' },
  { code: '4000', label: '4K' },
  { code: '16000', label: '16K' },
  { code: '32000', label: '32K' },
  { code: '64000', label: '64K' },
  { code: '128000', label: '128K' },
  { code: '256000', label: '256K' },
  { code: '1000000', label: '1M' },
] as const

/** 输出模态分类栏（原型 marketplaceOutputModalityOptions，#872 需求点 9）。 */
export const OUTPUT_MODALITY_CODES = ['text', 'image', 'video', 'audio', 'embedding', 'rerank'] as const
export type OutputModalityCode = (typeof OUTPUT_MODALITY_CODES)[number]

/** 从 `dim:value` 编码的 selected 数组解出的筛选状态。 */
export interface CatalogFilterState {
  /** 厂商（多选，小写归一） */
  vendors: string[]
  /** 输入类型（多选） */
  inputs: string[]
  /** API 协议（多选） */
  protocols: string[]
  /** 输出模态（单选分类栏；undefined = 全部） */
  outputModality?: string
  /** 能力标签（多选，AND 语义与服务端 capability_tag 一致） */
  tags: string[]
  /** 上下文 token 下限（undefined = 任意） */
  contextMin?: number
  /** 价格（free/paid 单选） */
  price?: string
  /** 只看折扣 */
  promoOnly: boolean
}

/** 解析 selected（`dim:value` 数组）。tag 的 code 可能含冒号，按首个冒号切。 */
export function parseCatalogFilters(selected: string[]): CatalogFilterState {
  const valuesOf = (dim: string) =>
    selected
      .filter((k) => k.startsWith(`${dim}:`))
      .map((k) => k.slice(dim.length + 1))
      .filter(Boolean)
  const ctxRaw = valuesOf('ctx')[0]
  const ctx = ctxRaw !== undefined && ctxRaw !== 'all' ? Number(ctxRaw) : undefined
  return {
    vendors: valuesOf('vendor').map((v) => v.toLowerCase()),
    inputs: valuesOf('input'),
    protocols: valuesOf('protocol'),
    outputModality: valuesOf('modality')[0],
    tags: valuesOf('tag'),
    contextMin: Number.isFinite(ctx) ? ctx : undefined,
    price: valuesOf('price')[0],
    promoOnly: selected.includes('promo:1'),
  }
}

/** 厂商归一（provider 优先，vendor 兜底；后端两种大小写混发，见 CatalogSidebar 去重注释） */
export function modelVendorCode(model: CatalogModelItem): string {
  return (model.provider || model.vendor || '').toLowerCase()
}

/** 输入模态。老数据没拆 input/output 时回退合并 modalities（与卡片模态流同口径）。 */
function inputModalitiesOf(model: CatalogModelItem): string[] {
  return model.input_modalities ?? model.modalities ?? []
}

/** 输出模态，回退口径同上。 */
export function outputModalitiesOf(model: CatalogModelItem): string[] {
  return model.output_modalities ?? model.modalities ?? []
}

/** free 只认服务端显式限免标记（promotion.free），绝不从「价格为 0」推断（qa#624） */
function isFreeModel(model: CatalogModelItem) {
  return Boolean(model.promotion?.free)
}

/**
 * 除输出模态外的全部维度匹配。组内 OR、组间 AND（原型口径）；
 * 输出模态单独留给分类栏计数用（计数要「排除本维度自身条件」，标准 faceted search）。
 */
export function matchesCatalogFiltersExceptOutput(model: CatalogModelItem, f: CatalogFilterState): boolean {
  if (f.vendors.length > 0 && !f.vendors.includes(modelVendorCode(model))) return false
  if (f.inputs.length > 0) {
    const inputs = inputModalitiesOf(model)
    if (!f.inputs.some((code) => inputs.includes(code))) return false
  }
  if (f.protocols.length > 0) {
    const protocols = model.protocols ?? []
    if (!f.protocols.some((code) => protocols.includes(code as 'openai' | 'anthropic' | 'other'))) return false
  }
  if (f.tags.length > 0) {
    const tags = (model.tags ?? []).map((tg) => tg.toLowerCase())
    if (!f.tags.every((code) => tags.includes(code.toLowerCase()))) return false
  }
  if (f.contextMin !== undefined && (model.context_length ?? 0) < f.contextMin) return false
  if (f.price === 'free' && !isFreeModel(model)) return false
  if (f.price === 'paid' && isFreeModel(model)) return false
  if (f.promoOnly && !model.promotion) return false
  return true
}

/** 输出模态单维匹配。 */
export function matchesOutputModality(model: CatalogModelItem, outputModality?: string): boolean {
  if (!outputModality) return true
  return outputModalitiesOf(model).includes(outputModality)
}

/** 全维度匹配（列表最终结果集）。 */
export function matchesCatalogFilters(model: CatalogModelItem, f: CatalogFilterState): boolean {
  return matchesCatalogFiltersExceptOutput(model, f) && matchesOutputModality(model, f.outputModality)
}

// ─── 以下为旧 /models/catalog 高级筛选（ModelCatalogFilters 组件）遗留逻辑 ───

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
