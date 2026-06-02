import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LuTriangleAlert,
  LuCircleCheck,
  LuCopy,
  LuEraser,
  LuGitCompareArrows,
  LuMessageSquare,
  LuRefreshCw,
  LuSearch,
  LuSend,
  LuSettings2,
  LuSlidersHorizontal,
  LuSparkles,
  LuWallet,
  LuZap,
} from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { ModalityBadge } from '@/features/models/components/ModalityBadge'
import { VENDOR_ICON } from '@/features/models/components/vendor-icons'
import { useModels } from '@/features/models/hooks/useModels'
import { appToast } from '@/lib/app-toast'
import { cn, formatContextLength, formatModelPrice, getFallbackAvatarText } from '@/lib/utils'
import type { CatalogModelItem } from '@/types'

type CategoryKey = 'all' | 'text' | 'image' | 'video' | 'code' | 'reasoning' | 'multimodal'
type ChatRole = 'user' | 'assistant'

interface ExperienceMessage {
  role: ChatRole
  content: string
  meta?: string
}

const previewImage = '/modelgo/model-experience-card.png'

const copy = {
  zh: {
    warning: '您的余额不足，目标模型的免费试用额度消耗完后将无法继续体验，请及时充值。',
    recharge: '去充值',
    title: '模型体验',
    desc: '选择模型，立即测试输出效果、成本与接口参数',
    tokenPlan: '获取 Token Plan',
    compare: '模型对比',
    search: '搜索模型、厂商、能力...',
    featured: '精选模型',
    allModels: '全部模型',
    current: '当前体验模型',
    apiId: 'API ID',
    context: '上下文',
    price: '价格',
    quota: '免费额度',
    input: '输入 Prompt，Enter 发送，Shift+Enter 换行...',
    send: '发送',
    clear: '清空',
    params: '参数',
    note: '本次体验会消耗免费额度，超出后按 Token Plan 计费。',
    empty: '没有匹配的模型',
    loading: '正在加载模型...',
    error: '模型列表加载失败，请稍后重试',
    copied: '模型 ID 已复制',
    testNow: '立即体验',
    categories: {
      all: '全部',
      text: '文本',
      image: '图像',
      video: '视频',
      code: '代码',
      reasoning: '推理',
      multimodal: '多模态',
    },
  },
  en: {
    warning: 'Your balance is low. Once the free trial quota is used, this model experience may stop.',
    recharge: 'Recharge',
    title: 'Model Experience',
    desc: 'Select a model and test output quality, cost, and API parameters.',
    tokenPlan: 'Get Token Plan',
    compare: 'Compare Models',
    search: 'Search models, providers, capabilities...',
    featured: 'Featured',
    allModels: 'All models',
    current: 'Active model',
    apiId: 'API ID',
    context: 'Context',
    price: 'Price',
    quota: 'Free quota',
    input: 'Enter a prompt. Enter to send, Shift+Enter for new line...',
    send: 'Send',
    clear: 'Clear',
    params: 'Parameters',
    note: 'This experience consumes free quota. Overage is billed by Token Plan.',
    empty: 'No matching models',
    loading: 'Loading models...',
    error: 'Failed to load models. Please try again later.',
    copied: 'Model ID copied',
    testNow: 'Try now',
    categories: {
      all: 'All',
      text: 'Text',
      image: 'Image',
      video: 'Video',
      code: 'Code',
      reasoning: 'Reasoning',
      multimodal: 'Multimodal',
    },
  },
} as const

const categories: CategoryKey[] = ['all', 'text', 'image', 'video', 'code', 'reasoning', 'multimodal']

const initialMessages: ExperienceMessage[] = [
  {
    role: 'user',
    content: '帮我比较三个适合企业知识库问答的模型，重点看成本、上下文长度和稳定性。',
  },
  {
    role: 'assistant',
    content:
      '建议优先看三类组合：\n\n1. 长上下文主力模型：适合企业知识库检索增强后的复杂问答。\n2. 高性价比轻量模型：适合 FAQ、摘要、分类等高频低成本任务。\n3. 推理模型：适合复杂决策、代码分析和多步骤规划。\n\n如果你的流量主要来自客服和运营场景，可以先用轻量模型承接 70% 请求，再把复杂问题路由到推理模型。',
    meta: '延迟 824ms · 预估 ¥0.0021',
  },
]

function matchesCategory(model: CatalogModelItem, category: CategoryKey) {
  if (category === 'all') return true
  if (category === 'multimodal') return model.modalities.length > 1
  if (category === 'code') return model.tags.some((tag) => tag.toLowerCase().includes('code'))
  if (category === 'reasoning') return model.tags.some((tag) => /reason|think|推理/i.test(tag))
  return model.modalities.includes(category)
}

function vendorNode(model: CatalogModelItem, size: 'sm' | 'lg' = 'sm') {
  const icon = VENDOR_ICON[model.vendor?.toLowerCase() ?? '']
  const box = size === 'lg' ? 'h-11 w-11 rounded-xl' : 'h-8 w-8 rounded-lg'
  if (model.logo_url) return <img src={model.logo_url} alt={model.vendor ?? model.display_name} className={cn(box, 'object-contain bg-mg-bg-0')} />
  return icon ?? (
    <span className={cn(box, 'inline-flex items-center justify-center bg-mg-fill-0 text-mg-text-2 font-bold')}>
      {getFallbackAvatarText(model.vendor ?? model.display_name)}
    </span>
  )
}

function quotaPercent(model: CatalogModelItem) {
  if (model.status === 'disabled') return 0
  if (model.zero_data_retention) return 100
  return model.providers_count ? Math.min(100, 64 + model.providers_count * 7) : 86
}

export default function ModelsPage() {
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const text = i18n.language.startsWith('zh') ? copy.zh : copy.en
  const [category, setCategory] = useState<CategoryKey>('all')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ExperienceMessage[]>(initialMessages)
  const {
    search,
    setSearch,
    selectedId,
    setSelectedId,
    modelsQuery,
    detailQuery,
    providersQuery,
    filteredModels,
  } = useModels()

  const visibleModels = useMemo(
    () => filteredModels.filter((model) => matchesCategory(model, category)),
    [category, filteredModels],
  )
  const allModels = modelsQuery.data?.items ?? []
  const selectedModel = allModels.find((model) => model.id === selectedId) ?? visibleModels[0] ?? allModels[0]
  const provider = providersQuery.data?.items?.[0]
  const detail = detailQuery.data
  const progress = selectedModel ? quotaPercent(selectedModel) : 0

  useEffect(() => {
    if (!selectedId && allModels[0]) setSelectedId(allModels[0].id)
  }, [allModels, selectedId, setSelectedId])

  function selectModel(model: CatalogModelItem, focusComposer = false) {
    setSelectedId(model.id)
    if (focusComposer) window.setTimeout(() => inputRef.current?.focus(), 80)
  }

  function sendPrompt() {
    const prompt = input.trim()
    if (!prompt || !selectedModel) return
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: prompt },
      {
        role: 'assistant',
        content: `已切换到 ${selectedModel.display_name} 进行体验。当前 UI 会保留输入、模型参数和成本提示；正式联调时这里接入模型体验接口返回。`,
        meta: `模型 ${selectedModel.model_id} · 预估 ${formatModelPrice(selectedModel.pricing?.input_per_1m, selectedModel.pricing?.currency)}`,
      },
    ])
    setInput('')
  }

  async function copyModelId() {
    if (!selectedModel) return
    await navigator.clipboard.writeText(selectedModel.model_id)
    appToast.success(text.copied)
  }

  return (
    <div className="models-experience-page">
      <div className="models-experience-warning">
        <LuTriangleAlert size={15} />
        <span>{text.warning}</span>
        <button type="button" onClick={() => navigate('/billing')}>{text.recharge}</button>
      </div>

      <div className="models-experience-header">
        <div>
          <h1>{text.title}</h1>
          <p>{text.desc}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" className="rounded-full h-9 px-4 text-xs font-bold" onClick={() => navigate('/billing')}>
            <LuWallet size={14} />
            {text.tokenPlan}
          </Button>
          <Button variant="outline" className="rounded-full h-9 px-4 text-xs font-bold" onClick={() => navigate('/models/compare')}>
            <LuGitCompareArrows size={14} />
            {text.compare}
          </Button>
        </div>
      </div>

      <div className="models-experience-workbench">
        <section className="models-experience-picker">
          <Input
            prefix={<LuSearch size={15} />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={text.search}
            className="models-experience-search"
          />

          <div className="models-experience-categories">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={cn(category === item && 'is-active')}
              >
                {text.categories[item]}
              </button>
            ))}
          </div>

          <div className="models-experience-section-title">
            <span>{text.featured}</span>
            <LuSparkles size={14} />
          </div>

          {selectedModel && (
            <button type="button" className="models-experience-featured" onClick={() => selectModel(selectedModel, true)}>
              <img src={previewImage} alt="" />
              <div className="models-experience-featured-shade" />
              <div className="models-experience-featured-content">
                <div className="flex items-center gap-2">
                  {vendorNode(selectedModel)}
                  <span>{selectedModel.vendor || provider?.provider_name || 'ModelGo'}</span>
                </div>
                <h2>{selectedModel.display_name}</h2>
                <div className="flex gap-1.5 flex-wrap">
                  {selectedModel.modalities.slice(0, 3).map((modality) => <ModalityBadge key={modality} modality={modality} />)}
                </div>
                <div className="models-experience-featured-metrics">
                  <span>{formatContextLength(selectedModel.context_length)} {text.context}</span>
                  <span>{formatModelPrice(selectedModel.pricing?.input_per_1m, selectedModel.pricing?.currency)}</span>
                  <span>{text.quota} {progress}%</span>
                </div>
              </div>
            </button>
          )}

          <div className="models-experience-section-title">
            <span>{text.allModels}</span>
            <span className="models-experience-count">{visibleModels.length}</span>
          </div>

          <div className="models-experience-list">
            {modelsQuery.isLoading ? (
              <div className="models-experience-state">{text.loading}</div>
            ) : modelsQuery.isError ? (
              <div className="models-experience-state is-error">{text.error}</div>
            ) : visibleModels.length === 0 ? (
              <div className="models-experience-state">{text.empty}</div>
            ) : (
              visibleModels.map((model) => (
                <button
                  type="button"
                  key={model.id}
                  className={cn('models-experience-row', selectedModel?.id === model.id && 'is-active')}
                  onClick={() => selectModel(model)}
                >
                  {vendorNode(model)}
                  <span className="min-w-0 flex-1">
                    <span className="models-experience-row-name">{model.display_name}</span>
                    <span className="models-experience-row-meta">
                      {model.vendor || 'ModelGo'} · {formatContextLength(model.context_length)} · {formatModelPrice(model.pricing?.input_per_1m, model.pricing?.currency)}
                    </span>
                  </span>
                  <span className="models-experience-status-dot" />
                </button>
              ))
            )}
          </div>
        </section>

        <section className="models-experience-chat">
          {selectedModel && (
            <div className="models-experience-modelbar">
              <div className="flex items-center gap-3 min-w-0">
                {vendorNode(selectedModel, 'lg')}
                <div className="min-w-0">
                  <div className="models-experience-modelbar-title">{selectedModel.display_name}</div>
                  <div className="models-experience-modelbar-sub">
                    {provider?.provider_name || selectedModel.vendor || 'ModelGo'} · {detail?.description || selectedModel.model_id}
                  </div>
                </div>
              </div>
              <div className="models-experience-chips">
                <button type="button" onClick={copyModelId}>
                  <LuCopy size={12} />
                  {text.apiId}: {selectedModel.model_id}
                </button>
                <span><LuZap size={12} />{formatContextLength(selectedModel.context_length)}</span>
                <span>{formatModelPrice(selectedModel.pricing?.output_per_1m, selectedModel.pricing?.currency)}</span>
              </div>
            </div>
          )}

          <div className="models-experience-quota">
            <span>{text.quota}</span>
            <div><i style={{ width: `${progress}%` }} /></div>
            <strong>{progress}%</strong>
          </div>

          <div className="models-experience-messages">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={cn('models-experience-message', message.role === 'user' && 'is-user')}>
                <div className="models-experience-message-bubble">
                  {message.content.split('\n').map((line, lineIndex) => <p key={`${index}-${lineIndex}`}>{line}</p>)}
                  {message.meta && <span>{message.meta}</span>}
                </div>
              </div>
            ))}
          </div>

          <div className="models-experience-composer">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  sendPrompt()
                }
              }}
              placeholder={text.input}
            />
            <div className="models-experience-composer-actions">
              <div className="models-experience-active-chip">
                <LuMessageSquare size={13} />
                {selectedModel?.display_name ?? text.current}
              </div>
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => appToast.info(text.params)}>
                  <LuSlidersHorizontal size={14} />
                  {text.params}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setMessages(initialMessages); setInput('') }}>
                  <LuEraser size={14} />
                  {text.clear}
                </Button>
                <Button variant="brand" size="sm" onClick={sendPrompt}>
                  <LuSend size={14} />
                  {text.send}
                </Button>
              </div>
            </div>
            <p>{text.note}</p>
          </div>

          <aside className="models-experience-params">
            <div><LuSettings2 size={14} />{text.params}</div>
            <label>temperature <strong>0.7</strong></label>
            <label>max tokens <strong>{selectedModel?.max_output_tokens || 4096}</strong></label>
            <label>top_p <strong>0.9</strong></label>
            <label><LuCircleCheck size={13} /> stream <strong>on</strong></label>
            <button type="button" onClick={() => setMessages(initialMessages)}><LuRefreshCw size={13} /></button>
          </aside>
        </section>
      </div>
    </div>
  )
}
