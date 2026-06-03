import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LuTriangleAlert,
  LuCopy,
  LuEraser,
  LuGitCompareArrows,
  LuMessageSquare,
  LuSearch,
  LuSend,
  LuSparkles,  LuZap,
} from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { useModels } from '@/features/models/hooks/useModels'
import { appToast } from '@/lib/app-toast'
import { cn, formatContextLength, formatModelPrice } from '@/lib/utils'
import type { CatalogModelItem } from '@/types'
import {
  categories,
  initialMessages,
  matchesCategory,
  modalityBadges,
  modelExperienceCopy,
  previewImages,
  vendorNode,
  type CategoryKey,
  type ExperienceMessage,
} from './model-experience-data'
import './styles/model-experience-layout.css'
import './styles/model-picker.css'
import './styles/model-featured-card.css'
import './styles/model-list.css'
import './styles/model-chat.css'
import './styles/model-composer.css'
import './styles/model-experience-responsive.css'
import { ModelsCompareModal } from './components/ModelsCompareModal'

export default function ModelsPage() {
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const text = i18n.language.startsWith('zh') ? modelExperienceCopy.zh : modelExperienceCopy.en
  const [category, setCategory] = useState<CategoryKey>('all')
  const [isCompareOpen, setIsCompareOpen] = useState(false)
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

  const allModels = useMemo(() => modelsQuery.data?.items ?? [], [modelsQuery.data?.items])

  const visibleModels = useMemo(
    () => filteredModels.filter((model) => matchesCategory(model, category)),
    [category, filteredModels],
  )
  const selectedModel = allModels.find((model) => model.id === selectedId) ?? visibleModels[0] ?? allModels[0]
  const provider = providersQuery.data?.items?.[0]
  const detail = detailQuery.data

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
          <Button variant="outline" className="rounded-full h-9 px-4 text-xs font-bold" onClick={() => setIsCompareOpen(true)}>
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
            <button
              type="button"
              className={cn('models-experience-featured', `cat-${category}`)}
              onClick={() => selectModel(selectedModel, true)}
            >
              {categories.map((cat) => (
                <img
                  key={cat}
                  src={previewImages[cat]}
                  alt=""
                  className={cn(
                    'featured-bg-img',
                    category === cat ? 'is-active' : 'is-inactive'
                  )}
                />
              ))}
              <div className="models-experience-featured-shade" />
              <div className="models-experience-featured-content">
                <div className="flex items-center gap-2">
                  {vendorNode(selectedModel)}
                  <span>{selectedModel.vendor || provider?.provider_name || 'ModelGo'}</span>
                </div>
                <h2>{selectedModel.display_name}</h2>
                <div className="flex gap-1.5 flex-wrap">
                  {modalityBadges(selectedModel)}
                </div>
                <div className="models-experience-featured-metrics">
                  <span>{formatContextLength(selectedModel.context_length)} {text.context}</span>
                  <span>{formatModelPrice(selectedModel.pricing?.input_per_1m, selectedModel.pricing?.currency)}</span>
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
        </section>
      </div>
      <ModelsCompareModal
        isOpen={isCompareOpen}
        onClose={() => setIsCompareOpen(false)}
        allModels={allModels}
        onConfirmCompare={(ids) => {
          if (ids.length > 0) {
            navigate('/models/compare', { state: { selectedIds: ids } })
          }
        }}
      />
    </div>
  )
}
