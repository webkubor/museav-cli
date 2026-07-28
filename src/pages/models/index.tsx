import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LuSettings2,
  LuCode,
  LuColumns2,
  LuChevronDown,
  LuZap,
  LuImage,
  LuAudioLines,
  LuVideo,
  LuPaperclip,
  LuX,
  LuTriangleAlert,
} from 'react-icons/lu'
import {
  createExperienceSession,
  streamExperienceMessage,
  sendExperienceMediaMessage,
  getExperienceMessage,
  listExperienceSessions,
  getExperienceSessionMessages,
  getExperienceSessionStats,
  listExperienceModelConfigs,
  saveExperienceModelConfig,
  resetExperienceModelConfig,
  matchesModelConfigId,
  uploadExperienceAttachment,
  type ExperienceStatsEvent,
  type ExperienceAttachment,
} from '@/services/experience-sessions'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Composer } from '@/components/ui/Composer'
import { useModels } from '@/features/models/hooks/useModels'
import { prettyModelName } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import { useBalance, useBalanceBreakdown } from '@/hooks/use-balance'
import { calculateSpendableBalance } from '@/pages/billing/formatBalance'
import { trackEvent, trackPageView } from '@/lib/track'
import type { CatalogModelItem } from '@/types'
import {
  estimateTokens,
  formatPlaygroundLatency,
  dualPriceText,
  isPaidModel,
  hashId,
  latencyBucket,
  tokenBucket,
  sizeBucket,
  EXPERIENCE_TASK_LABEL,
  resolveModelCategory,
  PLAYGROUND_SAMPLE_PROMPTS,
  type ExperienceMessage,
  type ExperienceCategoryKey,
  type ExperienceTaskType,
} from './model-experience-data'
import { ModelPickerDialog } from './components/ModelPickerDialog'
import { HistorySessionSidebar, type HistorySessionItem } from './components/HistorySessionSidebar'
import { ModelSettingsModal } from './components/ModelSettingsModal'
import { ApiQuickCallModal } from './components/ApiQuickCallModal'
import { ExperienceMessageList } from './components/ExperienceMessageList'
import './styles/model-experience-layout.css'
import './styles/model-picker.css'
import './styles/model-featured-card.css'
import './styles/model-list.css'
import './styles/model-chat.css'
import './styles/model-composer.css'
import './styles/model-params.css'
import './styles/model-experience-responsive.css'

const INITIAL_MESSAGES: ExperienceMessage[] = []

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

/**
 * 从抛出的请求错误里挖出人话消息。媒体任务失败走 §5.2 的
 * data.field_errors[].code=PLAYGROUND_MEDIA_FAILED、message=上游原始错误摘要——
 * 实测这个 message 本身又是一层 JSON.stringify 过的原始信封（同 cleanErrorMessage
 * 处理的历史消息 error 字段一个毛病），要再解一层，否则只会显示信封外层的
 * "参数校验失败" 泛用文案。
 */
function extractApiErrorMessage(err: unknown): string {
  const data = (err as { data?: { field_errors?: Array<{ message?: string }>; details?: Array<{ message?: string }> } } | undefined)?.data
  const raw = data?.field_errors?.[0]?.message ?? data?.details?.[0]?.message
  if (raw) return cleanErrorMessage(raw)
  return (err as Error).message || '请稍后重试'
}

/** 空态图标/文案按类别区分（PRD §7.9 各任务空态，原型 App.tsx:19317-19322 逐字对齐） */
const CATEGORY_EMPTY_COPY: Record<ExperienceCategoryKey, { icon: typeof LuZap; title: string; hint: string }> = {
  dialogue: { icon: LuZap, title: '发送第一条消息，验证模型输出与成本', hint: '支持的图片、音频或视频可以作为消息附件发送。' },
  image: { icon: LuImage, title: '配置输入后开始生成图片', hint: '结果会在当前模型列中展示预估费用与实际费用。' },
  audio: { icon: LuAudioLines, title: '配置输入后开始生成音频', hint: '结果会在当前模型列中展示预估费用与实际费用。' },
  video: { icon: LuVideo, title: '配置输入后开始生成视频', hint: '结果会在当前模型列中展示预估费用与实际费用。' },
}

/** composer 占位符按类别区分（原型 App.tsx:18475-18485 逐字对齐） */
const CATEGORY_PLACEHOLDER: Record<ExperienceCategoryKey, string> = {
  dialogue: '输入 Prompt，Enter 发送，Shift + Enter 换行…',
  image: '描述主体、场景、光线与画面风格…',
  audio: '输入要合成语音的文本…',
  video: '描述镜头、主体运动、运镜与氛围…',
}

/** 附件类型/大小上限（PRD §7.5），accept 给 <input type="file"> 用 */
const ATTACHMENT_LIMITS = {
  image: { maxBytes: 10 * 1024 * 1024, accept: '.png,.jpg,.jpeg,.webp', label: '图片（PNG/JPEG/WebP，≤10MB）' },
  audio: { maxBytes: 25 * 1024 * 1024, accept: '.mp3,.wav,.m4a,.ogg,.webm', label: '音频（MP3/WAV/M4A/OGG/WebM，≤25MB）' },
  video: { maxBytes: 100 * 1024 * 1024, accept: '.mp4,.webm,.mov', label: '视频（MP4/WebM/MOV，≤100MB）' },
} as const

function attachmentKindFromMime(mime: string): keyof typeof ATTACHMENT_LIMITS | null {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  return null
}

/**
 * 有附件时任务在同一类别内的两个子任务间切换（§二 task 值域）：对话类多模态输入、
 * 图像/音频/视频类"以图/音生成或识别"。会话固定后 task 不会再变，只在懒创建时算一次。
 */
function resolveEffectiveTask(category: ExperienceCategoryKey, attachmentKind: string | null): ExperienceTaskType {
  if (category === 'dialogue') {
    if (attachmentKind === 'image') return 'image_to_text'
    if (attachmentKind === 'video') return 'video_to_text'
    return 'text_to_text'
  }
  if (category === 'image') return attachmentKind ? 'image_to_image' : 'text_to_image'
  if (category === 'audio') return attachmentKind ? 'audio_to_text' : 'text_to_audio'
  return attachmentKind ? 'image_to_video' : 'text_to_video'
}

export default function ModelsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [apiCallOpen, setApiCallOpen] = useState(false)
  const [compareAddOpen, setCompareAddOpen] = useState(false)
  const [historyCollapsed, setHistoryCollapsed] = useState(true)
  const [chatParams, setChatParams] = useState<Record<string, unknown>>({})
  const [sessionStats, setSessionStats] = useState({ requestCount: 0, tokens: 0, cost: 0 })

  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ExperienceMessage[]>(INITIAL_MESSAGES)
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // 当前会话/列（POST /experience/sessions 懒创建：第一次发送时才建，避免每次进页面都建空会话）
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [historySessions, setHistorySessions] = useState<HistorySessionItem[]>([])

  // 每轮最多一个附件（§7.5），上传成功后才拿到 resource_id，发送后清空
  const [attachment, setAttachment] = useState<{ file: File; previewUrl: string; uploaded: ExperienceAttachment } | null>(null)
  const [attachmentUploading, setAttachmentUploading] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const viewTrackedRef = useRef(false)
  // 挂载那一刻的 entry state 会被下面的 navigate(replace, state:{}) 清空，先冻住供 playground_view 用
  const entryStateRef = useRef((location.state as { selectedModelId?: string } | null)?.selectedModelId)

  useEffect(() => () => abortRef.current?.abort(), [])

  // 接口文档§九说 GET /catalog/models 支持 ?experience_type= 按可体验任务筛选，但 test 环境
  // 目录里全部 40 个模型的 experience_types 字段都是空数组（后端数据未回填，见 #533）——
  // 真按文档筛选会导致模型选择器完全空白，页面彻底不可用，所以不传 modality，取全量目录，
  // 用 resolveModelCategory 按输出模态自己分桶到对话/图像/音频/视频四个类别（ModelPickerDialog
  // 的类别 Tab 用的是同一份逻辑，两边口径一致）
  const { selectedId, setSelectedId, modelsQuery } = useModels()

  const allModels = useMemo(() => modelsQuery.data?.items ?? [], [modelsQuery.data?.items])
  const selectedModel = allModels.find((model) => model.id === selectedId) ?? allModels[0]
  const selectedCategory = selectedModel ? resolveModelCategory(selectedModel) : 'dialogue'
  const isDialogue = selectedCategory === 'dialogue'

  // §9.1 余额资格状态机：可消费合计（主+赠送+奖励）为 0 时，付费模型禁止发送，只能体验限免模型。
  const tenantId = useAuthStore((s) => s.activeTenantId) ?? ''
  const { data: balance } = useBalance(tenantId)
  const { data: balanceBreakdown } = useBalanceBreakdown(tenantId)
  const spendableBalance = calculateSpendableBalance(
    balance?.available?.amount,
    balanceBreakdown?.gift?.amount,
    balanceBreakdown?.reward?.amount,
  )
  const isBalanceZero = spendableBalance !== undefined && spendableBalance <= 0
  const isBlockedByBalance = isBalanceZero && !!selectedModel && isPaidModel(selectedModel)
  const effectiveTask = resolveEffectiveTask(selectedCategory, attachment ? attachmentKindFromMime(attachment.uploaded.mime) : null)
  /** 每个类别允许附哪种附件（§7.5）。对话类的音频附件在真实 task 枚举里没有对应的子任务
   *  （image_to_text/video_to_text 之外没有 audio 版本），先不开放，只开放能对应到真实
   *  任务枚举的图片/视频；图像类只收图片（图生图参考图）、音频类只收音频（转写）、
   *  视频类只收图片（图生视频首帧）。 */
  const allowedAttachmentKinds: Array<keyof typeof ATTACHMENT_LIMITS> =
    selectedCategory === 'dialogue' ? ['image', 'video'] : selectedCategory === 'audio' ? ['audio'] : ['image']

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

  // §10.3 playground_view：页面有效展示（模型目录到位、当前模型可解析后才算“有效”），只上报一次
  useEffect(() => {
    if (viewTrackedRef.current || allModels.length === 0 || !selectedModel) return
    viewTrackedRef.current = true
    trackPageView('models_playground', {
      entry_source: entryStateRef.current ? 'catalog' : 'direct',
      target_model_id: entryStateRef.current ?? selectedModel.model_id,
    })
  }, [allModels, selectedModel])

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
    setChatParams({})
    setSessionStats({ requestCount: 0, tokens: 0, cost: 0 })
  }

  /** 历史会话年龄分桶（§10.3 playground_history_action.history_age_bucket），边界为工程经验值 */
  function historyAgeBucket(updatedAt: string): string {
    const ageMs = Date.now() - new Date(updatedAt).getTime()
    const days = ageMs / (24 * 3600 * 1000)
    if (days < 1) return '<1d'
    if (days < 7) return '1-7d'
    if (days < 30) return '7-30d'
    return '>30d'
  }

  function handlePick(model: CatalogModelItem) {
    trackEvent('playground_model_select', { from_model_id: selectedModel?.model_id ?? '', to_model_id: model.model_id }, { result: 'success' })
    setSelectedId(model.id)
    setPickerOpen(false)
    // 换模型 = 当前列绑定的模型变了，旧会话的列已经对不上——开新会话，而不是复用旧 conversationId
    startNewSession()
    window.setTimeout(() => inputRef.current?.focus(), 80)
  }

  async function openHistorySession(id: string) {
    if (!id) return
    const session = historySessions.find((s) => s.id === id)
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
      setChatParams({})
      setSessionStats({ requestCount: 0, tokens: 0, cost: 0 })
      trackEvent('playground_history_action', {
        action: 'restore',
        history_age_bucket: session ? historyAgeBucket(session.updatedAt) : 'unknown',
      }, { result: 'success' })
    } catch (err) {
      applyGlobalError(`加载历史会话失败：${(err as Error).message || '请稍后重试'}`)
      trackEvent('playground_history_action', {
        action: 'restore',
        history_age_bucket: session ? historyAgeBucket(session.updatedAt) : 'unknown',
      }, { result: 'fail' })
    }
  }

  function applyGlobalError(message: string) {
    setMessages((prev) => [...prev, { role: 'assistant', content: '', error: message }])
  }

  /** 打开设置弹窗：有真实会话时拉取该模型已持久化的配置 + 本会话累计统计（§7.6/§3.7），
   *  真实端点见 Swagger GET .../configs、GET .../stats（PRD 接口文档 §3.8 那张表读不到，
   *  这两个是从 Swagger 核实到的） */
  async function openSettings() {
    trackEvent('playground_settings_action', { action: 'open' })
    setSettingsOpen(true)
    if (!sessionId || !selectedModel) return
    try {
      const [{ items: configs }, { items: stats }] = await Promise.all([
        listExperienceModelConfigs(sessionId),
        getExperienceSessionStats(sessionId),
      ])
      const savedConfig = configs.find((c) => matchesModelConfigId(c.model_id, selectedModel.model_id))
      if (savedConfig) setChatParams(savedConfig.config)
      const modelStats = stats.find((s) => s.model_id === selectedModel.model_id)
      if (modelStats) {
        setSessionStats({
          requestCount: modelStats.requests,
          tokens: modelStats.total_tokens,
          cost: Number(modelStats.actual_spend ?? modelStats.estimated_spend ?? 0),
        })
      }
    } catch {
      // 拉取失败不阻塞设置弹窗使用，保留当前本地值
    }
  }

  function handleChatParamChange(key: string, value: unknown) {
    // 只记参数名，不记参数值（§10.3 备注：不记录参数文本值）
    trackEvent('playground_settings_action', { action: 'modify', parameter_name: key })
    setChatParams((prev) => {
      const next = { ...prev, [key]: value }
      if (sessionId && selectedModel) void saveExperienceModelConfig(sessionId, selectedModel.model_id, next)
      return next
    })
  }

  function handleResetChatParams() {
    trackEvent('playground_settings_action', { action: 'reset' })
    setChatParams({})
    if (sessionId && selectedModel) void resetExperienceModelConfig(sessionId, selectedModel.model_id)
  }

  function clearAttachment() {
    setAttachment((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl)
      return null
    })
    setAttachmentError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  /** 上传附件（§7.5）：先按类型/大小校验，通过了才真的上传；会话已建好后不能再换类别的附件类型
   *  （task 已经固定），这里只按当前 selectedCategory 的允许类型校验 */
  async function handleFileSelect(file: File | null | undefined) {
    if (!file) return
    setAttachmentError(null)
    const kind = attachmentKindFromMime(file.type)
    // 单模型页只服务当前一个模型列，§10.3 的 supporting/unsupported_model_count 在这里恒为 1/0
    if (!kind || !allowedAttachmentKinds.includes(kind)) {
      setAttachmentError(`当前模型不支持该附件类型，仅支持：${allowedAttachmentKinds.map((k) => ATTACHMENT_LIMITS[k].label).join('、')}`)
      if (fileInputRef.current) fileInputRef.current.value = ''
      trackEvent('playground_attachment_result', {
        kind: kind ?? 'unknown', size_bucket: sizeBucket(file.size), result: 'fail',
        supporting_model_count: 0, unsupported_model_count: 1, distribution_mode: 'single',
      })
      return
    }
    if (file.size > ATTACHMENT_LIMITS[kind].maxBytes) {
      setAttachmentError(`文件超出大小限制（${ATTACHMENT_LIMITS[kind].label}）`)
      if (fileInputRef.current) fileInputRef.current.value = ''
      trackEvent('playground_attachment_result', {
        kind, size_bucket: sizeBucket(file.size), result: 'fail',
        supporting_model_count: 0, unsupported_model_count: 1, distribution_mode: 'single',
      })
      return
    }
    const previewUrl = URL.createObjectURL(file)
    setAttachmentUploading(true)
    try {
      const uploaded = await uploadExperienceAttachment(file)
      setAttachment({ file, previewUrl, uploaded })
      trackEvent('playground_attachment_result', {
        kind, size_bucket: sizeBucket(file.size), result: 'success',
        supporting_model_count: 1, unsupported_model_count: 0, distribution_mode: 'single',
      })
    } catch (err) {
      URL.revokeObjectURL(previewUrl)
      setAttachmentError(extractApiErrorMessage(err))
      trackEvent('playground_attachment_result', {
        kind, size_bucket: sizeBucket(file.size), result: 'fail',
        supporting_model_count: 0, unsupported_model_count: 1, distribution_mode: 'single',
      })
    } finally {
      setAttachmentUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  /** 懒创建会话：按当前模型分类/任务建（对话/媒体走的是同一个会话创建接口，只是 category/task 不同） */
  async function ensureConversation(): Promise<string> {
    if (conversationId) return conversationId
    if (!selectedModel) throw new Error('未选择模型')
    const session = await createExperienceSession({
      name: '未命名会话',
      category: selectedCategory,
      task: effectiveTask,
      // 单模型体验没有"多列同步"概念，用 independent（真实枚举见 experience-sessions.ts 注释）
      input_mode: 'independent',
      models: [selectedModel.model_id],
    })
    setSessionId(session.id)
    const convId = session.conversations?.[0]?.id ?? null
    setConversationId(convId)
    if (!convId) throw new Error('会话创建异常：未返回对话列 id')
    return convId
  }

  async function sendPrompt() {
    const prompt = input.trim()
    if (!prompt || !selectedModel || isStreaming || isBlockedByBalance) return
    const dispatchId = crypto.randomUUID()
    const attachedKindAtSend = attachment ? attachmentKindFromMime(attachment.uploaded.mime) : null
    trackEvent('playground_send', {
      dispatch_id_hash: hashId(dispatchId),
      attachment_kind_set: attachedKindAtSend ?? 'none',
      eligible_column_count: 1,
      attachment_recipient_count: attachment ? 1 : 0,
    })
    if (isDialogue) await sendDialoguePrompt(prompt, dispatchId)
    else await sendMediaPrompt(prompt, dispatchId)
  }

  async function sendDialoguePrompt(prompt: string, dispatchId: string) {
    if (!selectedModel) return
    const attachedKind = attachment ? attachmentKindFromMime(attachment.uploaded.mime) : null
    const userMedia = attachment ? [{ kind: attachedKind ?? 'image', url: attachment.previewUrl }] : undefined
    const resourceIds = attachment ? [attachment.uploaded.resource_id] : []
    clearAttachment()
    setMessages((prev) => [...prev, { role: 'user', content: prompt, media: userMedia }, { role: 'assistant', content: '' }])
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
      const convId = await ensureConversation()
      const reply = await streamExperienceMessage({
        conversationId: convId,
        dispatchId,
        content: prompt,
        attachments: resourceIds,
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
        trackEvent('playground_model_run_result', {
          model_id: selectedModel.model_id,
          status: s.status === 'failed' ? 'failed' : 'succeeded',
          latency_bucket: latencyBucket(s.total_ms),
          token_bucket: tokenBucket(s.input_tokens + s.output_tokens),
          billing_status: s.free ? 'free' : 'billed',
        }, { result: s.status === 'failed' ? 'fail' : 'success' })
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
        trackEvent('playground_model_run_result', {
          model_id: selectedModel.model_id,
          status: 'succeeded',
          latency_bucket: latencyBucket(totalMs),
          token_bucket: tokenBucket(inputTokens + outputTokens),
          billing_status: free ? 'free' : 'billed',
        }, { result: 'success' })
      }
      void refreshHistorySessions()
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      applyAssistant(() => '')
      const errorCode = (err as { data?: { code?: string } } | undefined)?.data?.code
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') {
          next[next.length - 1] = { ...last, error: `体验请求失败：${(err as Error).message || '请稍后重试'}` }
        }
        return next
      })
      trackEvent('playground_model_run_result', {
        model_id: selectedModel.model_id,
        status: 'failed',
        latency_bucket: latencyBucket(Date.now() - startedAt),
        token_bucket: tokenBucket(0),
        billing_status: 'unbilled',
      }, { result: 'fail', error_code: errorCode })
    } finally {
      setIsStreaming(false)
    }
  }

  /** 媒体任务发送（§5.2 同步 JSON / §5.3-5.4 视频异步轮询）。图生图/语音识别/图生视频这类
   *  "必须携带附件"的任务，没附件时会被后端校验拒绝（PLAYGROUND_ATTACHMENT_REQUIRED），
   *  报错走下面统一的 catch，不在前端预先拦截——真源是后端校验，不重复造一遍。 */
  async function sendMediaPrompt(prompt: string, dispatchId: string) {
    if (!selectedModel) return
    const modelLabel = prettyModelName(selectedModel.display_name, selectedModel.model_id)
    const attachedKind = attachment ? attachmentKindFromMime(attachment.uploaded.mime) : null
    const userMedia = attachment ? [{ kind: attachedKind ?? 'image', url: attachment.previewUrl }] : undefined
    const resourceIds = attachment ? [attachment.uploaded.resource_id] : []
    clearAttachment()
    setMessages((prev) => [...prev, { role: 'user', content: prompt, media: userMedia }, { role: 'assistant', content: '' }])
    setInput('')
    setIsStreaming(true)
    const startedAt = Date.now()

    function applyResult(patch: Partial<ExperienceMessage>) {
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') next[next.length - 1] = { ...last, ...patch }
        return next
      })
    }

    try {
      const convId = await ensureConversation()
      const { message, attachment_urls } = await sendExperienceMediaMessage({
        conversationId: convId,
        dispatchId,
        content: prompt,
        attachments: resourceIds,
      })

      if (message.status === 'running' && message.async_task_id) {
        // 视频异步任务：建议间隔 5 秒轮询，succeeded/failed 才是终态；run_result 留给轮询终态上报，这里不重复
        applyResult({ content: '视频生成中，可稍后在调用日志的异步任务里追踪…' })
        void pollVideoMessage(convId, message.id, modelLabel, selectedModel.model_id)
        return
      }

      const media = message.attachments.map((a) => ({ kind: a.kind, url: attachment_urls[a.resource_id] ?? '' }))
      const spend = Number(message.actual_spend ?? 0)
      const totalMs = message.total_ms ?? Date.now() - startedAt
      applyResult({
        content: message.content,
        media: media.length > 0 ? media : undefined,
        metrics: {
          model: modelLabel,
          inputTokens: 0,
          outputTokens: 0,
          firstTokenLatency: '',
          totalLatency: formatPlaygroundLatency(totalMs),
          spend,
          free: spend === 0,
        },
      })
      trackEvent('playground_model_run_result', {
        model_id: selectedModel.model_id,
        status: message.status === 'failed' ? 'failed' : 'succeeded',
        latency_bucket: latencyBucket(totalMs),
        token_bucket: tokenBucket(0),
        billing_status: spend === 0 ? 'free' : 'billed',
      }, { result: message.status === 'failed' ? 'fail' : 'success' })
      void refreshHistorySessions()
    } catch (err) {
      applyResult({ error: `体验请求失败：${extractApiErrorMessage(err)}` })
      const errorCode = (err as { data?: { field_errors?: Array<{ code?: string }> } } | undefined)?.data?.field_errors?.[0]?.code
      trackEvent('playground_model_run_result', {
        model_id: selectedModel.model_id,
        status: 'failed',
        latency_bucket: latencyBucket(Date.now() - startedAt),
        token_bucket: tokenBucket(0),
        billing_status: 'unbilled',
      }, { result: 'fail', error_code: errorCode })
    } finally {
      setIsStreaming(false)
    }
  }

  /** 视频异步任务轮询（§5.4）：running 继续轮询，succeeded/failed 为终态 */
  async function pollVideoMessage(conversationId: string, messageId: string, modelLabel: string, modelId: string) {
    for (;;) {
      await new Promise((resolve) => window.setTimeout(resolve, 5000))
      try {
        const { message, attachment_urls } = await getExperienceMessage(conversationId, messageId)
        if (message.status === 'running') continue
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role !== 'assistant') return prev
          if (message.status === 'failed') {
            return [...next.slice(0, -1), { ...last, error: message.error || '视频生成失败', content: '' }]
          }
          const media = message.attachments.map((a) => ({ kind: a.kind, url: attachment_urls[a.resource_id] ?? '' }))
          return [
            ...next.slice(0, -1),
            {
              ...last,
              content: '',
              media: media.length > 0 ? media : undefined,
              metrics: {
                model: modelLabel,
                inputTokens: 0,
                outputTokens: 0,
                firstTokenLatency: '',
                totalLatency: formatPlaygroundLatency(message.total_ms ?? 0),
                spend: Number(message.actual_spend ?? 0),
                free: false,
              },
            },
          ]
        })
        trackEvent('playground_model_run_result', {
          model_id: modelId,
          status: message.status === 'failed' ? 'failed' : 'succeeded',
          latency_bucket: latencyBucket(message.total_ms ?? 0),
          token_bucket: tokenBucket(0),
          billing_status: Number(message.actual_spend ?? 0) === 0 ? 'free' : 'billed',
        }, { result: message.status === 'failed' ? 'fail' : 'success' })
        void refreshHistorySessions()
        return
      } catch {
        // 单次轮询失败不放弃，继续等下一轮（§8.3：异步任务刷新失败保留最后已知状态，允许稍后重试）
      }
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
          onToggleCollapsed={(collapsed) => {
            if (!collapsed) trackEvent('playground_history_action', { action: 'open' })
            setHistoryCollapsed(collapsed)
          }}
          sessions={historySessions}
          activeSessionId={sessionId ?? undefined}
          onSelectSession={(id) => void openHistorySession(id)}
          onNewSession={() => {
            trackEvent('playground_history_action', { action: 'new' })
            startNewSession()
          }}
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
                  onClick={() => {
                    trackEvent('playground_model_picker_open', { picker_type: 'single', browse_category: selectedCategory })
                    setPickerOpen(true)
                  }}
                >
                  {selectedModel && (
                    <>
                      <span className="models-experience-model-avatar">
                        {prettyModelName(selectedModel.display_name, selectedModel.model_id).slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="models-experience-modelbar-title">{prettyModelName(selectedModel.display_name, selectedModel.model_id)}</div>
                        <div className="models-experience-modelbar-sub">
                          {selectedModel.vendor || selectedModel.provider || 'ModelGo'} · {EXPERIENCE_TASK_LABEL[effectiveTask]}
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
                    onClick={() => {
                      trackEvent('playground_api_modal_action', { action: 'open', protocol: '', language: '', model_id: selectedModel?.model_id ?? '' })
                      setApiCallOpen(true)
                    }}
                  >
                    <LuCode size={14} />
                  </button>
                  <button
                    type="button"
                    className="models-experience-icon-btn"
                    aria-label="打开模型设置"
                    title={selectedModel ? `配置 ${prettyModelName(selectedModel.display_name, selectedModel.model_id)}` : '打开模型设置'}
                    onClick={() => void openSettings()}
                  >
                    <LuSettings2 size={14} />
                  </button>
                  {isDialogue && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-md"
                      onClick={() => {
                        trackEvent('playground_model_picker_open', { picker_type: 'compareAdd', browse_category: selectedCategory })
                        setCompareAddOpen(true)
                      }}
                    >
                      <LuColumns2 size={13} /> 模型对比
                    </Button>
                  )}
                </div>
              </div>

              <ExperienceMessageList
                messages={messages}
                isStreaming={isStreaming}
                emptyState={
                  <div className="models-experience-empty">
                    {(() => {
                      const EmptyIcon = CATEGORY_EMPTY_COPY[selectedCategory].icon
                      return <EmptyIcon size={20} />
                    })()}
                    <strong>{CATEGORY_EMPTY_COPY[selectedCategory].title}</strong>
                    <span>{CATEGORY_EMPTY_COPY[selectedCategory].hint}</span>
                    {isDialogue && (
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
                    )}
                  </div>
                }
              />

              {/* §9.1 余额资格状态机：可消费合计为 0 且当前模型付费时，锁定发送并引导充值
                  （原型 App.tsx playground-balance-notice 逐字对齐） */}
              {isBlockedByBalance && (
                <div className="playground-balance-notice" role="alert">
                  <LuTriangleAlert size={15} />
                  <span>
                    <strong>余额不足，仅可体验免费模型</strong>
                    当前模型与输入已为你保留，充值后即可继续运行。
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      trackEvent('playground_recharge_click', { locked_model_count: 1 })
                      navigate('/billing')
                    }}
                  >
                    去充值
                  </button>
                </div>
              )}

              {/* 附件预览/错误（§7.5）：每轮最多一个附件，发送后清空 */}
              {(attachment || attachmentError) && (
                <div className="models-experience-attachment-row">
                  {attachment && (
                    <div className="models-experience-attachment-chip">
                      {attachmentKindFromMime(attachment.uploaded.mime) === 'image' ? (
                        <img src={attachment.previewUrl} alt="附件预览" />
                      ) : (
                        <span className="models-experience-attachment-name">{attachment.file.name}</span>
                      )}
                      <button type="button" aria-label="移除附件" onClick={clearAttachment}>
                        <LuX size={12} />
                      </button>
                    </div>
                  )}
                  {attachmentError && <span className="models-experience-attachment-error">{attachmentError}</span>}
                </div>
              )}

              {/* PRD §7.2：单模型状态不展示"同步输入"开关、不展示"清空结果"按钮、不重复展示模型ID复制入口。
                  底部动作行左侧是预估费用（原型 App.tsx:18523 playground-composer-hint 逐字对齐）+ 附件入口
                  （§7.5，纯文本模型不显示附件入口——对话类允许图片/视频，图像/音频/视频类各自只收一种）。 */}
              <input
                ref={fileInputRef}
                type="file"
                accept={allowedAttachmentKinds.map((k) => ATTACHMENT_LIMITS[k].accept).join(',')}
                className="hidden"
                onChange={(e) => void handleFileSelect(e.target.files?.[0])}
              />
              <Composer
                ref={inputRef}
                value={input}
                onChange={setInput}
                onSend={sendPrompt}
                isStreaming={isStreaming}
                disabled={isBlockedByBalance}
                onStop={() => abortRef.current?.abort()}
                placeholder={CATEGORY_PLACEHOLDER[selectedCategory]}
                sendLabel="发送"
                className="models-experience-composer-wrap"
                activeChip={
                  <div className="models-experience-composer-left">
                    <button
                      type="button"
                      className="models-experience-icon-btn"
                      aria-label="添加附件"
                      title={`支持：${allowedAttachmentKinds.map((k) => ATTACHMENT_LIMITS[k].label).join('、')}`}
                      disabled={attachmentUploading || !!attachment}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <LuPaperclip size={14} />
                    </button>
                    <span className="models-experience-composer-hint">
                      {attachmentUploading ? '附件上传中…' : (
                        <>本次预估费用 <strong>{composerEstimatedSpend}</strong></>
                      )}
                    </span>
                  </div>
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
        isBalanceZero={isBalanceZero}
        onSelect={handlePick}
      />

      {selectedModel && (
        <ModelSettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          modelName={prettyModelName(selectedModel.display_name, selectedModel.model_id)}
          vendor={selectedModel.vendor || selectedModel.provider || 'ModelGo'}
          maxOutputTokens={Math.max(256, selectedModel.max_output_tokens || 4096)}
          task={effectiveTask}
          values={chatParams}
          onChange={handleChatParamChange}
          onReset={handleResetChatParams}
          sessionStats={sessionStats}
        />
      )}

      {selectedModel && (
        <ApiQuickCallModal
          open={apiCallOpen}
          onClose={() => setApiCallOpen(false)}
          modelName={prettyModelName(selectedModel.display_name, selectedModel.model_id)}
          modelId={selectedModel.model_id}
          supportedProtocols={selectedModel.protocols?.length ? (selectedModel.protocols as never) : ['openai']}
          onAction={(action, protocol, language) => trackEvent('playground_api_modal_action', { action, protocol, language, model_id: selectedModel.model_id })}
        />
      )}

      {/* PRD §7.3：单模型点「模型对比」打开统一候选弹窗，可勾选第 2/3 个模型；
          当前模型固定展示为「已选模型」不可取消；确认后一次性带着完整模型组进入对比页 */}
      {selectedModel && (
        <ModelPickerDialog
          open={compareAddOpen}
          onClose={() => setCompareAddOpen(false)}
          mode="compareAdd"
          models={allModels}
          isBalanceZero={isBalanceZero}
          currentCategory="dialogue"
          currentTask="text_to_text"
          alreadySelectedIds={[selectedModel.id]}
          maxAdditional={2}
          onConfirmAdd={(added) => {
            if (added.length === 0) return
            trackEvent('playground_compare_enter', { sidebar_was_collapsed: historyCollapsed })
            navigate('/models/compare', { state: { selectedIds: [selectedModel.id, ...added.map((m) => m.id)] } })
          }}
        />
      )}
    </div>
  )
}
