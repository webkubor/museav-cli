import { ModalityBadge } from '@/features/models/components/ModalityBadge'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import type { CatalogModelItem } from '@/types'

export type CategoryKey = 'all' | 'standard' | 'high' | 'ultra'
export type ChatRole = 'user' | 'assistant'

export interface ExperienceMessage {
  role: ChatRole
  content: string
  meta?: string
  modelName?: string
  modelLogo?: React.ReactNode
}

export const previewImages: Record<CategoryKey, string> = {
  all: '/modelgo/model-experience-all.webp',
  standard: '/modelgo/model-experience-text.webp',
  high: '/modelgo/model-experience-code.webp',
  ultra: '/modelgo/model-experience-reasoning.webp',
}

export const modelExperienceCopy = {
  zh: {
    warning: '您的余额不足，目标模型的免费试用额度消耗完后将无法继续体验，请及时充值。',
    recharge: '去充值',
    title: '模型体验',
    desc: '选择模型，立即测试输出效果、成本与接口参数',
    compare: '模型对比',
    freeQuota: '免费剩余额度',
    freeQuotaHint: '即赠送余额，体验计费优先从中扣减，超出部分按主余额计费',
    search: '搜索模型、厂商、能力...',
    featured: '精选模型',
    allModels: '全部模型',
    current: '当前体验模型',
    apiId: 'API ID',
    context: '上下文',
    quota: '免费额度',
    input: '输入 Prompt，Enter 发送，Shift+Enter 换行...',
    send: '发送',
    clear: '清空',
    params: '参数',
    note: '本次体验会消耗免费额度，超出后将按实际用量计费。',
    empty: '没有匹配的模型',
    loading: '正在加载模型...',
    error: '模型列表加载失败，请稍后重试',
    copied: '模型 ID 已复制',
    categories: { all: '全部', standard: '上下文 ≤32K', high: '上下文 ≤128K', ultra: '上下文 128K+' },
  },
  en: {
    warning: 'Your balance is low. Once the free trial quota is used, this model experience may stop.',
    recharge: 'Recharge',
    title: 'Model Experience',
    desc: 'Select a model and test output quality, cost, and API parameters.',
    compare: 'Compare Models',
    freeQuota: 'Free Quota Left',
    freeQuotaHint: 'Your gift balance; experience usage draws from it first, then your main balance',
    search: 'Search models, providers, capabilities...',
    featured: 'Featured',
    allModels: 'All models',
    current: 'Active model',
    apiId: 'API ID',
    context: 'Context',
    quota: 'Free quota',
    input: 'Enter a prompt. Enter to send, Shift+Enter for new line...',
    send: 'Send',
    clear: 'Clear',
    params: 'Parameters',
    note: 'This experience consumes free quota. Overage is billed based on usage.',
    empty: 'No matching models',
    loading: 'Loading models...',
    error: 'Failed to load models. Please try again later.',
    copied: 'Model ID copied',
    categories: { all: 'All', standard: 'Context ≤32K', high: 'Context ≤128K', ultra: 'Context 128K+' },
  },
} as const

export const categories: CategoryKey[] = ['all', 'standard', 'high', 'ultra']

export const initialMessages: ExperienceMessage[] = [
  { role: 'user', content: '帮我比较三个适合企业知识库问答的模型，重点看成本、上下文长度和稳定性。' },
  {
    role: 'assistant',
    content:
      '建议优先看三类组合：\n\n1. 长上下文主力模型：适合企业知识库检索增强后的复杂问答。\n2. 高性价比轻量模型：适合 FAQ、摘要、分类等高频低成本任务。\n3. 推理模型：适合复杂决策、代码分析和多步骤规划。\n\n如果你的流量主要来自客服和运营场景，可以先用轻量模型承接 70% 请求，再把复杂问题路由到推理模型。',
    meta: '延迟 824ms · 预估 ¥0.0021',
  },
]

const CTX_TIERS = { standard: 32_768, high: 131_072 } as const

export function matchesCategory(model: CatalogModelItem, category: CategoryKey) {
  if (category === 'all') return true
  const ctx = model.context_length ?? 0
  if (category === 'standard') return ctx <= CTX_TIERS.standard
  if (category === 'high') return ctx > CTX_TIERS.standard && ctx <= CTX_TIERS.high
  if (category === 'ultra') return ctx > CTX_TIERS.high
  return true
}

/**
 * 是否对话类（LLM）模型。体验页只支持文本对话（experience/chat/completions），
 * 故排除视频/音频生成模型。判定：不含 video/audio 模态，且含 text 模态（或无模态信息）。
 * 无模态信息默认按文本对待（避免数据缺失误伤 LLM）。
 * 含 image 模态（多模态视觉 LLM）仍保留，它们能正常走文本对话。
 */
export function isChatModel(model: CatalogModelItem): boolean {
  const modalities = model.modalities ?? []
  if (modalities.length === 0) return true
  if (modalities.includes('video') || modalities.includes('audio')) return false
  return modalities.includes('text')
}

export function vendorNode(model: CatalogModelItem, size: 'sm' | 'lg' = 'sm') {
  return (
    <ModelIcon
      model={model}
      size={size === 'lg' ? 44 : 32}
      rounded={size === 'lg' ? 'rounded-md' : 'rounded-lg'}
      className="bg-mg-bg-0"
    />
  )
}

export function modalityBadges(model: CatalogModelItem) {
  return model.modalities.slice(0, 3).map((modality) => <ModalityBadge key={modality} modality={modality} />)
}

export function quotaPercent(model: CatalogModelItem) {
  if (model.status === 'disabled') return 0
  if (model.zero_data_retention) return 100
  return model.providers_count ? Math.min(100, 64 + model.providers_count * 7) : 86
}
