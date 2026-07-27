import { ModalityBadge } from '@/features/models/components/ModalityBadge'
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
}

export interface ExperienceMessage {
  role: ChatRole
  content: string
  error?: string
  metrics?: ExperienceMessageMetrics
  modelName?: string
  modelLogo?: React.ReactNode
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

/** Token 数粗估（无 tokenizer，按字符数/4 估算），仅用于本地显示，真实数字待接会话 API 后端 usage 字段 */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4))
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
