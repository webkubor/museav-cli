import { ModalityBadge } from '@/features/models/components/ModalityBadge'
import { trimPriceZeros } from '@/lib/utils'
import type { CatalogModelItem } from '@/types'

export type ChatRole = 'user' | 'assistant'

/** 消息统计条字段，逐字对齐原型 App.tsx:20493-20504 的 playground-msg-meta 结构 */
export interface ExperienceMessageMetrics {
  model: string
  inputTokens: number
  outputTokens: number
  firstTokenLatency: string
  totalLatency: string
  spend: number
  free: boolean
  /** 总耗时的原始毫秒数（totalLatency 是格式化后的展示字符串），对比页用它比较哪列最快 */
  totalMs?: number
  /** 对比模式同一轮里最快/成本最低标记（§7.10），单模型页恒为 false */
  fastest?: boolean
  cheapest?: boolean
}

/** 媒体任务结果（§7.10 媒体结果卡）：图片/音频/视频产物的展示地址 */
export interface ExperienceMediaResult {
  kind: string
  url: string
}

export interface ExperienceMessage {
  role: ChatRole
  content: string
  error?: string
  metrics?: ExperienceMessageMetrics
  modelName?: string
  modelLogo?: React.ReactNode
  /** 同步发送时同一轮的组标识，对比页用它来跨列计算最快/成本最低（§7.10/§11.1） */
  dispatchId?: string
  /** 媒体任务（文生图等）的产物，dialogue 任务恒为空 */
  media?: ExperienceMediaResult[]
}

/** 延迟格式化：<1000ms 显示整数 ms，否则显示 x.xx s（App.tsx:17044 formatPlaygroundLatency 逐字对齐） */
export function formatPlaygroundLatency(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`
}

/** 消耗文案：免费模型显示「免费额度」，否则 ≥0.01 显示 2 位小数，否则 4 位（App.tsx:17054 formatPlaygroundSpend 逐字对齐） */
export function formatPlaygroundSpend(metrics: Pick<ExperienceMessageMetrics, 'spend' | 'free'>): string {
  if (metrics.free) return '免费额度'
  return metrics.spend >= 0.01 ? `¥${metrics.spend.toFixed(2)}` : `¥${metrics.spend.toFixed(4)}`
}

/** Token 数粗估（无 tokenizer，按字符数/4 估算）——仅作 SSE 统计帧到达前的占位，
 *  真实 Token 数以后端 `modelgo.stats` 帧的 input_tokens/output_tokens 为准 */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4))
}

/** 九类体验任务枚举 → 展示文案，取自后端接口文档 §二 task 值域（字面值以文档为准） */
export type ExperienceTaskType =
  | 'text_to_text'
  | 'image_to_text'
  | 'video_to_text'
  | 'text_to_image'
  | 'image_to_image'
  | 'text_to_audio'
  | 'audio_to_text'
  | 'text_to_video'
  | 'image_to_video'

export const EXPERIENCE_TASK_LABEL: Record<ExperienceTaskType, string> = {
  text_to_text: '对话',
  image_to_text: '对话',
  video_to_text: '对话',
  text_to_image: '文生图',
  image_to_image: '图生图',
  text_to_audio: '语音合成',
  audio_to_text: '语音识别',
  text_to_video: '文生视频',
  image_to_video: '图生视频',
}

/** 一级类别，PRD 1.0.4 原文四类。单模型页/对比页/ModelPickerDialog 共用同一份分类推断逻辑。 */
export type ExperienceCategoryKey = 'dialogue' | 'image' | 'audio' | 'video'

export const EXPERIENCE_CATEGORY_TASKS: Record<ExperienceCategoryKey, ExperienceTaskType[]> = {
  dialogue: ['text_to_text', 'image_to_text', 'video_to_text'],
  image: ['text_to_image', 'image_to_image'],
  audio: ['text_to_audio', 'audio_to_text'],
  video: ['text_to_video', 'image_to_video'],
}

export const EXPERIENCE_CATEGORY_ORDER: ExperienceCategoryKey[] = ['dialogue', 'image', 'audio', 'video']

export const EXPERIENCE_CATEGORY_LABEL: Record<ExperienceCategoryKey, string> = {
  dialogue: '对话',
  image: '图像',
  audio: '音频',
  video: '视频',
}

/** 每个类别的默认任务——没有参考附件时用这个（image_to_image/image_to_video 等"需要附件"的
 *  任务由发送时是否带附件决定，不在这里判断，见 §7.5「必须携带」列表） */
export const EXPERIENCE_CATEGORY_DEFAULT_TASK: Record<ExperienceCategoryKey, ExperienceTaskType> = {
  dialogue: 'text_to_text',
  image: 'text_to_image',
  audio: 'text_to_audio',
  video: 'text_to_video',
}

function taskToCategory(task: string): ExperienceCategoryKey | undefined {
  for (const cat of EXPERIENCE_CATEGORY_ORDER) {
    if (EXPERIENCE_CATEGORY_TASKS[cat].includes(task as ExperienceTaskType)) return cat
  }
  return undefined
}

/**
 * 推断模型所属一级类别。优先取 experience_types（服务端下发的可体验任务，直接
 * 对应 PRD 任务枚举）；缺失时按输出模态兜底（老数据/字段未下发场景）。
 */
export function resolveModelCategory(model: CatalogModelItem): ExperienceCategoryKey {
  for (const task of model.experience_types ?? []) {
    const cat = taskToCategory(task)
    if (cat) return cat
  }
  const out = model.output_modalities ?? model.modalities ?? []
  if (out.includes('video')) return 'video'
  if (out.includes('audio')) return 'audio'
  if (out.includes('image') && !out.includes('text')) return 'image'
  return 'dialogue'
}

/**
 * 是否对话类（LLM）模型。体验页只支持文本对话（experience/chat/completions），
 * 故排除视频/音频生成模型。判定：不含 video/audio 模态，且含 text 模态（或无模态信息）。
 * 无模态信息默认按文本对待（避免数据缺失误伤 LLM）。
 * 含 image 模态（多模态视觉 LLM）仍保留，它们能正常走文本对话。
 */
/** 空态示例 Prompt（逐字取自原型 App.tsx:17000-17023 playgroundSamplePrompts 的 label/prompt，回复由后端真实生成，不搬运原型的 mock replies） */
export const PLAYGROUND_SAMPLE_PROMPTS: Array<{ label: string; prompt: string }> = [
  { label: '对比选型', prompt: '帮我比较三个适合企业知识库问答的模型，重点看成本、上下文长度和稳定性。' },
  { label: '概念解释', prompt: '用一段话向非技术同事解释什么是模型网关，说明它解决了什么问题。' },
  { label: '正式翻译', prompt: '把这句话翻译成英文并保持正式语气：我们下周三上午十点召开产品评审会，请准时参加。' },
]

/**
 * 价格 chip 文案：与原型 App.tsx `playgroundPriceText()` 逐字对齐——
 * 免费模型「限时免费」；否则「¥输入价 / ¥输出价 每M」，只有输出价时省去输入价那半。
 * 单模型页与对比页共用（对比页每列头部也要展示同样的价格 chip）。
 */
export function dualPriceText(model: CatalogModelItem): string {
  const currency = model.pricing?.currency === 'USD' ? '$' : '¥'
  const input = model.pricing?.input_per_1m
  const output = model.pricing?.output_per_1m
  if (!input && !output) return '限时免费'
  if (!input) return `${currency}${trimPriceZeros(output ?? '0')} 每M`
  return `${currency}${trimPriceZeros(input)} / ${currency}${trimPriceZeros(output ?? input)} 每M`
}

export function isChatModel(model: CatalogModelItem): boolean {
  const modalities = model.modalities ?? []
  if (modalities.length === 0) return true
  if (modalities.includes('video') || modalities.includes('audio')) return false
  return modalities.includes('text')
}

export function modalityBadges(model: CatalogModelItem) {
  return model.modalities.slice(0, 3).map((modality) => <ModalityBadge key={modality} modality={modality} />)
}

export function quotaPercent(model: CatalogModelItem) {
  if (model.status === 'disabled') return 0
  if (model.zero_data_retention) return 100
  return model.providers_count ? Math.min(100, 64 + model.providers_count * 7) : 86
}
