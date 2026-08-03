import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LuSettings2,
  LuCode,
  LuColumns2,
  LuChevronDown,
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
  renameExperienceSession,
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
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { useExperienceWorkbenchStore } from '@/store/use-experience-workbench-store'
import { prettyModelName } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import { useBalance, useBalanceBreakdown } from '@/hooks/use-balance'
import { calculateSpendableBalance } from '@/pages/billing/formatBalance'
import { trackEvent, trackPageView } from '@/lib/track'
import { appToast } from '@/lib/app-toast'
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
  experienceTaskLabel,
  resolveModelCategory,
  playgroundSamplePrompts,
  cleanErrorMessage,
  extractApiErrorMessage,
  buildMediaArtifactTitle,
  buildMediaArtifactDetail,
  categoryEmptyCopy,
  categoryPlaceholder,
  ATTACHMENT_LIMITS,
  attachmentLimitLabel,
  attachmentKindFromMime,
  resolveDialogueTask,
  modelCategoryTasks,
  normalizeChatParams,
  taskNeedsFile,
  taskAttachmentKind,
  EXPERIENCE_CATEGORY_TASKS,
  EXPERIENCE_CATEGORY_DEFAULT_TASK,
  offlineModelPlaceholder,
  isOfflineModel,
  modelSupportsAttachment,
  type ExperienceMessage,
  type ExperienceTaskType,
} from './model-experience-data'
import { ModelPickerDialog } from './components/ModelPickerDialog'
import { ModelsCompareModal } from './components/ModelsCompareModal'
import { HistorySessionSidebar, type HistorySessionItem } from './components/HistorySessionSidebar'
import { ModelSettingsModal } from './components/ModelSettingsModal'
import { ApiQuickCallModal } from './components/ApiQuickCallModal'
import { ExperienceMessageList } from './components/ExperienceMessageList'
import { TaskFileDropZone } from './components/TaskFileDropZone'
import { TaskSwitch } from './components/TaskSwitch'
import { resolveExperienceMessageMedia } from './experience-message-attachments'
import './styles/model-experience-layout.css'
import './styles/model-picker.css'
import './styles/model-featured-card.css'
import './styles/model-list.css'
import './styles/model-chat.css'
import './styles/model-composer.css'
import './styles/model-params.css'
import './styles/model-experience-responsive.css'

const INITIAL_MESSAGES: ExperienceMessage[] = []

export default function ModelsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [apiCallOpen, setApiCallOpen] = useState(false)
  const [compareAddOpen, setCompareAddOpen] = useState(false)
  const [historyCollapsed, setHistoryCollapsed] = useState(true)

  // 模型列/会话/消息跨路由持久化（qa#544）：改走模块级 zustand store，SPA 内路由切走
  // 再切回不再清空；变量名保持不变，文件里后续几十处引用几乎不用改。
  const single = useExperienceWorkbenchStore((s) => s.single)
  const setSingle = useExperienceWorkbenchStore((s) => s.setSingle)
  const selectedId = single.selectedId
  // useCallback：这个 setter 进了下面某个 useEffect 的依赖数组，保持引用稳定避免每次渲染都重跑
  const setSelectedId = useCallback((id: string | null) => setSingle({ selectedId: id, offlineModel: null }), [setSingle])
  // 历史会话引用的模型已不在目录（下线/删除）时的占位（PRD §AC-18），非空时优先于 selectedId
  const offlineModel = single.offlineModel
  const messages = single.messages
  const setMessages = (updater: ExperienceMessage[] | ((prev: ExperienceMessage[]) => ExperienceMessage[])) =>
    setSingle((s) => ({ messages: typeof updater === 'function' ? updater(s.messages) : updater }))
  const sessionId = single.sessionId
  const setSessionId = (id: string | null) => setSingle({ sessionId: id })
  const conversationId = single.conversationId
  const setConversationId = (id: string | null) => setSingle({ conversationId: id })
  const chatParams = single.chatParams
  const setChatParams = (params: Record<string, unknown> | ((prev: Record<string, unknown>) => Record<string, unknown>)) =>
    setSingle((s) => ({ chatParams: typeof params === 'function' ? params(s.chatParams) : params }))
  const sessionStats = single.sessionStats
  const setSessionStats = (
    stats: typeof single.sessionStats | ((prev: typeof single.sessionStats) => typeof single.sessionStats),
  ) => setSingle((s) => ({ sessionStats: typeof stats === 'function' ? stats(s.sessionStats) : stats }))

  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const [historySessions, setHistorySessions] = useState<HistorySessionItem[]>([])

  // 每轮最多一个附件（§7.5），上传成功后才拿到 resource_id，发送后清空
  const [attachment, setAttachment] = useState<{ file: File; previewUrl: string; uploaded: ExperienceAttachment } | null>(null)
  const [attachmentUploading, setAttachmentUploading] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const transientPreviewUrlsRef = useRef(new Set<string>())
  const viewTrackedRef = useRef(false)
  // 挂载那一刻的 entry state 会被下面的 navigate(replace, state:{}) 清空，先冻住供 playground_view 用
  const entryStateRef = useRef((location.state as { selectedModelId?: string } | null)?.selectedModelId)

  useEffect(() => () => {
    abortRef.current?.abort()
    transientPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  // 接口文档§九说 GET /catalog/models 支持 ?experience_type= 按可体验任务筛选；#533 的
  // 取全量目录，用 resolveModelCategory 按输入/输出模态分桶到对话/图像/音频/视频四个
  // 类别（口径 2026-07-31：experience_types 后端将删除，类别与任务一律模态推导；
  // ModelPickerDialog 的类别 Tab 用的是同一份逻辑，两边口径一致）
  const { modelsQuery } = useModels()

  const allModels = useMemo(() => modelsQuery.data?.items ?? [], [modelsQuery.data?.items])
  const selectedModel = offlineModel ?? allModels.find((model) => model.id === selectedId) ?? allModels[0]
  const isSelectedModelOffline = Boolean(selectedModel && isOfflineModel(selectedModel))
  const selectedCategory = selectedModel ? resolveModelCategory(selectedModel) : 'dialogue'
  const isDialogue = selectedCategory === 'dialogue'

  /** image/audio/video 类的可体验任务是用户在模型选择器「可体验任务」按钮组里显式选定的
   *  （PRD §7.1 selectModelTask），存 single.task；不兼容当前模型（比如换了个只支持其中
   *  一个任务的模型）就退化到该类别默认任务。dialogue 类两个子任务仍按有没有附件反推
   *  （resolveDialogueTask 上有说明为什么这俩不用改）。 */
  const categoryTasks = selectedModel ? modelCategoryTasks(selectedModel, selectedCategory) : EXPERIENCE_CATEGORY_TASKS[selectedCategory]
  const categoryDefaultTask = EXPERIENCE_CATEGORY_DEFAULT_TASK[selectedCategory]
  const storedTask = single.task
  const effectiveTask: ExperienceTaskType = isDialogue
    ? resolveDialogueTask(attachment ? attachmentKindFromMime(attachment.uploaded.mime) : null)
    : storedTask && categoryTasks.includes(storedTask)
      ? storedTask
      : categoryTasks.includes(categoryDefaultTask)
        ? categoryDefaultTask
        : categoryTasks[0]
  const needsFileTask = !isDialogue && taskNeedsFile(effectiveTask)

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
  /** dialogue 类允许附哪种附件（§7.5）。对话类的音频附件在真实 task 枚举里没有对应的子任务
   *  （image_to_text/video_to_text 之外没有 audio 版本），先不开放，只开放能对应到真实
   *  任务枚举的图片/视频。image/audio/video 类不走这条通用回形针路径，改用 needsFileTask
   *  时的 TaskFileDropZone（taskAttachmentKind(effectiveTask) 决定收哪种）。
   *
   *  之前这里是写死的 ['image', 'video']，不看当前选中模型实际支不支持——纯文本模型
   *  （如 deepseek/deepseek-v4-pro，input_modalities 只有 text）照样能点回形针传图片，
   *  传上去请求里带不到模型那边，模型只能回"没看到图片"。改成按 modelSupportsAttachment
   *  过滤，模型不支持的附件类型直接不出现在回形针可选项里。 */
  const allowedAttachmentKinds: Array<keyof typeof ATTACHMENT_LIMITS> = useMemo(() => {
    if (!selectedModel) return []
    return (['image', 'video'] as const).filter((kind) => modelSupportsAttachment(selectedModel, kind))
  }, [selectedModel])

  /** composer 底部预估费用：与原型 estimatePlaygroundTaskSpend 对齐——按当前草稿估算 input token，
   *  输出 token 取 min(400, max_tokens) 上限估算（App.tsx:16967-16990） */
  const composerEstimatedSpend = useMemo(() => {
    if (!selectedModel) return '¥0.00'
    const inputPrice = Number(selectedModel.pricing?.input_per_1m ?? 0)
    const outputPrice = Number(selectedModel.pricing?.output_per_1m ?? 0)
    if (!inputPrice && !outputPrice) return '¥0.00'
    const systemPrompt = typeof chatParams.system_prompt === 'string' ? chatParams.system_prompt : ''
    const maxTokens = typeof chatParams.max_tokens === 'number' ? chatParams.max_tokens : 4096
    const inputTokens = estimateTokens(`${input}${systemPrompt}`)
    const outputTokens = Math.min(400, maxTokens)
    const spend = (inputTokens * inputPrice + outputTokens * outputPrice) / 1_000_000
    return spend === 0 ? '¥0.00' : `¥${spend.toFixed(4)}`
  }, [selectedModel, input, chatParams])

  useEffect(() => {
    const state = location.state as {
      selectedModelId?: string
      resumeSessionId?: string
      resumeConversationId?: string
    } | null
    // 目录还没回来时 allModels 是空数组，此刻既找不到目标模型、也**不能清 entry state**：
    // 清了之后列表加载完 effect 重跑，state 已空 → 落到下面的兜底选中 allModels[0]，
    // 于是「带某个模型跳进体验页」变成「进了目录第一个模型」（shared/modelgo_prd#300：
    // 搜 seek 点 DeepSeek V4 Flash 却进 Kimi K3——K3 正是目录第一个）。任何带模型的入口
    // （广场卡片/模型详情/登录回跳）在列表未就绪时都会中招，跟搜索无关。
    // 同理兜底选中也要等列表就绪，否则会先选错再被纠正，闪一下。
    if (!modelsQuery.isSuccess) return

    if (state?.selectedModelId) {
      const targetModel = allModels.find((m) => m.model_id === state.selectedModelId || m.id === state.selectedModelId)
      if (targetModel) {
        setSingle({ selectedId: targetModel.id, offlineModel: null, task: null })
        if (state.resumeSessionId) {
          // 从对比页「删到剩一列 / 退出对比」回来 = 继续保留列的既有会话（原型
          // exitComparison/removeCompareModel 都保留主列记录，shared/modelgo_prd#339），
          // 恢复会话消息而不是开新会话；只恢复保留列那条 conversation 的消息
          void openHistorySession(state.resumeSessionId, state.resumeConversationId)
        } else {
          // 从模型广场/详情页/登录跳转带 selectedModelId 进来 = 用户显式选了要体验的模型，
          // 语义等同 handlePick 换模型，同样要开新会话，不能沿用上一个模型遗留的旧对话
          startNewSession()
        }
      }
      // 到这里目录已就绪：找到了就已消费、没找到就是真的没这个模型，两种情况都该清掉 state，
      // 免得它一直挂在 history 上，用户下次前进/后退回来又被套用一次
      navigate('/models/playground', { replace: true, state: {} })
    } else if (!selectedId && allModels[0]) {
      setSelectedId(allModels[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allModels, selectedId, setSelectedId, location.state, navigate, modelsQuery.isSuccess])

  // 会话按租户隔离，切换租户后旧 conversationId 在新租户下已不存在，继续发消息会打到
  // POST .../experience/conversations/{旧id}/messages 上被后端 404「资源不存在」拒绝
  // （shared/modelgo_prd#296 实测）。跟模型选择一样，这类跨边界的状态必须在边界变化
  // 时清掉，不能指望它自己失效。首次挂载时 tenantId 从空变成初始值不算「切换」，跳过。
  const prevTenantIdRef = useRef(tenantId)
  useEffect(() => {
    if (prevTenantIdRef.current && prevTenantIdRef.current !== tenantId) {
      startNewSession()
    }
    prevTenantIdRef.current = tenantId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

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
          task: experienceTaskLabel(session.task as Parameters<typeof experienceTaskLabel>[0]) ?? session.task,
          // GET /experience/sessions 列表响应不带 conversations，改用轻量 models 字段（qa#535 已修复）；
          // conversations 只在创建/详情响应里出现，两边都兼容一下，session.models 优先
          models: session.models
            ? session.models.map((modelId) => {
                const catalogModel = allModels.find((m) => m.model_id === modelId)
                return {
                  id: modelId,
                  name: catalogModel ? prettyModelName(catalogModel.display_name, catalogModel.model_id, catalogModel.vendor ?? catalogModel.provider) : modelId,
                  offline: !catalogModel,
                }
              })
            : (session.conversations ?? [])
                .slice()
                .sort((a, b) => a.position - b.position)
                .map((conv) => {
                  const catalogModel = allModels.find((m) => m.model_id === conv.model_id)
                  return {
                    id: conv.model_id,
                    name: catalogModel ? prettyModelName(catalogModel.display_name, catalogModel.model_id, catalogModel.vendor ?? catalogModel.provider) : conv.model_id,
                    offline: !catalogModel,
                  }
                }),
        })),
      )
    } catch {
      // 历史列表拉取失败不阻塞主流程，侧栏保持空态
    }
  }

  /** 双击重命名（HistorySessionSidebar）：乐观更新 + 失败回滚，name 传空串会清空标题交回自动命名 */
  async function renameHistorySession(id: string, name: string) {
    const prev = historySessions
    setHistorySessions((cur) => cur.map((s) => (s.id === id ? { ...s, name } : s)))
    try {
      await renameExperienceSession(id, name)
    } catch {
      setHistorySessions(prev)
      appToast.error(t('modelsExperience.historySidebar.renameError'))
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

  /** 选模型（+ 可选显式选定的任务，来自 ModelPickerDialog「可体验任务」按钮组）。
   *  没传 task 时（直接点模型行）沿用 PRD selectModelTask 的默认规则：新模型如果还支持
   *  当前任务就沿用，否则退化到新模型所在类别的第一个任务。 */
  function handlePick(model: CatalogModelItem, task?: ExperienceTaskType) {
    trackEvent('playground_model_select', { from_model_id: selectedModel?.model_id ?? '', to_model_id: model.model_id }, { result: 'success' })
    const nextCategory = resolveModelCategory(model)
    const nextTasks = modelCategoryTasks(model, nextCategory)
    const nextTask = task && nextTasks.includes(task)
      ? task
      : nextTasks.includes(effectiveTask)
        ? effectiveTask
        : nextTasks[0]
    setSingle({ selectedId: model.id, offlineModel: null, task: nextTask })
    setPickerOpen(false)
    // 换模型 = 当前列绑定的模型变了，旧会话的列已经对不上——开新会话，而不是复用旧 conversationId
    startNewSession()
    window.setTimeout(() => inputRef.current?.focus(), 80)
  }

  /** 页面级「可体验任务」切换：广场标着图片输入的生成类模型（如 gemini-3.1-flash-lite-image）
   *  进来默认 text_to_*，此前任务切换只藏在 ModelPickerDialog 里，页面上没有任何入口能切到
   *  image_to_image/image_to_video，用户会误以为"标签支持图片却传不了图"。task 建会话时已
   *  写死（ensureConversation），切任务必须开新会话（与选择器路径 handlePick 语义一致）；
   *  附件的类型校验按 task 走，一并清掉；输入草稿最值钱，保留。 */
  function handleTaskSwitch(task: ExperienceTaskType) {
    if (task === effectiveTask) return
    clearAttachment()
    setSingle({ task })
    const draft = input
    startNewSession()
    setInput(draft)
  }

  async function openHistorySession(id: string, onlyConversationId?: string) {
    if (!id) return
    const session = historySessions.find((s) => s.id === id)
    try {
      const { items: allItems } = await getExperienceSessionMessages(id)
      // 从对比页 resume 回来时会话里可能残留其他对比列的消息，只取保留列那条 conversation 的
      const items = onlyConversationId
        ? allItems.filter((m) => m.conversation_id === onlyConversationId)
        : allItems
      const restored: ExperienceMessage[] = await Promise.all(items.map(async (msg) => {
        const { media, hasFailures } = await resolveExperienceMessageMedia(msg.attachments)
        return {
          role: msg.role,
          content: msg.content,
          dispatchId: msg.dispatch_id,
          error: msg.status === 'failed' ? cleanErrorMessage(msg.error) : undefined,
          media: media.length > 0 ? media : undefined,
          attachmentResourceIds: msg.role === 'user' && msg.attachments.length > 0
            ? msg.attachments.map((attachment) => attachment.resource_id)
            : undefined,
          attachmentLoadFailed: msg.attachments.length > 0 && hasFailures,
        }
      }))
      setSessionId(id)
      const conv = onlyConversationId ?? items.find((m) => m.conversation_id)?.conversation_id ?? null
      setConversationId(conv)
      setMessages(restored)
      // 模型条要切到这次会话真正用的模型（PRD §AC-18）：还在目录里就正常选中，
      // 已下线/删除就落到占位态——此前这里完全没处理，恢复历史后模型条会停在
      // 切历史前选中的模型上，跟消息区实际内容对不上。
      // 会话用的是哪个模型，优先从消息里反查；消息没带 model_id 时（只有用户消息、
      // 或后端该字段为空）退回会话列表项自带的 models[0]。
      // 缺这层兜底时两个 setSingle 分支都不进 → selectedId 保持原样，而本 store 是
      // 非 persist 的、刷新后 selectedId 为 null → selectedModel 回落到 allModels[0]，
      // 表现就是「刷新后点任何一个历史对话，模型条永远显示目录第一个模型」
      // （shared/modelgo_prd#300 报单人补充的场景）
      const sessionModelId = session?.models?.[0]?.id
      const restoredModelId = items.find((m) => m.model_id)?.model_id ?? sessionModelId
      const catalogModel = restoredModelId
        ? allModels.find((m) => m.model_id === restoredModelId || m.id === restoredModelId)
        : undefined
      // task 清回 null 退化到类别默认——恢复的历史会话真实用的哪个子任务不好从消息列表反推，
      // 这里不猜；反正 conversationId 已经从历史带出来了，composer 只影响新一轮怎么发，
      // 不影响已发生的历史内容展示
      if (catalogModel) {
        setSingle({ selectedId: catalogModel.id, offlineModel: null, task: null })
      } else if (restoredModelId) {
        setSingle({ selectedId: null, offlineModel: offlineModelPlaceholder(restoredModelId), task: null })
      }
      setInput('')
      setChatParams({})
      setSessionStats({ requestCount: 0, tokens: 0, cost: 0 })
      trackEvent('playground_history_action', {
        action: 'restore',
        history_age_bucket: session ? historyAgeBucket(session.updatedAt) : 'unknown',
      }, { result: 'success' })
    } catch (err) {
      applyGlobalError(`${t('modelsExperience.historyLoadFailed')}${(err as Error).message || t('modelsExperience.retryLater')}`)
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
      if (savedConfig) setChatParams(normalizeChatParams(savedConfig.config))
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
      // 会话未建好前（懒创建，见 ensureConversation）没有 sessionId 可挂载配置，
      // 本地 chatParams 已经生效（会用于下一次请求），这里静默跳过持久化即可，不算失败
      if (sessionId && selectedModel) {
        saveExperienceModelConfig(sessionId, selectedModel.model_id, next).catch((err) => {
          appToast.requestError(err, t('modelsExperience.settings.saveFailed'))
        })
      }
      return next
    })
  }

  function handleResetChatParams() {
    trackEvent('playground_settings_action', { action: 'reset' })
    setChatParams({})
    if (sessionId && selectedModel) {
      resetExperienceModelConfig(sessionId, selectedModel.model_id).catch((err) => {
        appToast.requestError(err, t('modelsExperience.settings.resetFailed'))
      })
    }
  }

  function clearAttachment(revokePreview = true) {
    setAttachment((prev) => {
      if (prev && revokePreview) URL.revokeObjectURL(prev.previewUrl)
      return null
    })
    setAttachmentError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  /**
   * 发送时先保留本地 blob 预览，直到 resource_id 的短期 URL 可用再替换并释放它；
   * 不能在 clearAttachment 时直接 revoke，否则刚插入消息列表的 img/audio/video 会变空白。
   */
  function replaceMessageAttachmentPreview(
    dispatchId: string,
    currentAttachment: { previewUrl: string; uploaded: ExperienceAttachment },
  ) {
    transientPreviewUrlsRef.current.add(currentAttachment.previewUrl)
    void resolveExperienceMessageMedia([currentAttachment.uploaded]).then(({ media }) => {
      if (media.length === 0) return
      URL.revokeObjectURL(currentAttachment.previewUrl)
      transientPreviewUrlsRef.current.delete(currentAttachment.previewUrl)
      setMessages((prev) => prev.map((message) => (
        message.role === 'user' &&
        message.dispatchId === dispatchId &&
        message.attachmentResourceIds?.includes(currentAttachment.uploaded.resource_id)
          ? { ...message, media }
          : message
      )))
    })
  }

  /** 上传附件（§7.5）：先按类型/大小校验，通过了才真的上传；会话已建好后不能再换类别的附件类型
   *  （task 已经固定），这里按当前入口（dialogue 通用回形针 or needs-file 任务专门上传区）
   *  各自的允许类型校验——两条入口共用同一个上传状态与后端调用，不重复造一遍 */
  async function handleFileSelect(file: File | null | undefined) {
    if (!file) return
    setAttachmentError(null)
    const kind = attachmentKindFromMime(file.type)
    const permittedKinds = isDialogue ? allowedAttachmentKinds : ([taskAttachmentKind(effectiveTask)].filter(Boolean) as Array<keyof typeof ATTACHMENT_LIMITS>)
    // 单模型页只服务当前一个模型列，§10.3 的 supporting/unsupported_model_count 在这里恒为 1/0
    if (!kind || !permittedKinds.includes(kind)) {
      setAttachmentError(`${t('modelsExperience.attachmentUnsupported')}${permittedKinds.map((k) => attachmentLimitLabel(k)).join(t('modelsExperience.listSeparator'))}`)
      if (fileInputRef.current) fileInputRef.current.value = ''
      trackEvent('playground_attachment_result', {
        kind: kind ?? 'unknown', size_bucket: sizeBucket(file.size), result: 'fail',
        supporting_model_count: 0, unsupported_model_count: 1, distribution_mode: 'single',
      })
      return
    }
    if (file.size > ATTACHMENT_LIMITS[kind].maxBytes) {
      setAttachmentError(t('modelsExperience.attachmentTooLarge', { limit: attachmentLimitLabel(kind) }))
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
    if (!selectedModel) throw new Error(t('modelsExperience.noModelSelected'))
    const session = await createExperienceSession({
      // name 传空串：后端会在首条用户提问落库时用其前 15 字自动生成标题，
      // 传非空值会被判定为「已显式命名」，反而挡住自动标题
      name: '',
      category: selectedCategory,
      task: effectiveTask,
      // 单模型体验没有"多列同步"概念，用 independent（真实枚举见 experience-sessions.ts 注释）
      input_mode: 'independent',
      models: [selectedModel.model_id],
    })
    setSessionId(session.id)
    const convId = session.conversations?.[0]?.id ?? null
    setConversationId(convId)
    if (!convId) throw new Error(t('modelsExperience.sessionCreateError'))
    // 会话是发首条消息时才懒创建的，用户先开设置改参数（最常见的先配后聊）时
    // handleChatParamChange 只改了本地、静默跳过了持久化（当时没有 sessionId 可挂）——
    // 这里建完会话必须把暂存参数回填到后端，且要 await：参数（含 system_prompt）是
    // 后端从会话 config 读的、不随消息体走，首条消息打到模型前 config 必须已就位
    // （shared/modelgo_prd#315 的第二条失效路径）。回填失败不阻塞发送，提示用户即可。
    if (Object.keys(chatParams).length > 0) {
      try {
        await saveExperienceModelConfig(session.id, selectedModel.model_id, chatParams)
      } catch (err) {
        appToast.requestError(err, t('modelsExperience.settings.saveFailed'))
      }
    }
    return convId
  }

  async function sendPrompt() {
    const prompt = input.trim()
    // 语音识别没有文本框（内容看有没有上传音频），其余任务必须有文本才能发
    if (!selectedModel || isStreaming || isBlockedByBalance || isOfflineModel(selectedModel)) return
    if (effectiveTask !== 'audio_to_text' && !prompt) return
    // needs-file 任务前端预检（PRD App.tsx:18407-18410 逐字对齐）：没附件直接拦，不用等
    // 后端 PLAYGROUND_ATTACHMENT_REQUIRED 才提示，下面 catch 里的兜底仍保留
    if (needsFileTask && !attachment) {
      setAttachmentError(effectiveTask === 'audio_to_text' ? t('modelsExperience.attachmentRequiredAudio') : t('modelsExperience.attachmentRequiredImage'))
      return
    }
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
    const currentAttachment = attachment
    const attachedKind = currentAttachment ? attachmentKindFromMime(currentAttachment.uploaded.mime) : null
    const userMedia = currentAttachment ? [{ kind: attachedKind ?? 'image', url: currentAttachment.previewUrl }] : undefined
    const resourceIds = currentAttachment ? [currentAttachment.uploaded.resource_id] : []
    clearAttachment(false)
    setMessages((prev) => [...prev, {
      role: 'user', content: prompt, dispatchId, media: userMedia,
      attachmentResourceIds: resourceIds.length > 0 ? resourceIds : undefined,
    }, { role: 'assistant', content: '', dispatchId }])
    if (currentAttachment) replaceMessageAttachmentPreview(dispatchId, currentAttachment)
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

      const modelLabel = prettyModelName(selectedModel.display_name, selectedModel.model_id, selectedModel.vendor ?? selectedModel.provider)
      if (stats) {
        const s: ExperienceStatsEvent = stats
        const spend = Number(s.actual_spend ?? s.estimated_spend ?? 0)
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant') {
            next[next.length - 1] = {
              ...last,
              error: s.status === 'failed' ? (last.content ? undefined : t('modelsExperience.modelRunFailed')) : undefined,
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
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      applyAssistant(() => '')
      const errorCode = (err as { data?: { code?: string } } | undefined)?.data?.code
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') {
          next[next.length - 1] = { ...last, error: `${t('modelsExperience.requestFailed')}${extractApiErrorMessage(err)}` }
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
      // 放 finally 而不是 try 末尾：会话是 ensureConversation 懒创建的，创建成功但模型调用
      // 失败时也已经落库了，只在成功路径刷新会导致这条会话在侧栏里不存在，要手动刷浏览器
      // 才出现（需求方 shared#346）。成功路径同样需要它来同步自动生成的标题与排序。
      void refreshHistorySessions()
    }
  }

  /** 媒体任务发送（§5.2 同步 JSON / §5.3-5.4 视频异步轮询）。图生图/语音识别/图生视频这类
   *  "必须携带附件"的任务，sendPrompt 里已经前端预检过一遍（对齐 PRD App.tsx:18407-18410），
   *  这里走到时按理已经有附件；万一漏网（比如并发清空），后端仍会拒绝
   *  （PLAYGROUND_ATTACHMENT_REQUIRED），报错走下面统一的 catch 兜底。 */
  async function sendMediaPrompt(
    prompt: string,
    dispatchId: string,
    retry?: { resourceIds: string[]; media?: ExperienceMessage['media'] },
  ) {
    if (!selectedModel) return
    const modelLabel = prettyModelName(selectedModel.display_name, selectedModel.model_id, selectedModel.vendor ?? selectedModel.provider)
    const currentAttachment = attachment
    // 用发送这一刻的任务/参数配置算标题明细（PRD §7.10 artifact.title/detail）——响应回来前
    // 用户可能已经切了任务/改了设置，不能等异步结果回来时再读当前 state，会算错这轮的规格。
    const taskAtSend = effectiveTask
    const chatParamsAtSend = chatParams
    const artifactTitle = buildMediaArtifactTitle(prompt, currentAttachment?.file.name, taskAtSend)
    const attachedKind = currentAttachment ? attachmentKindFromMime(currentAttachment.uploaded.mime) : null
    const userMedia = retry ? retry.media : currentAttachment ? [{ kind: attachedKind ?? 'image', url: currentAttachment.previewUrl }] : undefined
    const resourceIds = retry ? retry.resourceIds : currentAttachment ? [currentAttachment.uploaded.resource_id] : []
    if (!retry) clearAttachment(false)
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: prompt, dispatchId, media: userMedia, attachmentResourceIds: resourceIds.length ? resourceIds : undefined },
      { role: 'assistant', content: '', dispatchId },
    ])
    if (currentAttachment && !retry) replaceMessageAttachmentPreview(dispatchId, currentAttachment)
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
        // 跳转链接携带 task_id，命中 /logs 页 AsyncTasksPanel 的 gateway_request_id 精确匹配自动展开详情（同 qa#14 逻辑）
        applyResult({ content: `${t('modelsExperience.videoGenerating')}[${t('modelsExperience.videoGeneratingLink')}](/logs?task_id=${encodeURIComponent(message.async_task_id)})…` })
        void pollVideoMessage(convId, message.id, modelLabel, selectedModel.model_id, artifactTitle, taskAtSend, chatParamsAtSend)
        return
      }

      const media = message.attachments.map((a, i) => ({
        kind: a.kind,
        url: attachment_urls[a.resource_id] ?? '',
        title: artifactTitle,
        detail: buildMediaArtifactDetail(taskAtSend, chatParamsAtSend, i),
      }))
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
    } catch (err) {
      applyResult({ error: `${t('modelsExperience.requestFailed')}${extractApiErrorMessage(err)}` })
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
      // 同对话路径（shared#346）：懒创建的会话在模型调用失败时也已落库，成功失败都要同步侧栏
      void refreshHistorySessions()
    }
  }

  /** 媒体结果失败重试（PRD §AC-13）：原样复用失败那条用户消息的文本与附件 resource_id，
   *  不要求用户重新输入/重新上传一遍 */
  function retryMediaMessage(userMessage: ExperienceMessage) {
    if (!userMessage.content || isStreaming || isBlockedByBalance || !selectedModel) return
    const dispatchId = crypto.randomUUID()
    void sendMediaPrompt(userMessage.content, dispatchId, {
      resourceIds: userMessage.attachmentResourceIds ?? [],
      media: userMessage.media,
    })
  }

  /** 视频异步任务轮询（§5.4）：running 继续轮询，succeeded/failed 为终态 */
  async function pollVideoMessage(
    conversationId: string,
    messageId: string,
    modelLabel: string,
    modelId: string,
    artifactTitle: string,
    task: ExperienceTaskType,
    chatParamsAtSend: Record<string, unknown>,
  ) {
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
            return [...next.slice(0, -1), { ...last, error: message.error ? cleanErrorMessage(message.error) : t('modelsExperience.videoGenerateFailed'), content: '' }]
          }
          const media = message.attachments.map((a, i) => ({
            kind: a.kind,
            url: attachment_urls[a.resource_id] ?? '',
            title: artifactTitle,
            detail: buildMediaArtifactDetail(task, chatParamsAtSend, i),
          }))
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
      <PageHeader title={t('modelsExperience.page.title')} description={t('modelsExperience.page.description')} className="mb-4" />
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
          onRenameSession={(id, name) => void renameHistorySession(id, name)}
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
                  onClick={(e) => {
                    trackEvent('playground_model_picker_open', { picker_type: 'single', browse_category: selectedCategory })
                    setPickerAnchor(e.currentTarget)
                    setPickerOpen(true)
                  }}
                >
                  {selectedModel && (
                    <>
                      {isOfflineModel(selectedModel) ? (
                        <span className="models-experience-model-avatar is-offline">!</span>
                      ) : (
                        <ModelIcon model={selectedModel} size={32} rounded="rounded-md" />
                      )}
                      <div className="min-w-0">
                        <div className="models-experience-modelbar-title">
                          {isOfflineModel(selectedModel) ? t('modelsExperience.modelOffline') : prettyModelName(selectedModel.display_name, selectedModel.model_id, selectedModel.vendor ?? selectedModel.provider)}
                        </div>
                        <div className="models-experience-modelbar-sub">
                          {selectedModel.vendor || selectedModel.provider || 'ModelGo'} · {experienceTaskLabel(effectiveTask)}
                        </div>
                      </div>
                      {isOfflineModel(selectedModel) ? (
                        <span className="models-experience-price-chip is-offline">{t('modelsExperience.modelOffline')}</span>
                      ) : (
                        <span className="models-experience-price-chip">
                          {dualPriceText(selectedModel)}
                        </span>
                      )}
                      <LuChevronDown size={15} className="text-mg-text-3 shrink-0" />
                    </>
                  )}
                </button>

                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    className="models-experience-icon-btn"
                    aria-label={t('modelsExperience.openApiCall')}
                    disabled={!selectedModel || isOfflineModel(selectedModel)}
                    title={selectedModel ? (isOfflineModel(selectedModel) ? t('modelsExperience.modelOffline') : t('modelsExperience.viewApiExample', { name: prettyModelName(selectedModel.display_name, selectedModel.model_id, selectedModel.vendor ?? selectedModel.provider) })) : t('modelsExperience.openApiCall')}
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
                    aria-label={t('modelsExperience.openModelSettings')}
                    disabled={!selectedModel || isOfflineModel(selectedModel)}
                    title={selectedModel ? (isOfflineModel(selectedModel) ? t('modelsExperience.modelOffline') : t('modelsExperience.configureModel', { name: prettyModelName(selectedModel.display_name, selectedModel.model_id, selectedModel.vendor ?? selectedModel.provider) })) : t('modelsExperience.openModelSettings')}
                    onClick={() => void openSettings()}
                  >
                    <LuSettings2 size={14} />
                  </button>
                  {/* qa#543：对比入口不再限对话类——PRD §6.2/§7.3 要求图像/音频/视频也能进入对比 */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-md"
                    onClick={() => {
                      trackEvent('playground_model_picker_open', { picker_type: 'compareAdd', browse_category: selectedCategory })
                      setCompareAddOpen(true)
                    }}
                  >
                    <LuColumns2 size={13} /> {t('modelsExperience.modelCompare')}
                  </Button>
                </div>
              </div>

              <ExperienceMessageList
                messages={messages}
                isStreaming={isStreaming}
                isMediaTask={!isDialogue}
                isAsyncMediaTask={selectedCategory === 'video'}
                onRetry={retryMediaMessage}
                assistantModel={selectedModel}
                emptyState={
                  <div className="models-experience-empty">
                    {(() => {
                      const EmptyIcon = categoryEmptyCopy(effectiveTask).icon
                      return <EmptyIcon size={20} />
                    })()}
                    <strong>{categoryEmptyCopy(effectiveTask).title}</strong>
                    <span>{categoryEmptyCopy(effectiveTask).hint}</span>
                    {isDialogue && (
                      <div className="models-experience-sample-row">
                        {playgroundSamplePrompts().map((sample) => (
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
                    <strong>{t('modelsExperience.balanceInsufficientTitle')}</strong>
                    {t('modelsExperience.balanceInsufficientHint')}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      trackEvent('playground_recharge_click', { locked_model_count: 1 })
                      navigate('/billing', { state: { entrySource: 'recharge_cta' } })
                    }}
                  >
                    {t('modelsExperience.recharge')}
                  </button>
                </div>
              )}

              {/* 下线模型（PRD §AC-18，对齐原型 App.tsx:18634-18641）：composer 整体替换为
                  提示，禁止发送，用户需从上方模型条更换同任务在线模型后继续。 */}
              {selectedModel && isOfflineModel(selectedModel) && (
                <div className="playground-balance-notice" role="status">
                  <LuTriangleAlert size={15} />
                  <span>
                    <strong>{t('modelsExperience.modelOffline')}</strong>
                    {t('modelsExperience.modelOfflineHint')}
                  </span>
                </div>
              )}

              {/* 页面级「可体验任务」切换（原型 PlaygroundCapabilitySwitch 的落地位——
                  .models-task-switch 样式当初就按"选中项决定下方 TaskFileDropZone"设计，
                  但组件此前只挂在 ModelPickerDialog 里，页面上无入口）。dialogue 类子任务
                  由附件反推（resolveDialogueTask），不渲染；<2 个任务时组件自身返回 null。 */}
              {!isSelectedModelOffline && !isDialogue && (
                <TaskSwitch tasks={categoryTasks} value={effectiveTask} onChange={handleTaskSwitch} />
              )}

              {/* 附件预览/错误（§7.5，仅 dialogue 类走通用回形针）：每轮最多一个附件，发送后清空 */}
              {!isSelectedModelOffline && isDialogue && (attachment || attachmentError) && (
                <div className="models-experience-attachment-row">
                  {attachment && (
                    <div className="models-experience-attachment-chip">
                      {attachmentKindFromMime(attachment.uploaded.mime) === 'image' ? (
                        <img src={attachment.previewUrl} alt={t('modelsExperience.attachmentPreview')} />
                      ) : (
                        <span className="models-experience-attachment-name">{attachment.file.name}</span>
                      )}
                      <button type="button" aria-label={t('modelsExperience.removeAttachment')} onClick={() => clearAttachment()}>
                        <LuX size={12} />
                      </button>
                    </div>
                  )}
                  {attachmentError && <span className="models-experience-attachment-error">{attachmentError}</span>}
                </div>
              )}

              {/* needs-file 任务(image_to_image/audio_to_text/image_to_video) 的专门上传区，
                  替换掉回形针（PRD PlaygroundTaskInput App.tsx:19877-19929 逐字对齐，
                  2026-07-29 本地起 PRD 原型用 ego-lite 实测过） */}
              {!isSelectedModelOffline && needsFileTask && (
                <TaskFileDropZone
                  task={effectiveTask}
                  file={attachment ? { name: attachment.file.name, sizeBytes: attachment.file.size, previewUrl: attachment.previewUrl } : null}
                  error={attachmentError}
                  uploading={attachmentUploading}
                  onFileChange={(file) => void handleFileSelect(file)}
                  onRemove={clearAttachment}
                />
              )}

              {/* PRD §7.2：单模型状态不展示"同步输入"开关、不展示"清空结果"按钮、不重复展示模型ID复制入口。
                  底部动作行左侧是预估费用（原型 App.tsx:18523 playground-composer-hint 逐字对齐）+ 附件入口
                  （§7.5，纯文本任务不显示附件入口——对话类允许图片/视频回形针，needs-file 任务改用上面的
                  专门上传区，text_to_image/text_to_audio/text_to_video 都没有附件入口）。
                  下线模型不渲染这一套，composer 区域整体换成上面的下线提示（PRD §AC-18）。 */}
              {!isSelectedModelOffline && (
                <>
                  {isDialogue && (
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={allowedAttachmentKinds.map((k) => ATTACHMENT_LIMITS[k].accept).join(',')}
                      className="hidden"
                      onChange={(e) => void handleFileSelect(e.target.files?.[0])}
                    />
                  )}
                  <Composer
                    ref={inputRef}
                    value={input}
                    onChange={setInput}
                    onSend={sendPrompt}
                    isStreaming={isStreaming}
                    disabled={isBlockedByBalance}
                    onStop={() => abortRef.current?.abort()}
                    placeholder={effectiveTask === 'image_to_image' ? t('modelsExperience.taskPlaceholder.image_to_image') : categoryPlaceholder(selectedCategory)}
                    sendLabel={t('modelsExperience.send')}
                    className="models-experience-composer-wrap"
                    sendEnabled={effectiveTask === 'audio_to_text' ? !!attachment : undefined}
                    textareaSlot={effectiveTask === 'audio_to_text' ? (
                      <div className="models-task-transcribe-ready">{t('modelsExperience.transcribeReady')}</div>
                    ) : undefined}
                    activeChip={
                      isDialogue ? (
                        <div className="models-experience-composer-left">
                          {allowedAttachmentKinds.length > 0 && (
                            <button
                              type="button"
                              className="models-experience-icon-btn"
                              aria-label={t('modelsExperience.addAttachment')}
                              title={`${t('modelsExperience.attachmentSupports')}${allowedAttachmentKinds.map((k) => attachmentLimitLabel(k)).join(t('modelsExperience.listSeparator'))}`}
                              disabled={attachmentUploading || !!attachment}
                              onClick={() => fileInputRef.current?.click()}
                            >
                              <LuPaperclip size={14} />
                            </button>
                          )}
                          <span className="models-experience-composer-hint">
                            {attachmentUploading ? t('modelsExperience.attachmentUploading') : (
                              <>{t('modelsExperience.estimatedSpend')} <strong>{composerEstimatedSpend}</strong></>
                            )}
                          </span>
                        </div>
                      ) : (
                        <span className="models-experience-composer-hint">
                          {t('modelsExperience.estimatedSpend')} <strong>{composerEstimatedSpend}</strong>
                        </span>
                      )
                    }
                  />
                </>
              )}
            </section>
          </div>
        </div>
      </div>

      <ModelPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        anchorEl={pickerAnchor}
        mode="single"
        models={allModels}
        isBalanceZero={isBalanceZero}
        onSelect={handlePick}
        currentTask={effectiveTask}
        requiredAttachmentKind={attachment ? attachmentKindFromMime(attachment.uploaded.mime) : null}
      />

      {selectedModel && (
        <ModelSettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          modelName={prettyModelName(selectedModel.display_name, selectedModel.model_id, selectedModel.vendor ?? selectedModel.provider)}
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
          modelName={prettyModelName(selectedModel.display_name, selectedModel.model_id, selectedModel.vendor ?? selectedModel.provider)}
          modelId={selectedModel.model_id}
          supportedProtocols={selectedModel.protocols?.length ? (selectedModel.protocols as never) : ['openai']}
          onAction={(action, protocol, language) => trackEvent('playground_api_modal_action', { action, protocol, language, model_id: selectedModel.model_id })}
        />
      )}

      {/* PRD §7.3：单模型点「模型对比」打开统一候选弹窗，可勾选第 2/3 个模型；
          当前模型固定展示为「已选模型」不可取消；确认后一次性带着完整模型组进入对比页。
          shared/modelgo_prd#335：与模型广场共用 ModelsCompareModal —— 原型里这两处本来
          就是同一个 MarketplaceCompareModal，移植时被拆成了两个组件、样式跟着分叉。 */}
      {selectedModel && (
        <ModelsCompareModal
          isOpen={compareAddOpen}
          onClose={() => setCompareAddOpen(false)}
          allModels={allModels}
          lockedIds={[selectedModel.id]}
          maxSelectable={3}
          isBalanceZero={isBalanceZero}
          anchorCategory={selectedCategory}
          anchorTask={effectiveTask}
          onConfirmAdd={(added) => {
            if (added.length === 0) return
            trackEvent('playground_compare_enter', { sidebar_was_collapsed: historyCollapsed })
            navigate('/models/compare', { state: { selectedIds: [selectedModel.id, ...added.map((m) => m.id)], compareTask: effectiveTask } })
          }}
        />
      )}
    </div>
  )
}
