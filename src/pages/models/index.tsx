import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LuTriangleAlert,
  LuCopy,
  LuGitCompareArrows,
  LuMessageSquare,
  LuSearch,
  LuSparkles, LuZap,
  LuGift,
  LuRefreshCw,
} from 'react-icons/lu'
import { useAuthStore } from '@/store/auth'
import { useBalanceBreakdown } from '@/hooks/use-balance'
import { streamExperienceChat } from '@/services/experience'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Composer } from '@/components/ui/Composer'
import { useModels } from '@/features/models/hooks/useModels'
import { appToast } from '@/lib/app-toast'
import { useCopy } from '@/hooks/use-copy'
import { cn, formatContextLength, formatModelPrice } from '@/lib/utils'
import type { CatalogModelItem } from '@/types'
import {
  categories,
  initialMessages,
  matchesCategory,

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
import './styles/model-params.css'
import './styles/model-experience-responsive.css'
import { ModelsCompareModal } from './components/ModelsCompareModal'

export default function ModelsPage() {
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const text = i18n.language.startsWith('zh') ? modelExperienceCopy.zh : modelExperienceCopy.en
  const tenantId = useAuthStore((s) => s.activeTenantId) ?? ''
  // 免费额度 = 当前租户「赠送余额」（grant 桶）：体验计费优先从中扣减，
  // 与后端多桶账本的真实扣费顺序一致（grant→cash，#97/#93）。
  const { data: breakdown } = useBalanceBreakdown(tenantId)
  const giftBalance = Number(breakdown?.gift.amount ?? 0)
  const [category, setCategory] = useState<CategoryKey>('all')
  const [isCompareOpen, setIsCompareOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ExperienceMessage[]>(initialMessages)
  const [isStreaming, setIsStreaming] = useState(false)
  const { copy } = useCopy()
  const abortRef = useRef<AbortController | null>(null)

  // 离开页面时中断在途流式请求，避免后台继续消耗额度。
  useEffect(() => () => abortRef.current?.abort(), [])
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
    const state = location.state as { selectedModelId?: string } | null
    if (state?.selectedModelId) {
      const targetModel = allModels.find(m => m.model_id === state.selectedModelId || m.id === state.selectedModelId)
      if (targetModel) {
        setSelectedId(targetModel.id)
      }
      navigate('/models/playground', { replace: true, state: {} })
    } else if (!selectedId && allModels[0]) {
      setSelectedId(allModels[0].id)
    }
  }, [allModels, selectedId, setSelectedId, location.state, navigate])

  function selectModel(model: CatalogModelItem, focusComposer = false) {
    setSelectedId(model.id)
    if (focusComposer) window.setTimeout(() => inputRef.current?.focus(), 80)
  }

  async function sendPrompt() {
    const prompt = input.trim()
    if (!prompt || !selectedModel || isStreaming) return
    // 取历史对话（不含静态开场白的 meta），加上本次输入，发给体验代理。
    const history = [...messages, { role: 'user' as const, content: prompt }]
    setMessages((prev) => [...prev, { role: 'user', content: prompt }, { role: 'assistant', content: '' }])
    setInput('')
    setIsStreaming(true)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const startedAt = Date.now()

    const applyAssistant = (updater: (content: string) => string, meta?: string) => {
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') {
          next[next.length - 1] = { ...last, content: updater(last.content), ...(meta ? { meta } : {}) }
        }
        return next
      })
    }

    try {
      await streamExperienceChat({
        model: selectedModel.model_id,
        messages: history.map(({ role, content }) => ({ role, content })),
        signal: controller.signal,
        onDelta: (delta) => applyAssistant((content) => content + delta),
      })
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
      applyAssistant(
        (content) => content,
        `模型 ${selectedModel.model_id} · 延迟 ${seconds}s · ${formatModelPrice(selectedModel.pricing?.input_per_1m, selectedModel.pricing?.currency)}`
      )
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      applyAssistant(() => `体验请求失败：${(err as Error).message || '请稍后重试'}`)
    } finally {
      setIsStreaming(false)
    }
  }

  async function copyModelId() {
    if (!selectedModel) return
    const ok = await copy(selectedModel.model_id)
    if (ok) appToast.success(text.copied)
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
          {/* 免费剩余额度（= 赠送余额 grant 桶），体验计费优先扣减 */}
          <button
            type="button"
            onClick={() => navigate('/billing')}
            title={text.freeQuotaHint}
            className="flex items-center gap-2 rounded-full h-9 pl-3 pr-3.5 border border-brand-base/30 bg-[var(--brand-base)]/5 hover:bg-[var(--brand-base)]/10 transition-colors"
          >
            <LuGift size={14} className="text-brand-base shrink-0" />
            <span className="text-[11px] font-semibold text-mg-text-2 leading-none">{text.freeQuota}</span>
            <span className="text-sm font-bold text-brand-base tabular-nums leading-none">
              ¥{giftBalance.toLocaleString('zh-CN')}
            </span>
          </button>
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
                <div className="models-experience-featured-metrics">
                  <span>最大输出 {selectedModel.max_output_tokens ? formatContextLength(selectedModel.max_output_tokens) : '—'} tokens</span>
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
                      {model.vendor || 'ModelGo'} · 最大输出 {model.max_output_tokens ? formatContextLength(model.max_output_tokens) : '—'} · {formatModelPrice(model.pricing?.input_per_1m, model.pricing?.currency)}
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
            {messages.map((message, index) => {
              // 思考态：最后一条 assistant 消息内容还为空且正在流式请求中
              const isThinking =
                message.role === 'assistant' &&
                message.content === '' &&
                isStreaming &&
                index === messages.length - 1
              return (
                <div key={`${message.role}-${index}`} className={cn('models-experience-message', message.role === 'user' && 'is-user')}>
                  <div className="models-experience-message-bubble">
                    {isThinking ? (
                      <span className="models-experience-thinking" aria-label="模型思考中">
                        <i /><i /><i />
                      </span>
                    ) : (
                      message.content.split('\n').map((line, lineIndex) => <p key={`${index}-${lineIndex}`}>{line}</p>)
                    )}
                    {message.meta && <span>{message.meta}</span>}
                  </div>
                </div>
              )
            })}
          </div>

          <Composer
            ref={inputRef}
            value={input}
            onChange={setInput}
            onSend={sendPrompt}
            isStreaming={isStreaming}
            onStop={() => abortRef.current?.abort()}
            onClear={() => {
              setMessages(initialMessages)
              setInput('')
            }}
            placeholder={text.input}
            note={text.note}
            clearLabel={text.clear}
            sendLabel={text.send}
            className="models-experience-composer-wrap"
            activeChip={
              <div className="models-experience-active-chip">
                <LuMessageSquare size={13} />
                {selectedModel?.display_name ?? text.current}
              </div>
            }
          />

          <div className="flex items-center justify-between px-1 pt-1 pb-0.5">
            <span className="text-[11px] text-mg-text-2 font-mono select-none">
              temperature&nbsp;<b className="text-mg-text-1">0.7</b>
              <span className="mx-1.5 opacity-30">·</span>
              max_tokens&nbsp;<b className="text-mg-text-1">{selectedModel?.max_output_tokens || 4096}</b>
              <span className="mx-1.5 opacity-30">·</span>
              top_p&nbsp;<b className="text-mg-text-1">0.9</b>
              <span className="mx-1.5 opacity-30">·</span>
              stream&nbsp;<b className="text-green-500">on</b>
            </span>
            <button
              type="button"
              className="flex items-center gap-1 text-[11px] text-mg-text-2 hover:text-mg-text-0 transition-colors"
              onClick={() => {
                setMessages(initialMessages)
                appToast.success(i18n.language.startsWith('zh') ? '对话历史已重置' : 'Conversation reset')
              }}
            >
              <LuRefreshCw size={11} />
              <span>{i18n.language.startsWith('zh') ? '重置' : 'Reset'}</span>
            </button>
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
