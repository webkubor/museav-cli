/**
 * 模型发现（v1.0.6）的业务类型与指标口径
 *
 * 真源是后端：type 与 metric 的非法组合返回 4001。这里的映射用来在 UI 上收敛可选项，
 * 让用户根本选不出非法组合，而不是选完再吃报错。
 */
import type { DiscoveryMetric, DiscoveryType, DiscoveryUsageUnit } from '@/types'

/** 每种业务类型的主质量指标。 */
export const DISCOVERY_PRIMARY_METRIC: Record<DiscoveryType, DiscoveryMetric> = {
  AGENT: 'AGENTIC_INDEX',
  TEXT_CHAT: 'INTELLIGENCE_INDEX',
  CODE_GENERATION: 'CODING_INDEX',
  TEXT_TO_IMAGE: 'ELO',
  IMAGE_EDITING: 'ELO',
  TEXT_TO_VIDEO: 'ELO',
  IMAGE_TO_VIDEO: 'ELO',
  TTS: 'VOICE_ELO',
  STT: 'AA_WER',
}

/**
 * 每种业务类型可用的排序指标。
 *
 * 语言三类（Agent / 文本 / 代码）共用一套六指标；六个媒体类型只有主指标 + 价格 +
 * 用量 + 性价比；**STT 没有 VALUE_SCORE —— 语音识别不计算性价比，是产品口径，
 * 不是数据缺失。**
 */
export const DISCOVERY_METRICS_BY_TYPE: Record<DiscoveryType, readonly DiscoveryMetric[]> = {
  AGENT: ['AGENTIC_INDEX', 'COST_PER_TASK', 'OUTPUT_TPS', 'END_TO_END_LATENCY', 'USAGE', 'VALUE_SCORE'],
  TEXT_CHAT: ['INTELLIGENCE_INDEX', 'COST_PER_TASK', 'OUTPUT_TPS', 'END_TO_END_LATENCY', 'USAGE', 'VALUE_SCORE'],
  CODE_GENERATION: ['CODING_INDEX', 'COST_PER_TASK', 'OUTPUT_TPS', 'END_TO_END_LATENCY', 'USAGE', 'VALUE_SCORE'],
  TEXT_TO_IMAGE: ['ELO', 'API_PRICE', 'USAGE', 'VALUE_SCORE'],
  IMAGE_EDITING: ['ELO', 'API_PRICE', 'USAGE', 'VALUE_SCORE'],
  TEXT_TO_VIDEO: ['ELO', 'API_PRICE', 'USAGE', 'VALUE_SCORE'],
  IMAGE_TO_VIDEO: ['ELO', 'API_PRICE', 'USAGE', 'VALUE_SCORE'],
  TTS: ['VOICE_ELO', 'API_PRICE', 'USAGE', 'VALUE_SCORE'],
  STT: ['AA_WER', 'API_PRICE', 'USAGE'],
}

/** 每种业务类型的用量单位。 */
export const DISCOVERY_USAGE_UNIT: Record<DiscoveryType, DiscoveryUsageUnit> = {
  AGENT: 'TASKS',
  TEXT_CHAT: 'TOKENS',
  CODE_GENERATION: 'TOKENS',
  TEXT_TO_IMAGE: 'TASKS',
  IMAGE_EDITING: 'TASKS',
  TEXT_TO_VIDEO: 'TASKS',
  IMAGE_TO_VIDEO: 'TASKS',
  TTS: 'CHARACTERS',
  STT: 'AUDIO_MINUTES',
}

/**
 * 越低越好的指标。排名接口的响应已带 `direction` 字段，**榜单排序直接用它**；
 * 这份常量只给拿不到响应的场景用（如筛选项文案上的箭头提示）。
 */
export const DISCOVERY_ASC_METRICS: readonly DiscoveryMetric[] = [
  'AA_WER',
  'API_PRICE',
  'COST_PER_TASK',
  'END_TO_END_LATENCY',
]

/** 该业务类型是否支持某个排序指标（发请求前的护栏，避免 4001）。 */
export function isMetricAllowed(type: DiscoveryType, metric: DiscoveryMetric) {
  return DISCOVERY_METRICS_BY_TYPE[type].includes(metric)
}

/**
 * ⚠️ 不要按业务类型硬编码「哪类没有价格/速度数据」。
 *
 * 接口文档第四节给了一张字段覆盖表（媒体类型价格全为 0、语言类型只有 150 个模型
 * 有价格），照它写死会出错：那是 2026-08-31 快照的**当时状态**，2026-09-02 实测
 * 六个媒体类型的 API_PRICE 榜单已全部有值（图 155 / 图编 71 / 文生视频 80 /
 * 图生视频 74 / TTS 98 / STT 65），语言类型的 COST_PER_TASK 也从 150 涨到 631 条且无空值。
 *
 * 覆盖度是**数据状态**不是**产品口径**，会随第三方档位变化。判断某个榜单要不要展示，
 * 一律看该次请求返回的 `total` 与 `items` 是否为空，不看类型。
 *
 * 真正属于产品口径、可以写死的只有一条：STT 不计算性价比（见 DISCOVERY_METRICS_BY_TYPE）。
 */
