import { ModalityBadge } from '@/features/models/components/ModalityBadge'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import type { CatalogModelItem } from '@/types'

export type CategoryKey = 'all' | 'text' | 'image' | 'video' | 'code' | 'reasoning' | 'multimodal'
export type ChatRole = 'user' | 'assistant'

export interface ExperienceMessage {
  role: ChatRole
  content: string
  meta?: string
}

export const previewImages: Record<CategoryKey, string> = {
  all: '/modelgo/model-experience-all.png',
  text: '/modelgo/model-experience-text.png',
  image: '/modelgo/model-experience-image.png',
  video: '/modelgo/model-experience-video.png',
  code: '/modelgo/model-experience-code.png',
  reasoning: '/modelgo/model-experience-reasoning.png',
  multimodal: '/modelgo/model-experience-multimodal.png',
}

export const modelExperienceCopy = {
  zh: {
    warning: '您的余额不足，目标模型的免费试用额度消耗完后将无法继续体验，请及时充值。',
    recharge: '去充值',
    title: '模型体验',
    desc: '选择模型，立即测试输出效果、成本与接口参数',
    compare: '模型对比',
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
    categories: { all: '全部', text: '文本', image: '图像', video: '视频', code: '代码', reasoning: '推理', multimodal: '多模态' },
  },
  en: {
    warning: 'Your balance is low. Once the free trial quota is used, this model experience may stop.',
    recharge: 'Recharge',
    title: 'Model Experience',
    desc: 'Select a model and test output quality, cost, and API parameters.',
    compare: 'Compare Models',
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
    categories: { all: 'All', text: 'Text', image: 'Image', video: 'Video', code: 'Code', reasoning: 'Reasoning', multimodal: 'Multimodal' },
  },
} as const

export const categories: CategoryKey[] = ['all', 'text', 'image', 'video', 'code', 'reasoning', 'multimodal']

export const initialMessages: ExperienceMessage[] = [
  { role: 'user', content: '帮我比较三个适合企业知识库问答的模型，重点看成本、上下文长度和稳定性。' },
  {
    role: 'assistant',
    content:
      '建议优先看三类组合：\n\n1. 长上下文主力模型：适合企业知识库检索增强后的复杂问答。\n2. 高性价比轻量模型：适合 FAQ、摘要、分类等高频低成本任务。\n3. 推理模型：适合复杂决策、代码分析和多步骤规划。\n\n如果你的流量主要来自客服和运营场景，可以先用轻量模型承接 70% 请求，再把复杂问题路由到推理模型。',
    meta: '延迟 824ms · 预估 ¥0.0021',
  },
]

export function matchesCategory(model: CatalogModelItem, category: CategoryKey) {
  if (category === 'all') return true
  if (category === 'multimodal') return model.modalities.length > 1
  if (category === 'code') return model.tags.some((tag) => tag.toLowerCase().includes('code'))
  if (category === 'reasoning') return model.tags.some((tag) => /reason|think|推理/i.test(tag))
  return model.modalities.includes(category)
}

export function vendorNode(model: CatalogModelItem, size: 'sm' | 'lg' = 'sm') {
  return (
    <ModelIcon
      model={model}
      size={size === 'lg' ? 44 : 32}
      rounded={size === 'lg' ? 'rounded-xl' : 'rounded-lg'}
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
