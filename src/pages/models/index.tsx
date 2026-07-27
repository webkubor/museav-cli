import { useEffect, useMemo, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LuSettings2,
  LuCode,
  LuColumns2,
  LuChevronDown,
  LuCheck,
  LuCopy,
  LuZap,
} from 'react-icons/lu'
import {
  createExperienceSession,
  streamExperienceMessage,
  listExperienceSessions,
  getExperienceSessionMessages,
  type ExperienceStatsEvent,
} from '@/services/experience-sessions'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Composer } from '@/components/ui/Composer'
import { useModels } from '@/features/models/hooks/useModels'
import { cn, prettyModelName, trimPriceZeros } from '@/lib/utils'
import type { CatalogModelItem } from '@/types'
import {
  isChatModel,
  estimateTokens,
  formatPlaygroundLatency,
  formatPlaygroundSpend,
  EXPERIENCE_TASK_LABEL,
  PLAYGROUND_SAMPLE_PROMPTS,
  type ExperienceMessage,
} from './model-experience-data'
import { ModelPickerDialog } from './components/ModelPickerDialog'
import { HistorySessionSidebar, type HistorySessionItem } from './components/HistorySessionSidebar'
import { ModelSettingsModal } from './components/ModelSettingsModal'
import { ApiQuickCallModal } from './components/ApiQuickCallModal'
import './styles/model-experience-layout.css'
import './styles/model-picker.css'
import './styles/model-featured-card.css'
import './styles/model-list.css'
import './styles/model-chat.css'
import './styles/model-composer.css'
import './styles/model-params.css'
import './styles/model-experience-responsive.css'
import { ModelsCompareModal } from './components/ModelsCompareModal'

const INITIAL_MESSAGES: ExperienceMessage[] = []

/** 复制回复内容按钮，逐字对齐原型 App.tsx:20475-20481/20504-20508（复制态 1.6s 后复位） */
function MessageCopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="models-experience-icon-btn"
      aria-label="复制回复内容"
      title="复制回复内容"
      onClick={() => {
        void navigator.clipboard?.writeText(content)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1600)
      }}
    >
      {copied ? <LuCheck size={12} /> : <LuCopy size={12} />}
    </button>
  )
}

/**
 * 价格 chip 文案：与原型 App.tsx `playgroundPriceText()` 逐字对齐——
 * 免费模型「限时免费」；否则「¥输入价 / ¥输出价 每M」，只有输出价时省去输入价那半。
 */
/**
 * 历史消息里 status="failed" 行的 error 字段，实测后端存的是上游原始错误信封整个
 * JSON.stringify 之后的字符串（例如护栏拦截会把 {"error":{"code":403,"message":"..."}}
 * 整个当字符串塞进去），不是一句人话——这里做前端兜底清洗，解析不出来才展示原始字符串。
 */
function cleanErrorMessage(raw: string | undefined): string {
  if (!raw) return '该消息发送失败'
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string }
      msg?: string
      data?: { details?: Array<{ message?: string }> }
    }
    return parsed.data?.details?.[0]?.message ?? parsed.msg ?? parsed.error?.message ?? raw
  } catch {
    return raw
  }
}

function dualPriceText(model: CatalogModelItem): string {
  const currency = model.pricing?.currency === 'USD' ? '$' : '¥'
  const input = model.pricing?.input_per_1m
  const output = model.pricing?.output_per_1m
  if (!input && !output) return '限时免费'
  if (!input) return `${currency}${trimPriceZeros(output ?? '0')} 每M`
  return `${currency}${trimPriceZeros(input)} / ${currency}${trimPriceZeros(output ?? input)} 每M`
}

export default function ModelsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [apiCallOpen, setApiCallOpen] = useState(false)
  const [isCompareOpen, setIsCompareOpen] = useState(false)
  const [historyCollapsed, setHistoryCollapsed] = useState(true)
  const [chatParams, setChatParams] = useState<Record<string, unknown>>({})

  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ExperienceMessage[]>(INITIAL_MESSAGES)
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // 当前会话/列（POST /experience/sessions 懒创建：第一次发送时才建，避免每次进页面都建空会话）
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [historySessions, setHistorySessions] = useState<HistorySessionItem[]>([])

  useEffect(() => () => abortRef.current?.abort(), [])

  // 接口文档§九说 GET /catalog/models 支持 ?experience_type= 按可体验任务筛选，但 test 环境
  // 目录里全部 40 个模型的 experience_types 字段都是空数组（后端数据未回填，见 #533）——
  // 真按文档筛选会导致模型选择器完全空白，页面彻底不可用，所以先退回只按 modality 筛选，
  // 会话创建失败时给出针对性提示（见 sendPrompt 的错误处理），不是我自己要弱化校验
  const { selectedId, setSelectedId, modelsQuery } = useModels({ modality: 'text' })

  const allModels = useMemo(
    () => (modelsQuery.data?.items ?? []).filter(isChatModel),
    [modelsQuery.data?.items],
  )
  const selectedModel = allModels.find((model) => model.id === selectedId) ?? allModels[0]

  /** composer 底部预估费用：与原型 estimatePlaygroundTaskSpend 对齐——按当前草稿估算 input token，
   *  输出 token 取 min(400, max_tokens) 上限估算（App.tsx:16967-16990） */
  const composerEstimatedSpend = useMemo(() => {
    if (!selectedModel) return '¥0.00'
    const inputPrice = Number(selectedModel.pricing?.input_per_1m ?? 0)
    const outputPrice = Number(selectedModel.pricing?.output_per_1m ?? 0)
    if (!inputPrice && !outputPrice) return '¥0.00'
    const systemPrompt = typeof chatParams.systemPrompt === 'string' ? chatParams.systemPrompt : ''
    const maxTokens = typeof chatParams.max_tokens === 'number' ? chatParams.max_tokens : 4096
    const inputTokens = estimateTokens(`${input}${systemPrompt}`)
    const outputTokens = Math.min(400, maxTokens)
    const spend = (inputTokens * inputPrice + outputTokens * outputPrice) / 1_000_000
    return spend === 0 ? '¥0.00' : `¥${spend.toFixed(4)}`
  }, [selectedModel, input, chatParams])

  useEffect(() => {
    const state = location.state as { selectedModelId?: string } | null
    if (state?.selectedModelId) {
      const targetModel = allModels.find((m) => m.model_id === state.selectedModelId || m.id === state.selectedModelId)
      if (targetModel) setSelectedId(targetModel.id)
      navigate('/models/playground', { replace: true, state: {} })
    } else if (!selectedId && allModels[0]) {
      setSelectedId(allModels[0].id)
    }
  }, [allModels, selectedId, setSelectedId, location.state, navigate])

  /** 拉取真实历史会话列表（供侧栏展示）；仅用当前分类可解析的会话，映射不到目录里的模型时用 model_id 兜底展示 */
  async function refreshHistorySessions() {
    try {
      const { items } = await listExperienceSessions({ limit: 20, offset: 0 })
      setHistorySessions(
        items.map((session) => ({
          id: session.id,
          name: session.name,
          updatedAt: session.updated_at,
          category: (session.category as HistorySessionItem['category']) ?? 'dialogue',
          task: EXPERIENCE_TASK_LABEL[session.task as keyof typeof EXPERIENCE_TASK_LABEL] ?? session.task,
          // GET /experience/sessions 列表响应实测不带 conversations（只有创建/详情响应带），
          // 拿不到本会话用了哪些模型——不为了凑 UI 去多打 N 次详情接口，老实留空
          models: (session.conversations ?? [])
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((conv) => {
              const catalogModel = allModels.find((m) => m.model_id === conv.model_id)
              return {
                id: conv.model_id,
                name: catalogModel ? prettyModelName(catalogModel.display_name, catalogModel.model_id) : conv.model_id,
                offline: !catalogModel,
              }
            }),
        })),
      )
    } catch {
      // 历史列表拉取失败不阻塞主流程，侧栏保持空态
    }
  }

  useEffect(() => {
    if (!historyCollapsed) void refreshHistorySessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyCollapsed])

  function startNewSession() {
    setSessionId(null)
    setConversationId(null)
    setMessages(INITIAL_MESSAGES)
    setInput('')
  }

  function handlePick(model: CatalogModelItem) {
    setSelectedId(model.id)
    setPickerOpen(false)
    // 换模型 = 当前列绑定的模型变了，旧会话的列已经对不上——开新会话，而不是复用旧 conversationId
    startNewSession()
    window.setTimeout(() => inputRef.current?.focus(), 80)
  }

  async function openHistorySession(id: string) {
    if (!id) return
    try {
      const { items } = await getExperienceSessionMessages(id)
      const restored: ExperienceMessage[] = items.map((msg) => ({
        role: msg.role,
        content: msg.content,
        error: msg.status === 'failed' ? cleanErrorMessage(msg.error) : undefined,
      }))
      setSessionId(id)
      const conv = items.find((m) => m.conversation_id)?.conversation_id ?? null
      setConversationId(conv)
      setMessages(restored)
      setInput('')
    } catch (err) {
      applyGlobalError(`加载历史会话失败：${(err as Error).message || '请稍后重试'}`)
    }
  }

  function applyGlobalError(message: string) {
    setMessages((prev) => [...prev, { role: 'assistant', content: '', error: message }])
  }

  async function sendPrompt() {
    const prompt = input.trim()
    if (!prompt || !selectedModel || isStreaming) return
    setMessages((prev) => [...prev, { role: 'user', content: prompt }, { role: 'assistant', content: '' }])
    setInput('')
    setIsStreaming(true)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const startedAt = Date.now()
    let firstDeltaAt: number | null = null
    let stats: ExperienceStatsEvent | null = null

    const applyAssistant = (updater: (content: string) => string) => {
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') {
          next[next.length - 1] = { ...last, content: updater(last.content) }
        }
        return next
      })
    }

    try {
      // 懒创建会话：单模型页只有一个对话组任务，会话在第一次真正发送时才建
      let convId = conversationId
      if (!convId) {
        const session = await createExperienceSession({
          name: '未命名会话',
          category: 'dialogue',
          task: 'text_to_text',
          // 单模型体验没有"多列同步"概念，用 independent（真实枚举见 experience-sessions.ts 注释）
          input_mode: 'independent',
          models: [selectedModel.model_id],
        })
        setSessionId(session.id)
        convId = session.conversations?.[0]?.id ?? null
        setConversationId(convId)
      }
      if (!convId) throw new Error('会话创建异常：未返回对话列 id')

      const reply = await streamExperienceMessage({
        conversationId: convId,
        dispatchId: crypto.randomUUID(),
        content: prompt,
        signal: controller.signal,
        onDelta: (delta) => {
          firstDeltaAt ??= Date.now()
          applyAssistant((content) => content + delta)
        },
        onStats: (event) => {
          stats = event
        },
      })

      const modelLabel = prettyModelName(selectedModel.display_name, selectedModel.model_id)
      if (stats) {
        const s: ExperienceStatsEvent = stats
        const spend = Number(s.actual_spend ?? s.estimated_spend ?? 0)
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant') {
            next[next.length - 1] = {
              ...last,
              error: s.status === 'failed' ? (last.content ? undefined : '该模型本轮响应失败') : undefined,
              metrics: {
                model: modelLabel,
                inputTokens: s.input_tokens,
                outputTokens: s.output_tokens,
                firstTokenLatency: formatPlaygroundLatency(s.first_token_ms),
                totalLatency: formatPlaygroundLatency(s.total_ms),
                spend,
                free: s.free,
              },
            }
          }
          return next
        })
      } else {
        // 统计帧异常缺失时的兜底：本地估算，避免消息区完全没有统计信息
        const totalMs = Date.now() - startedAt
        const inputTokens = estimateTokens(prompt)
        const outputTokens = estimateTokens(reply)
        const inputPrice = Number(selectedModel.pricing?.input_per_1m ?? 0)
        const outputPrice = Number(selectedModel.pricing?.output_per_1m ?? 0)
        const free = !inputPrice && !outputPrice
        const spend = free ? 0 : (inputTokens * inputPrice + outputTokens * outputPrice) / 1_000_000
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant') {
            next[next.length - 1] = {
              ...last,
              metrics: {
                model: modelLabel,
                inputTokens,
                outputTokens,
                firstTokenLatency: formatPlaygroundLatency((firstDeltaAt ?? Date.now()) - startedAt),
                totalLatency: formatPlaygroundLatency(totalMs),
                spend,
                free,
              },
            }
          }
          return next
        })
      }
      void refreshHistorySessions()
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      applyAssistant(() => '')
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') {
          next[next.length - 1] = { ...last, error: `体验请求失败：${(err as Error).message || '请稍后重试'}` }
        }
        return next
      })
    } finally {
      setIsStreaming(false)
    }
  }

  return (
    <div className="models-experience-page">
      <PageHeader title="模型体验" description="通过文本与附件连续对话，验证回复、Token、延迟与费用。" className="mb-4" />
      <div className="models-experience-shell">
        {/* 历史会话固定侧栏（PRD §7.8）：收起态窄图标轨，展开 248px；接真实 GET /experience/sessions，
            展开时拉取列表，点击会话用 GET messages 恢复消息到当前视图 */}
        <HistorySessionSidebar
          collapsed={historyCollapsed}
          onToggleCollapsed={setHistoryCollapsed}
          sessions={historySessions}
          activeSessionId={sessionId ?? undefined}
          onSelectSession={(id) => void openHistorySession(id)}
          onNewSession={startNewSession}
        />

        <div className="models-experience-main">
          <div className="models-experience-workbench">
            <section className="models-experience-chat is-single">
              {/* 单模型工作台头部（PRD §7.2 + 原型 App.tsx:19116-19135 逐字对照）：
                  左侧模型选择器（头像+模型名+厂商·任务+价格chip），右侧纯图标 API调用/模型设置 + 文字版模型对比。
                  原型头部没有 model_id 明文复制入口——那个入口挪进了 API 调用弹窗（PRD §7.7）。 */}
              <div className="models-experience-modelbar">
                <button
                  type="button"
                  className="models-experience-model-trigger"
                  onClick={() => setPickerOpen(true)}
                >
                  {selectedModel && (
                    <>
                      <span className="models-experience-model-avatar">
                        {prettyModelName(selectedModel.display_name, selectedModel.model_id).slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="models-experience-modelbar-title">{prettyModelName(selectedModel.display_name, selectedModel.model_id)}</div>
                        <div className="models-experience-modelbar-sub">
                          {selectedModel.vendor || selectedModel.provider || 'ModelGo'} · 对话
                        </div>
                      </div>
                      <span className="models-experience-price-chip">
                        {dualPriceText(selectedModel)}
                      </span>
                      <LuChevronDown size={15} className="text-mg-text-3 shrink-0" />
                    </>
                  )}
                </button>

                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    className="models-experience-icon-btn"
                    aria-label="打开 API 调用"
                    title={selectedModel ? `查看 ${prettyModelName(selectedModel.display_name, selectedModel.model_id)} API 调用示例` : '打开 API 调用'}
                    onClick={() => setApiCallOpen(true)}
                  >
                    <LuCode size={14} />
                  </button>
                  <button
                    type="button"
                    className="models-experience-icon-btn"
                    aria-label="打开模型设置"
                    title={selectedModel ? `配置 ${prettyModelName(selectedModel.display_name, selectedModel.model_id)}` : '打开模型设置'}
                    onClick={() => setSettingsOpen(true)}
                  >
                    <LuSettings2 size={14} />
                  </button>
                  <Button variant="outline" size="sm" className="rounded-md" onClick={() => setIsCompareOpen(true)}>
                    <LuColumns2 size={13} /> 模型对比
                  </Button>
                </div>
              </div>

              <div className="models-experience-messages">
                {messages.length === 0 && (
                  <div className="models-experience-empty">
                    <LuZap size={20} />
                    <strong>发送第一条消息，验证模型输出与成本</strong>
                    <span>支持的图片、音频或视频可以作为消息附件发送。</span>
                    <div className="models-experience-sample-row">
                      {PLAYGROUND_SAMPLE_PROMPTS.map((sample) => (
                        <button
                          key={sample.label}
                          type="button"
                          onClick={() => {
                            setInput(sample.prompt)
                            window.setTimeout(() => inputRef.current?.focus(), 80)
                          }}
                        >
                          {sample.prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((message, index) => {
                  const isThinking =
                    message.role === 'assistant' &&
                    message.content === '' &&
                    isStreaming &&
                    index === messages.length - 1
                  return (
                    <div key={`${message.role}-${index}`} className={cn('models-experience-message', message.role === 'user' && 'is-user')}>
                      <span className="models-experience-message-avatar">
                        {message.role === 'user' ? 'J' : (message.metrics?.model ?? 'AI').slice(0, 1).toUpperCase()}
                      </span>
                      <div className="models-experience-message-bubble">
                        {message.error ? (
                          <span className="models-experience-message-error" role="alert">{message.error}</span>
                        ) : isThinking ? (
                          <span className="models-experience-thinking" aria-label="模型思考中">
                            <i /><i /><i />
                          </span>
                        ) : message.role === 'assistant' ? (
                          <div className="cs-markdown"><Markdown>{message.content}</Markdown></div>
                        ) : (
                          message.content.split('\n').map((line, lineIndex) => <p key={`${index}-${lineIndex}`}>{line}</p>)
                        )}
                        {message.metrics && (
                          <div className="models-experience-message-meta">
                            <strong>{message.metrics.model}</strong>
                            <span>{message.metrics.inputTokens} → {message.metrics.outputTokens} Tokens</span>
                            <span>首Token {message.metrics.firstTokenLatency}</span>
                            <span>总耗时 {message.metrics.totalLatency}</span>
                            <span>{formatPlaygroundSpend(message.metrics)}</span>
                            <MessageCopyButton content={message.content} />
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* PRD §7.2：单模型状态不展示"同步输入"开关、不展示"清空结果"按钮、不重复展示模型ID复制入口。
                  底部动作行左侧是预估费用（原型 App.tsx:18523 playground-composer-hint 逐字对齐），不是模型名 chip——
                  模型身份已在头部展示，composer 里再放一遍是我之前自己发挥加的，删掉。 */}
              <Composer
                ref={inputRef}
                value={input}
                onChange={setInput}
                onSend={sendPrompt}
                isStreaming={isStreaming}
                onStop={() => abortRef.current?.abort()}
                placeholder="输入 Prompt，Enter 发送，Shift + Enter 换行…"
                sendLabel="发送"
                className="models-experience-composer-wrap"
                activeChip={
                  <span className="models-experience-composer-hint">
                    本次预估费用 <strong>{composerEstimatedSpend}</strong>
                  </span>
                }
              />
            </section>
          </div>
        </div>
      </div>

      <ModelPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        mode="single"
        models={allModels}
        onSelect={handlePick}
      />

      {selectedModel && (
        <ModelSettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          modelName={prettyModelName(selectedModel.display_name, selectedModel.model_id)}
          vendor={selectedModel.vendor || selectedModel.provider || 'ModelGo'}
          maxOutputTokens={Math.max(256, selectedModel.max_output_tokens || 4096)}
          task="text_to_text"
          values={chatParams}
          onChange={(key, value) => setChatParams((prev) => ({ ...prev, [key]: value }))}
          onReset={() => setChatParams({})}
          sessionStats={{ requestCount: 0, tokens: 0, cost: 0 }}
        />
      )}

      {selectedModel && (
        <ApiQuickCallModal
          open={apiCallOpen}
          onClose={() => setApiCallOpen(false)}
          modelName={prettyModelName(selectedModel.display_name, selectedModel.model_id)}
          modelId={selectedModel.model_id}
          supportedProtocols={selectedModel.protocols?.length ? (selectedModel.protocols as never) : ['openai']}
        />
      )}

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
