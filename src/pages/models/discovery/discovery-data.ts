/**
 * 模型发现页的数据层 —— 把 observer 的接口数据转成原型组件消费的形状。
 *
 * 原型（移植自 PRD）用 `modality + task` 两级描述业务，接口用一维的九种
 * `DiscoveryType`，两者一一对应（见 MODALITY_TASK_TO_TYPE）。原型的模型卡字段是
 * **预格式化字符串**（"146 tok/s" / "$0.34/M" / "2.4B"），接口给的是数值 + 单位，
 * 所以转换的主要工作是按业务类型选对口径再格式化。
 *
 * 口径依据 taskMetricProfiles（PRD commit 73cbb28 起）：
 * - 文本 / 代码 / Agent：score=指数，price=单次任务成本，performance=输出 TPS
 * - 图像 / 视频 / 音频：score=Elo（STT 是 WER），**performance 字段承载 API 价格**
 *   （该批把不可靠的生成耗时撤下，媒体类型不再展示速度）
 */
import type {
  DiscoveryModelCard,
  DiscoveryOverview,
  DiscoveryRankingItem,
  DiscoveryType,
} from '@/types'

export type ModalityKey = 'agent' | 'text' | 'image' | 'video' | 'audio'

/** 原型的 `modality|task` → 接口的业务类型。九个 task 精确对应九种 type。 */
export const MODALITY_TASK_TO_TYPE: Record<string, DiscoveryType> = {
  'agent|Agent': 'AGENT',
  'text|文本对话': 'TEXT_CHAT',
  'text|代码生成': 'CODE_GENERATION',
  'image|文生图': 'TEXT_TO_IMAGE',
  'image|图片编辑': 'IMAGE_EDITING',
  'video|文生视频': 'TEXT_TO_VIDEO',
  'video|图生视频': 'IMAGE_TO_VIDEO',
  'audio|语音合成（TTS）': 'TTS',
  'audio|语音识别（STT）': 'STT',
}

export function discoveryTypeFor(modality: ModalityKey, task: string): DiscoveryType | undefined {
  return MODALITY_TASK_TO_TYPE[`${modality}|${task}`]
}

/** 语言三类：指数 + 单次任务成本 + 输出 TPS；其余为媒体类型，只有 Elo/WER + 价格。 */
export function isLanguageType(type: DiscoveryType) {
  return type === 'TEXT_CHAT' || type === 'CODE_GENERATION' || type === 'AGENT'
}

/**
 * 原型用「—」表示该项无数据（不是 0）。接口的 null 一律转成它，
 * 而不是补 0 —— 补 0 会让模型在排序里排到末尾，看着像"最差"而不是"没数据"。
 */
export const EMPTY = '—'

/** 数量紧凑展示：2_403_806 → "2.4M"。与原型 compactNumber 的口径一致。 */
export function compactAmount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return EMPTY
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`
  return `${value}`
}

/** 质量分：指数保留 1 位小数，Elo 取整，WER 带百分号（STT 越低越好）。 */
export function formatScore(card: Pick<DiscoveryModelCard, 'primary_score' | 'primary_metric'>): string {
  const { primary_score: score, primary_metric: metric } = card
  if (score === null) return EMPTY
  if (metric === 'AA_WER') return `${score}%`
  if (metric === 'ELO' || metric === 'VOICE_ELO') return `${Math.round(score)}`
  return score.toFixed(1)
}

/**
 * 价格串。原型的 metricValue() 会把 "/M" 里的 M 当成百万倍率，所以价格一律走
 * plainMetricValue 解析 —— 这里只负责展示，单位后缀由业务类型决定。
 */
export function formatPrice(value: number | null, type: DiscoveryType): string {
  if (value === null) return EMPTY
  if (isLanguageType(type)) return `$${value.toFixed(4)}/次`
  if (type === 'TEXT_TO_IMAGE' || type === 'IMAGE_EDITING') return `$${value}/1K 张`
  if (type === 'TEXT_TO_VIDEO' || type === 'IMAGE_TO_VIDEO') return `$${value}/分钟`
  if (type === 'TTS') return `$${value}/1M 字符`
  return `$${value}/1K 分钟`
}

/** 原型的 DiscoveryModel 形状（与 ModelDiscoveryPagePrototype 内的类型一致）。 */
export interface PrototypeModel {
  id?: string
  /** 接口入参用的唯一标识，usage-trends / analysis 都要它。 */
  sourceModelId: string
  name: string
  provider: string
  supported: boolean
  score: string
  performance: string
  price: string
  usage: string
  release?: string
  /** 性价比（接口 value_score）。STT 恒无，产品口径不计算。 */
  valueScore: string
  /** 端到端时延，媒体类型不提供。 */
  latency: string
  /** 排序用的原始数值，避免从展示串里反解析（"$0.34/M" 会被解析出 0.34 但丢单位）。 */
  raw: {
    score: number | null
    price: number | null
    tps: number | null
    latencyMs: number | null
    usage: number | null
    valueScore: number | null
  }
}

/**
 * 排名条目 → 原型模型卡。
 *
 * `supported` 用 integration_status 判定：MODELGO 才是本平台已接入、可跳详情的模型；
 * MODELGO_AI 只在榜单里展示，没有详情页，所以不给 id。
 */
export function toPrototypeModel(item: DiscoveryRankingItem, type: DiscoveryType): PrototypeModel {
  const supported = item.integration_status === 'MODELGO'
  return {
    // 只有已接入的模型能跳详情；modelgo_id 为空时也不给 id，避免点出 404
    id: supported && item.modelgo_id ? item.modelgo_id : undefined,
    sourceModelId: item.source_model_id,
    name: item.model_name,
    provider: item.creator_name ?? '',
    supported,
    score: formatScore(item),
    // 媒体类型没有速度指标，该字段按 PRD 73cbb28 承载 API 价格
    performance: isLanguageType(type)
      ? item.output_tps === null
        ? EMPTY
        : `${Math.round(item.output_tps)} tok/s`
      : formatPrice(item.cost_value, type),
    price: formatPrice(item.cost_value, type),
    usage: compactAmount(item.usage_value),
    release: item.release_date ?? undefined,
    valueScore: item.value_score === null ? EMPTY : item.value_score.toFixed(1),
    latency: item.end_to_end_latency_ms === null ? EMPTY : `${Math.round(item.end_to_end_latency_ms)} ms`,
    raw: {
      score: item.primary_score,
      price: item.cost_value,
      tps: item.output_tps,
      latencyMs: item.end_to_end_latency_ms,
      usage: item.usage_value,
      valueScore: item.value_score,
    },
  }
}

/** 专项榜的取数字段与排序方向。按榜单标题匹配 —— 标题是产品文案，字段是数据口径。 */
type SpecialtyField = 'valueScore' | 'tps' | 'latencyMs' | 'usage' | 'price'

function specialtyFieldFor(
  title: string,
  scoreAscending: boolean,
): { field: SpecialtyField | 'score'; ascending: boolean } | undefined {
  if (title.includes('性价比')) return { field: 'valueScore', ascending: false }
  if (title.includes('TPS')) return { field: 'tps', ascending: false }
  if (title.includes('时延')) return { field: 'latencyMs', ascending: true }
  if (title.includes('热度') || title.includes('使用量')) return { field: 'usage', ascending: false }
  // 「单次任务成本」与「API 价格」是同一个字段的两种叫法（语言类按次计费、媒体类按量计费）
  if (title.includes('价格') || title.includes('成本')) return { field: 'price', ascending: true }
  // STT 的主指标是 WER，越低越好，所以方向要由调用方按业务类型给
  if (title.includes('评分') || title.includes('Elo')) return { field: 'score', ascending: scoreAscending }
  return undefined
}

/**
 * 专项榜的行数据。
 *
 * 原先是写死的 5 行 + 一个「拿最后一名的值乘衰减系数补满 Top 10」的函数——那是
 * 纯编造。现在一律从真实模型卡按对应字段排序取前 10。
 *
 * **无该指标数据的模型直接排除**，不是排到末尾：接口的 null 表示第三方没提供，
 * 混进榜单会让人以为它排最后（即"最差"）。
 */
export function specialtyRows(
  title: string,
  models: readonly PrototypeModel[],
  options: { limit?: number; scoreAscending?: boolean } = {},
): Array<{ model: string; value: string; provider: string; short: string; ratio: number }> {
  const { limit = 10, scoreAscending = false } = options
  const spec = specialtyFieldFor(title, scoreAscending)
  if (!spec) return []
  const picked = models
    .filter((model) => model.raw[spec.field] !== null)
    .sort((first, second) => {
      const a = first.raw[spec.field]!
      const b = second.raw[spec.field]!
      return spec.ascending ? a - b : b - a
    })
    .slice(0, limit)

  const values = picked.map((model) => model.raw[spec.field]!)
  const max = Math.max(...values, 0)
  const min = Math.min(...values, max)

  return picked.map((model) => {
    const raw = model.raw[spec.field]!
    const value =
      spec.field === 'valueScore'
        ? model.valueScore
        : spec.field === 'tps'
          ? model.performance
          : spec.field === 'latencyMs'
            ? model.latency
            : spec.field === 'usage'
              ? model.usage
              : spec.field === 'score'
                ? model.score
                : model.price
    return {
      model: model.name,
      value,
      provider: model.provider,
      // 柱内标签：去掉单位与前后缀，只留数字。"$0.0656/次" 在 34px 宽的柱子里放不下，
      // 单位已经写在图表副标题里（如「（USD / Task）」），柱子上重复一遍纯属噪声。
      short: compactBarLabel(value),
      // 柱高比例：**min-max 归一化**，不是 value/max。
      // 真实数据的值域常常很窄（综合评分 61.3→57.1 只差 7%），按 value/max 算出来
      // 十根柱子肉眼等高，图表等于没有信息量。归一化后同一张图内的排序差异能看出来；
      // 每根柱子上都标着真实数值，不会因此误读绝对量。
      ratio: max === min ? 1 : (raw - min) / (max - min),
    }
  })
}

/** 柱内标签：剥掉货币符号、单位与后缀，只留数字（含小数点与千分位）。 */
function compactBarLabel(value: string): string {
  const matched = value.match(/[\d.,]+[BMKT]?/)
  return matched ? matched[0] : value
}

/** 总览卡：接口的 highlights 六键 → 原型 summary 的 { label, model, value, unit }。 */
export interface PrototypeSummaryCard {
  label: string
  model: string
  value: string
  unit: string
  /** 厂商名，用于卡片上的品牌图标。取 highlight 自带的 creator_name —— highlight 是在
   *  全量模型上算出来的，本地只有前 100 条，从本地列表反查会找不到而回退成模型名。 */
  provider: string
}

type HighlightKey = keyof DiscoveryOverview['highlights']

const HIGHLIGHT_LABEL: Record<HighlightKey, string> = {
  highest_score: '综合评分最高',
  highest_open_source_score: '开源模型评分最高',
  highest_value: '性价比最高',
  lowest_price: 'API 价格最低',
  highest_output_tps: '输出速度最快',
  highest_usage: '近 7 日 ModelGo 使用量最高',
}

/**
 * 每种业务类型展示哪几张总览卡，以及顺序。
 *
 * 不是六张全上 —— 卡片组成是**每个 task 独立的产品口径**，与原型的
 * summaryTooltipCopy 逐条对齐（tooltip 有几条就是几张卡）：
 * - 语言三类 5 张：媒体没有的速度卡在这里，价格卡不展示
 * - 图像/视频 5 张：速度卡换成价格卡（媒体类型不提供速度指标）
 * - TTS 4 张：无开源卡
 * - STT 3 张：无开源卡、无性价比卡 —— 语音识别不计算性价比（产品口径），
 *   与接口 highest_value 恒为 null 一致
 */
const SUMMARY_KEYS_BY_TYPE: Record<DiscoveryType, readonly HighlightKey[]> = {
  AGENT: ['highest_score', 'highest_open_source_score', 'highest_value', 'highest_output_tps', 'highest_usage'],
  TEXT_CHAT: ['highest_score', 'highest_open_source_score', 'highest_value', 'highest_output_tps', 'highest_usage'],
  CODE_GENERATION: ['highest_score', 'highest_open_source_score', 'highest_value', 'highest_output_tps', 'highest_usage'],
  TEXT_TO_IMAGE: ['highest_score', 'highest_open_source_score', 'highest_value', 'lowest_price', 'highest_usage'],
  IMAGE_EDITING: ['highest_score', 'highest_open_source_score', 'highest_value', 'lowest_price', 'highest_usage'],
  TEXT_TO_VIDEO: ['highest_score', 'highest_open_source_score', 'highest_value', 'lowest_price', 'highest_usage'],
  IMAGE_TO_VIDEO: ['highest_score', 'highest_open_source_score', 'highest_value', 'lowest_price', 'highest_usage'],
  TTS: ['highest_score', 'highest_value', 'lowest_price', 'highest_usage'],
  STT: ['highest_score', 'lowest_price', 'highest_usage'],
}

/**
 * highlights → 总览卡。
 *
 * **值为 null 的 highlight 保留卡位、展示空态**，不是过滤掉 —— 接口文档明确要求
 * （该类型下没有符合条件的模型时前端保留卡位）。卡片总数只由 SUMMARY_KEYS_BY_TYPE
 * 决定，不随数据有无变化，否则同一个 tab 会因为当天数据缺失而少一张卡、整排跳版。
 */
export function toSummaryCards(overview: DiscoveryOverview | undefined, type: DiscoveryType): PrototypeSummaryCard[] {
  return SUMMARY_KEYS_BY_TYPE[type].map((key) => {
    const label = HIGHLIGHT_LABEL[key]
    const highlight = overview?.highlights?.[key]
    if (!highlight) return { label, model: EMPTY, value: EMPTY, unit: '', provider: '' }
    return {
      label,
      model: highlight.model.model_name,
      value: formatHighlightValue(highlight.value, key, type),
      unit: highlightUnit(key, type),
      provider: highlight.model.creator_name ?? '',
    }
  })
}

function formatHighlightValue(value: number | null, key: HighlightKey, type: DiscoveryType): string {
  if (value === null) return EMPTY
  if (key === 'highest_usage') return compactAmount(value)
  if (key === 'lowest_price') return formatPrice(value, type)
  if (key === 'highest_output_tps') return `${Math.round(value)}`
  if (key === 'highest_value') return value.toFixed(1)
  return isLanguageType(type) ? value.toFixed(1) : `${Math.round(value)}`
}

function highlightUnit(key: HighlightKey, type: DiscoveryType): string {
  if (key === 'highest_output_tps') return 'Tokens / 秒'
  if (key === 'lowest_price') return ''
  if (key === 'highest_usage') return USAGE_UNIT_LABEL[type]
  if (key === 'highest_value') return isLanguageType(type) ? 'Index / USD' : 'Elo / USD'
  return isLanguageType(type) ? 'Index' : type === 'STT' ? '%' : 'Elo'
}

/**
 * Top 5 进度条的宽度，按真实分值算。
 *
 * 原型这里写的是 `94 - index * 7%` —— 按**名次**递减，跟分值毫无关系。在分值本来
 * 就递减的 tab 上凑巧看不出来，但 STT 的前 5 名全是 0%（第三方 WER 精度太粗，
 * 真实值被压成 0），进度条却仍一根比一根短，等于用视觉编造出并不存在的差距。
 *
 * 现在的口径：条长 = 该模型相对最优值的比例。越高越好的指标取 `value / max`，
 * 越低越好的（STT 的 WER）取 `min / value`。**全部同值时返回 0（不画条）** ——
 * 没有差距就不该显示出差距。
 */
export function rankBarWidth(
  model: PrototypeModel,
  models: readonly PrototypeModel[],
  ascending = false,
): number {
  const values = models.map((item) => item.raw.score).filter((value): value is number => value !== null)
  const own = model.raw.score
  if (own === null || values.length === 0) return 0

  const max = Math.max(...values)
  const min = Math.min(...values)
  // 全部同分（STT 的一堆 0 就是这种）：没有差距可表达，不画条
  if (max === min) return 0

  const ratio = ascending ? (own === 0 ? 1 : min / own) : own / max
  return Math.max(0, Math.min(100, ratio * 100))
}

/** 用量单位的中文展示名。 */
export const USAGE_UNIT_LABEL: Record<DiscoveryType, string> = {
  AGENT: '成功任务',
  TEXT_CHAT: 'Tokens',
  CODE_GENERATION: 'Tokens',
  TEXT_TO_IMAGE: '成功任务',
  IMAGE_EDITING: '成功任务',
  TEXT_TO_VIDEO: '成功任务',
  IMAGE_TO_VIDEO: '成功任务',
  TTS: '字符',
  STT: '音频分钟',
}
