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
  DiscoveryIntegrationStatus,
  DiscoveryRankingItem,
  DiscoveryType,
  DiscoveryUnitPrices,
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
  // 0 是"免费"，不是"$0.0000"。后者读起来像精度丢失，柱图上还会标出一串没有信息量的零
  // （单次任务成本榜首位实测就是 $0.0000，2026-09-03）。
  if (value === 0) return '免费'
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
  /**
   * 厂商国别归属（接口 `integration_status`）：`MODELGO` 国产 / `MODELGO_AI` 境外。
   * **它不表示是否接入** —— 接入态是 `supported`（接口 `is_integrated`）。
   */
  integrationStatus?: DiscoveryIntegrationStatus
  /** 单价构成，用于成本列的 tooltip。只有语言类有，且各档位可能缺项。 */
  unitPrices?: DiscoveryUnitPrices | null
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
  // 「已接入」只认 is_integrated（目录里有 + 上架 + 未删除）。
  // 此前用的 integration_status === 'MODELGO' 是**厂商国别**，把从未上架的国产模型
  // 全标成了已接入 —— 2026-09-07 实测九个类型合计 217 个假「已接入」里 161 个连
  // modelgo_id 都没有，页面上「已接入」徽标配着禁用的「待支持」按钮（qa#718）。
  const supported = item.is_integrated === true
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
    integrationStatus: item.integration_status,
    unitPrices: item.unit_prices ?? null,
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
 *
 * **用量榜还要排除 0**：「近 7 日热度 Top 10」是"最热的十个"，把零调用的模型排进去，
 * 画出来是一排高度为 0、看不见的柱子加一排悬空的图标——test 环境实测 10 个里 5 个是 0
 * （2026-09-03）。榜单宁可短，不能用零值凑数。
 * 只对用量字段这么做：成本类指标的 0 是"免费"，是有效信息，不能一起排除。
 */
export function specialtyRows(
  title: string,
  models: readonly PrototypeModel[],
  options: { limit?: number; scoreAscending?: boolean } = {},
): Array<{ model: string; value: string; provider: string; short: string; numeric: number }> {
  const { limit = 10, scoreAscending = false } = options
  const spec = specialtyFieldFor(title, scoreAscending)
  if (!spec) return []
  const picked = models
    .filter((model) => model.raw[spec.field] !== null)
    // 用量为 0 = 该周期没被调用过，不进"最热"榜（见上方说明）
    .filter((model) => spec.field !== 'usage' || (model.raw[spec.field] as number) > 0)
    .sort((first, second) => {
      const a = first.raw[spec.field]!
      const b = second.raw[spec.field]!
      return spec.ascending ? a - b : b - a
    })
    .slice(0, limit)

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
      // 图表用的原始数值。手写图表只需要格式化字符串，交给 Recharts 后要的是数值本身，
      // 柱高由它按 Y 轴 domain 算（min-max 归一化的口径搬到了 discovery-charts 的
      // specialtyBarDomain），这里不再逐行算 ratio。
      numeric: raw,
    }
  })
}

/**
 * 柱高的值域。
 *
 * **min-max 归一化**，不是 value/max：真实数据的值域常常很窄（综合评分
 * 61.3→57.1 只差 7%），按 value/max 算出来十根柱子肉眼等高，图表等于没有信息量。
 * 归一化后同一张图内的排序差异能看出来；每根柱子上都标着真实数值，不会误读绝对量。
 *
 * 原先这是数据层逐行算好的 `ratio` 字段 + CSS `--bar-height`。交给 Recharts 后
 * 只需给 Y 轴一个下界：柱高 = (v - lo) / (max - lo)，令最小值落在 FLOOR 处
 * 即得 lo = (min - FLOOR × max) / (1 - FLOOR)。
 *
 * **下界不允许为负**：值域本来就宽的指标（使用量 2.4M vs 50K）算出来的 lo 是负数，
 * 而 Recharts 的柱底恒取「domain 里离 0 最近的点」，负下界会被它拉回 0，
 * 算出来的柱高对不上。夹到 0 之后两种情形各自成立：值域窄 → 抬下界拉开差距；
 * 值域宽 → 真实零基线（本来也不需要拉开）。最矮的柱由 Bar 的 minPointSize 保底可见。
 */
const BAR_FLOOR = 0.28
export function specialtyBarDomain(values: readonly number[]): [number, number] {
  const finite = values.filter(Number.isFinite)
  if (finite.length === 0) return [0, 1]
  const max = Math.max(...finite)
  const min = Math.min(...finite)
  // 全部同值：没有差距可表达，给满格（与原先 ratio 恒为 1 一致）
  if (max === min) return [0, max > 0 ? max : 1]
  return [Math.max(0, (min - BAR_FLOOR * max) / (1 - BAR_FLOOR)), max]
}

/**
 * 柱内标签：原样展示，**保留货币符号与单位**（原型实测是 `$0.05` / `245 tok/s`）。
 *
 * 此前这里用 `/[\d.,]+[BMKT]?/` 只取数字，理由写的是「单位已经写在图表副标题里」——
 * 但那只对部分卡成立：`单次任务成本` 副标题有「（USD/Task）」、`输出 TPS` 有「（Tokens/秒）」，
 * 而 `近 7 日热度` 的说明是「ModelGo 调用 Tokens」根本没有量纲。结果柱上只剩 `0.0116`
 * 这种读不出单位的裸数字（2026-09-03 需求方指出）。
 */
function compactBarLabel(value: string): string {
  return value
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

/**
 * 总览卡文案与单位。
 *
 * ⚠️ **按 type 分歧，不能用单常量** —— 原型每个 task 的 summary 是各自写死的一组
 * `{ label, unit }`，不是从统一模板推出来的。此前这里用一个 Record<HighlightKey, string>
 * 供全部 9 种 type，后果是：
 *   · STT 首卡写成「综合评分最高」，而它的指标是 AA-WER（**越低越好**）——
 *     卡片语义与指标方向相反，是给用户看错信息（2026-09-03 需求方指出）
 *   · 图像/视频的「Elo 评分最高」「开源模型 Elo 最高」被抹成「综合评分最高/开源模型评分最高」
 *   · TTS 的「语音质量最高」被抹成「综合评分最高」
 *   · 「输出 TPS 最高」被改写成「输出速度最快」
 *
 * 下面的值逐条照抄原型 `ModelDiscoveryPage.tsx` 各 task 的 summary 数组
 * （STT 在 445 行、TTS 在 420 行、图像 320 行、视频 356 行、语言类 282 行）。
 * 改这里之前先去那边核对，别按语感改。
 */
const MEDIA_ELO_TYPES: ReadonlySet<DiscoveryType> = new Set([
  'TEXT_TO_IMAGE', 'IMAGE_EDITING', 'TEXT_TO_VIDEO', 'IMAGE_TO_VIDEO',
])

function highlightLabel(key: HighlightKey, type: DiscoveryType): string {
  switch (key) {
    case 'highest_score':
      if (isLanguageType(type)) return '综合评分最高'
      if (type === 'TTS') return '语音质量最高'
      // AA-WER 越低越好，所以是「最低」；写成「最高」会把指标方向说反
      if (type === 'STT') return '识别错误率最低'
      return 'Elo 评分最高'
    case 'highest_open_source_score':
      return MEDIA_ELO_TYPES.has(type) ? '开源模型 Elo 最高' : '开源模型评分最高'
    case 'highest_value':
      return '性价比最高'
    case 'lowest_price':
      return 'API 价格最低'
    case 'highest_output_tps':
      return '输出 TPS 最高'
    case 'highest_usage':
      return '近 7 日 ModelGo 使用量最高'
  }
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
    const label = highlightLabel(key, type)
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

/**
 * 性价比与 API 价格的单位带「计价载体」，不能统一成 USD。
 * 图像是每 1K 张、视频是每分钟、TTS 是每 1M 字符、STT 是每 1K 分钟 ——
 * 抹成 `Elo / USD` 会让图像与视频的性价比看起来是同一个口径（2026-09-03 需求方指出）。
 * 值同样照抄原型各 task 的 summary。
 */
const VALUE_UNIT: Partial<Record<DiscoveryType, string>> = {
  TEXT_TO_IMAGE: 'Elo / ($/1K 张)',
  IMAGE_EDITING: 'Elo / ($/1K 张)',
  TEXT_TO_VIDEO: 'Elo / ($/min)',
  IMAGE_TO_VIDEO: 'Elo / ($/min)',
  TTS: 'Elo / USD',
}

const PRICE_UNIT: Partial<Record<DiscoveryType, string>> = {
  TEXT_TO_IMAGE: '$/1K 张',
  IMAGE_EDITING: '$/1K 张',
  TEXT_TO_VIDEO: '$/min',
  IMAGE_TO_VIDEO: '$/min',
  TTS: '/ 1M 字符',
  STT: '/ 1K 分钟',
}

function highlightUnit(key: HighlightKey, type: DiscoveryType): string {
  if (key === 'highest_output_tps') return 'Tokens / 秒'
  if (key === 'lowest_price') return PRICE_UNIT[type] ?? ''
  if (key === 'highest_usage') return USAGE_UNIT_LABEL[type]
  if (key === 'highest_value') return VALUE_UNIT[type] ?? 'Index / USD'
  // STT 的质量指标是 AA-WER，单看「%」不知道是什么率，原型把指标名带在单位里
  if (type === 'STT') return '% AA-WER'
  return isLanguageType(type) ? 'Index' : 'Elo'
}

/**
 * Top 5 进度条的宽度，按真实分值算。
 *
 * 原型这里写的是 `94 - index * 7%` —— 按**名次**递减，跟分值毫无关系。在分值本来
 * 就递减的 tab 上凑巧看不出来，但 STT 的前 5 名全是 0%（第三方 WER 精度太粗，
 * 真实值被压成 0），进度条却仍一根比一根短，等于用视觉编造出并不存在的差距。
 *
 * 现在的口径：**与下方柱图同一把尺**——带地板的 min-max 归一化（见 specialtyBarDomain）。
 *
 * 曾经用的是 `value / max`，与柱图的 min-max 是两套算法：Agent Top 5 实测
 * 61.3 / 59.8 / 59.2 / 59.1 / 58.7，按 value/max 算出来条长 214 / 209 / 206 / 206 / 205px，
 * 首尾只差 9px，肉眼完全等长；而同一批数据在下面的柱图里落差清晰可见。同一页对同一组
 * 数据给出两种视觉结论，比单纯"看不出差距"更糟（2026-09-03 实测）。
 *
 * 地板取 BAR_FLOOR，与柱图一致：最短的那条仍保留 28% 长度，不至于缩成一个点。
 * **全部同值时返回 0（不画条）**——没有差距就不该显示出差距。
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

  // 归一化到 [0, 1]：越高越好取 (v - min)/(max - min)，越低越好（STT 的 WER）反向
  const normalized = ascending ? (max - own) / (max - min) : (own - min) / (max - min)
  const ratio = BAR_FLOOR + (1 - BAR_FLOOR) * normalized
  // 收敛到两位小数：这个值直接进 inline style，浮点尾巴会写出
  // `width: 28.000000000000004%` 这种脏值
  return Math.round(Math.max(0, Math.min(100, ratio * 100)) * 100) / 100
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

/**
 * 计费单价（价目表），给成本列的 tooltip 用（接口文档第三节（二））。
 *
 * ⚠️ **它不是「单次任务成本的构成拆解」** —— 接口文档明确两者不要混用：
 * 单价之和没有任何意义，也不等于 `cost_value`。所以 tooltip 标题必须是「计费单价」，
 * 写成「成本构成」会让人以为四档加起来就是那笔任务成本。真正的成本拆解要等付费档接入。
 *
 * 只有语言类（AGENT / TEXT_CHAT / CODE_GENERATION）下发，媒体与语音类整个字段没有。
 *
 * **逐项判空必须用「字段是否存在」，不能用 `!price`** —— `0` 是合法单价（部分模型缓存
 * 命中免费，文档实测有 6 个模型如此），当成缺失会把「免费」显示成「没有这档」。
 * 四档全空时接口整个对象都不下发（文档称 TEXT_CHAT 约 18% 属这种）。
 *
 * 返回 undefined 表示没有可展示的单价，调用方不挂 tooltip。
 */
export function unitPriceDetail(prices: DiscoveryUnitPrices | null | undefined): string | undefined {
  if (!prices) return undefined
  // 目前实测 unit 只有 USD_PER_1M_TOKENS 一种；出现别的取值时原样显示单位，不猜换算
  const suffix = prices.unit === 'USD_PER_1M_TOKENS' ? '/M tokens' : ` ${prices.unit}`
  const rows: Array<[string, number | null | undefined]> = [
    ['输入', prices.input_tokens],
    ['输出', prices.output_tokens],
    ['缓存命中', prices.cache_hit_tokens],
    ['缓存写入', prices.cache_write_tokens],
  ]
  const parts = rows
    .filter((row): row is [string, number] => typeof row[1] === 'number')
    .map(([label, value]) => `${label} $${value}${suffix}`)
  return parts.length ? parts.join('\n') : undefined
}
