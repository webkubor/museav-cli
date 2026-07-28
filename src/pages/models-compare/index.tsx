/**
 * 模型对比工作台（PRD 1.0.4 模型体验 §7.3/7.4/8.1-8.3）。
 * 真源：飞书《ModelGo Console 重构 PRD：模型体验页面（v0.1）》+ 后端
 * 《模型体验(Playground V1)前端接口文档》2026-07-27 + Swagger（modelgo-web-api）核实到的
 * 真实列级端点（PRD 接口文档 §3.8 对应的表格在飞书内嵌 sheet 里，工具权限读不到，
 * 是从 https://modelgo-web-api.test.modelgo.com/swagger/doc.json 里查到 POST/PATCH/DELETE
 * .../conversations 和 .../configs 的真实路径与请求体形状，不是瞎猜）。
 *
 * 入口：只接受从单模型页「模型对比」确认后的 navigate state（selectedIds，2-3 个
 * 目录 model.id）。刷新本页或直接输入 URL 没有历史恢复（§7.8 的会话恢复目前只覆盖
 * 单模型页，对比会话的 URL/会话 ID 级恢复不在本轮范围）。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  LuColumns2, LuChevronDown, LuCode, LuSettings2, LuX, LuPlus, LuLogOut, LuTriangleAlert, LuPaperclip,
} from 'react-icons/lu'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Switch'
import { Composer } from '@/components/ui/Composer'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useModels } from '@/features/models/hooks/useModels'
import { prettyModelName, cn } from '@/lib/utils'
import type { CatalogModelItem } from '@/types'
import {
  createExperienceSession,
  streamExperienceMessage,
  sendExperienceMediaMessage,
  getExperienceMessage,
  addExperienceConversation,
  removeExperienceConversation,
  switchExperienceConversationModel,
  listExperienceModelConfigs,
  saveExperienceModelConfig,
  resetExperienceModelConfig,
  getExperienceSessionStats,
  matchesModelConfigId,
  listExperienceSessions,
  getExperienceSession,
  getExperienceSessionMessages,
  uploadExperienceAttachment,
  type ExperienceStatsEvent,
  type ExperienceMessageView,
  type ExperienceAttachment,
} from '@/services/experience-sessions'
import { useSidebarCollapseStore } from '@/store/use-sidebar-collapse-store'
import { useExperienceWorkbenchStore, type CompareColumnState } from '@/store/use-experience-workbench-store'
import { useAuthStore } from '@/store/auth'
import { useBalance, useBalanceBreakdown } from '@/hooks/use-balance'
import { calculateSpendableBalance } from '@/pages/billing/formatBalance'
import { trackEvent } from '@/lib/track'
import {
  isPaidModel,
  estimateTokens,
  formatPlaygroundLatency,
  dualPriceText,
  hashId,
  latencyBucket,
  tokenBucket,
  sizeBucket,
  cleanErrorMessage,
  extractApiErrorMessage,
  EXPERIENCE_TASK_LABEL,
  resolveModelCategory,
  EXPERIENCE_CATEGORY_LABEL,
  EXPERIENCE_CATEGORY_DEFAULT_TASK,
  CATEGORY_EMPTY_COPY,
  CATEGORY_PLACEHOLDER,
  ATTACHMENT_LIMITS,
  attachmentKindFromMime,
  type ExperienceMessage,
  type ExperienceCategoryKey,
} from '../models/model-experience-data'
import { ModelPickerDialog } from '../models/components/ModelPickerDialog'
import { ModelSettingsModal } from '../models/components/ModelSettingsModal'
import { ApiQuickCallModal } from '../models/components/ApiQuickCallModal'
import { ExperienceMessageList } from '../models/components/ExperienceMessageList'
import { HistorySessionSidebar, type HistorySessionItem } from '../models/components/HistorySessionSidebar'
import '../models/styles/model-experience-layout.css'
import '../models/styles/model-chat.css'
import '../models/styles/model-composer.css'
import '../models/styles/model-picker-dialog.css'
import '../models/styles/model-settings-modal.css'
import '../models/styles/api-quick-call-modal.css'
import './compare.css'

const MAX_COMPARE = 3

// 列状态类型跟着 store 里的 CompareColumnState 走（字段一致，别在这重复定义），
// 本地仍叫 ColumnState 是为了不用改文件里几十处已有引用。
type ColumnState = CompareColumnState

/** 单列发送时可选携带的附件（qa#545）：只有该列模型支持时调用方才会传入非空值，
 *  resourceIds 喂给后端接口，media 只用于用户消息气泡的预览渲染。 */
interface DispatchAttachment {
  resourceIds: string[]
  media?: Array<{ kind: string; url: string }>
}

export default function ModelsComparePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const collapseForCompare = useSidebarCollapseStore((s) => s.collapseForCompare)
  const restoreSavedPreference = useSidebarCollapseStore((s) => s.restoreSavedPreference)

  // qa#543：不再只筛对话类——同 models/index.tsx 的口径，取全量目录，候选资格判断交给
  // ModelPickerDialog 内部按 resolveModelCategory 过滤（同一级类别才能进同一组对比）。
  const { modelsQuery } = useModels()
  const allModels = useMemo(() => modelsQuery.data?.items ?? [], [modelsQuery.data?.items])

  // §9.1 余额资格状态机：与单模型页同口径，可消费合计为 0 时锁定付费模型列的发送
  const tenantId = useAuthStore((s) => s.activeTenantId) ?? ''
  const { data: balance } = useBalance(tenantId)
  const { data: balanceBreakdown } = useBalanceBreakdown(tenantId)
  const spendableBalance = calculateSpendableBalance(
    balance?.available?.amount,
    balanceBreakdown?.gift?.amount,
    balanceBreakdown?.reward?.amount,
  )
  const isBalanceZero = spendableBalance !== undefined && spendableBalance <= 0

  // 会话/列/统计跨路由持久化（qa#544）：改走模块级 zustand store，SPA 内路由切走（比如
  // 切去看账单）再切回不再清空；变量名保持不变，文件里后续几十处引用几乎不用改。
  const compare = useExperienceWorkbenchStore((s) => s.compare)
  const setCompare = useExperienceWorkbenchStore((s) => s.setCompare)
  const sessionId = compare.sessionId
  const setSessionId = (id: string | null) => setCompare({ sessionId: id })
  const columns = compare.columns
  const setColumns = (
    updater: ColumnState[] | null | ((prev: ColumnState[] | null) => ColumnState[] | null),
  ) => setCompare((s) => ({ columns: typeof updater === 'function' ? updater(s.columns) : updater }))
  const sessionStats = compare.sessionStats
  const setSessionStats = (
    stats: typeof compare.sessionStats | ((prev: typeof compare.sessionStats) => typeof compare.sessionStats),
  ) => setCompare((s) => ({ sessionStats: typeof stats === 'function' ? stats(s.sessionStats) : stats }))

  const [syncInput, setSyncInput] = useState(true)
  const [sharedDraft, setSharedDraft] = useState('')
  const [lastFocusedIndex, setLastFocusedIndex] = useState(0)
  const [bootError, setBootError] = useState<string | null>(null)

  // §7.8 历史会话侧栏（qa#546）：与单模型页一样是纯页面内 UI 状态，不需要跨路由持久化，
  // 收起态是初始态（对比页地产更紧张，默认收起，用户需要时自己展开）。
  const [historyCollapsed, setHistoryCollapsed] = useState(true)
  const [historySessions, setHistorySessions] = useState<HistorySessionItem[]>([])
  const [historyActionError, setHistoryActionError] = useState<string | null>(null)

  const [removeConfirmIndex, setRemoveConfirmIndex] = useState<number | null>(null)
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false)
  const [switchPickerIndex, setSwitchPickerIndex] = useState<number | null>(null)
  const [addPickerOpen, setAddPickerOpen] = useState(false)
  const [syncConfirm, setSyncConfirm] = useState<{ sourceIndex: number; sourceText: string } | null>(null)
  const [settingsIndex, setSettingsIndex] = useState<number | null>(null)
  const [apiIndex, setApiIndex] = useState<number | null>(null)
  // §8.5 窄屏一次展示一个模型列，顶部 Tab 切换；宽屏 CSS 直接把 tab 隐藏，不影响并排布局
  const [activeColumnIndex, setActiveColumnIndex] = useState(0)

  // §7.4/7.5 共享附件入口（qa#545）：只挂在同步共享 composer 上（独立输入模式每列各自
  // 打字，PRD 原文的"共享附件入口"是同步态概念，不为每列单独做附件入口）。每轮最多一个
  // 附件，纯页面内临时态，不需要跨路由持久化。
  const [attachment, setAttachment] = useState<{ file: File; previewUrl: string; uploaded: ExperienceAttachment } | null>(null)
  const [attachmentUploading, setAttachmentUploading] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const abortRefs = useRef<Array<AbortController | null>>([])
  const pendingByDispatch = useRef<Map<string, number>>(new Map())
  const bootedRef = useRef(false)

  // 进入对比页即代表已经从 1→N 模型；自动收起一次 Console 侧栏（幂等，重复调用不覆盖已记录的偏好）
  useEffect(() => {
    collapseForCompare()
    return () => restoreSavedPreference()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 建会话：只在首次拿到 selectedIds + 目录加载完成时建一次
  useEffect(() => {
    if (bootedRef.current) return
    const ids = (location.state as { selectedIds?: string[] } | null)?.selectedIds
    if (!ids || ids.length < 2 || allModels.length === 0) return
    bootedRef.current = true
    const resolved = ids.slice(0, MAX_COMPARE).map((id) => allModels.find((m) => m.id === id)).filter((m): m is CatalogModelItem => !!m)
    if (resolved.length < 2) {
      setBootError('传入的模型未找到或数量不足，无法进入对比')
      return
    }
    void bootSession(resolved)
    navigate(location.pathname, { replace: true, state: {} })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allModels])

  useEffect(() => () => abortRefs.current.forEach((c) => c?.abort()), [])

  // 列数变化（加/移除模型）后夹紧窄屏 Tab 的激活列，避免越界指向已不存在的列
  useEffect(() => {
    if (columns && activeColumnIndex >= columns.length) setActiveColumnIndex(0)
  }, [columns, activeColumnIndex])

  useEffect(() => {
    if (!historyCollapsed) void refreshHistorySessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyCollapsed])

  /**
   * 会话里引用的模型已不在当前目录（下线/删除）时的占位展示（§7.8 恢复态降级）。
   * 只用于渲染列头（名称/头像），不可用于真实发送——该列后续切换模型前操作会照常失败，
   * 这跟单模型页历史侧栏"部分模型已下线"角标是同一降级思路，只是这里要落到一个真实
   * CatalogModelItem 形状上才能喂给现有的列渲染逻辑。
   */
  function offlineModelPlaceholder(modelId: string): CatalogModelItem {
    return {
      id: modelId,
      model_id: modelId,
      display_name: modelId,
      modalities: [],
      tags: [],
      context_length: 0,
      max_output_tokens: 0,
      pricing: { input_per_1m: '0', output_per_1m: '0', cache_read_per_1m: '0', currency: 'CNY' },
      released_at: '',
      knowledge_cutoff: '',
      status: 'unavailable',
      logo_url: '',
    }
  }

  /** 拉取真实历史会话列表供侧栏展示，映射逻辑与单模型页一致（qa#546）。
   *  同单模型页注释：GET /experience/sessions 列表响应实测不带 conversations，
   *  这里模型 chip 老实留空，点开会话后走 getExperienceSession 详情接口才能拿到真实组合。 */
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

  /**
   * §7.8 对比页历史恢复：GET .../messages 是 session 粒度，单条消息自带 conversation_id，
   * 按它分组即可还原成每列各自的 history，不需要逐 conversation 再分别调接口。
   * conversations 组合要拿真实模型 id，走 GET 详情接口（列表响应不带 conversations）。
   */
  async function openHistorySession(id: string) {
    if (!id) return
    try {
      const [detail, { items: msgItems }] = await Promise.all([
        getExperienceSession(id),
        getExperienceSessionMessages(id),
      ])
      const convs = (detail.conversations ?? []).slice().sort((a, b) => a.position - b.position)
      if (convs.length === 0) throw new Error('该会话没有可恢复的模型列')
      const byConv = new Map<string, ExperienceMessageView[]>()
      for (const msg of msgItems) {
        const list = byConv.get(msg.conversation_id) ?? []
        list.push(msg)
        byConv.set(msg.conversation_id, list)
      }
      const nextColumns: ColumnState[] = convs.map((conv) => {
        const model = allModels.find((m) => m.model_id === conv.model_id) ?? offlineModelPlaceholder(conv.model_id)
        const convMessages = (byConv.get(conv.id) ?? []).slice().sort((a, b) => a.seq - b.seq)
        const history: ExperienceMessage[] = convMessages.map((msg) => ({
          role: msg.role,
          content: msg.content,
          error: msg.status === 'failed' ? cleanErrorMessage(msg.error) : undefined,
        }))
        return { model, conversationId: conv.id, history, streaming: false, draft: '', chatParams: {} }
      })
      bootedRef.current = true
      abortRefs.current = nextColumns.map(() => null)
      setActiveColumnIndex(0)
      setLastFocusedIndex(0)
      setSharedDraft('')
      setSessionId(id)
      setColumns(nextColumns)
      setSessionStats({ requestCount: 0, tokens: 0, cost: 0 })
      setBootError(null)
      setHistoryActionError(null)
      trackEvent('playground_history_action', { action: 'restore' }, { result: 'success' })
    } catch (err) {
      trackEvent('playground_history_action', { action: 'restore' }, { result: 'fail' })
      setHistoryActionError(`加载历史会话失败：${(err as Error).message || '请稍后重试'}`)
    }
  }

  /** §7.8 新建会话：对比页本身没有内嵌的"选模型"态（一直要求带 selectedIds 进场），
   *  退回单模型页重新走"选模型 → 模型对比"的标准入口，跟移除至单模型/退出对比同一归宿。 */
  function startNewSession() {
    bootedRef.current = false
    setSessionId(null)
    setColumns(null)
    setSessionStats({ requestCount: 0, tokens: 0, cost: 0 })
    setHistoryActionError(null)
    restoreSavedPreference()
    navigate('/models/playground')
  }

  async function bootSession(models: CatalogModelItem[]) {
    try {
      // qa#543：按首个模型推断一级类别（同组模型类别一致，picker 已保证），媒体类无附件
      // 场景下用该类别默认任务；对话类维持原 text_to_text
      const category = resolveModelCategory(models[0])
      const task = EXPERIENCE_CATEGORY_DEFAULT_TASK[category]
      const session = await createExperienceSession({
        name: '未命名会话',
        category,
        task,
        input_mode: syncInput ? 'sync' : 'independent',
        models: models.map((m) => m.model_id),
      })
      const convs = (session.conversations ?? []).slice().sort((a, b) => a.position - b.position)
      const nextColumns: ColumnState[] = models.map((model, idx) => ({
        model,
        conversationId: convs[idx]?.id ?? '',
        history: [],
        streaming: false,
        draft: '',
        chatParams: {},
      }))
      abortRefs.current = nextColumns.map(() => null)
      setSessionId(session.id)
      setColumns(nextColumns)
      setBootError(null)
    } catch (err) {
      setBootError(`创建对比会话失败：${(err as Error).message || '请稍后重试'}`)
    }
  }

  function updateColumn(idx: number, patch: Partial<ColumnState>) {
    setColumns((prev) => (prev ? prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)) : prev))
  }

  function applyAssistant(idx: number, updater: (content: string) => string) {
    setColumns((prev) =>
      prev
        ? prev.map((c, i) => {
            if (i !== idx) return c
            const next = [...c.history]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: updater(last.content) }
            return { ...c, history: next }
          })
        : prev,
    )
  }

  /** 单列发送——按该列模型的一级类别分叉（§6.2/§7.3/§7.9）：对话类走 SSE 流式，
   *  图像/音频类走同步媒体调用，视频类同步下发后转异步轮询。sync 模式下多列共用同一个
   *  dispatchId，用于事后计算最快/成本最低。 */
  async function sendOne(idx: number, prompt: string, dispatchId: string, attachment?: DispatchAttachment) {
    if (!columns) return
    const column = columns[idx]
    if (!column || column.streaming || !prompt) return
    const category = resolveModelCategory(column.model)
    if (category === 'dialogue') {
      await sendDialogueOne(idx, prompt, dispatchId, attachment)
    } else {
      await sendMediaOne(idx, prompt, dispatchId, attachment)
    }
  }

  async function sendDialogueOne(idx: number, prompt: string, dispatchId: string, attachment?: DispatchAttachment) {
    const column = columns![idx]
    updateColumn(idx, {
      streaming: true,
      history: [...column.history, { role: 'user', content: prompt, dispatchId, media: attachment?.media }, { role: 'assistant', content: '', dispatchId }],
    })
    abortRefs.current[idx]?.abort()
    const controller = new AbortController()
    abortRefs.current[idx] = controller
    const startedAt = Date.now()
    let stats: ExperienceStatsEvent | null = null

    try {
      const reply = await streamExperienceMessage({
        conversationId: column.conversationId,
        dispatchId,
        content: prompt,
        attachments: attachment?.resourceIds ?? [],
        signal: controller.signal,
        onDelta: (delta) => applyAssistant(idx, (content) => content + delta),
        onStats: (event) => { stats = event },
      })
      const modelLabel = prettyModelName(column.model.display_name, column.model.model_id)
      const hasStats = stats !== null
      const s = stats as ExperienceStatsEvent | null
      const totalMs = hasStats ? s!.total_ms : Date.now() - startedAt
      const inputTokens = hasStats ? s!.input_tokens : estimateTokens(prompt)
      const outputTokens = hasStats ? s!.output_tokens : estimateTokens(reply)
      const spend = hasStats ? Number(s!.actual_spend ?? s!.estimated_spend ?? 0) : 0
      const free = hasStats ? s!.free : (!Number(column.model.pricing?.input_per_1m ?? 0) && !Number(column.model.pricing?.output_per_1m ?? 0))
      const firstTokenMs = hasStats ? s!.first_token_ms : totalMs
      setColumns((prev) =>
        prev
          ? prev.map((c, i) => {
              if (i !== idx) return c
              const next = [...c.history]
              const last = next[next.length - 1]
              if (last?.role === 'assistant') {
                next[next.length - 1] = {
                  ...last,
                  metrics: {
                    model: modelLabel,
                    inputTokens,
                    outputTokens,
                    firstTokenLatency: formatPlaygroundLatency(firstTokenMs),
                    totalLatency: formatPlaygroundLatency(totalMs),
                    spend,
                    free,
                    totalMs,
                  },
                }
              }
              return { ...c, history: next }
            })
          : prev,
      )
      trackEvent('playground_model_run_result', {
        model_id: column.model.model_id,
        status: 'succeeded',
        latency_bucket: latencyBucket(totalMs),
        token_bucket: tokenBucket(inputTokens + outputTokens),
        billing_status: free ? 'free' : 'billed',
      }, { result: 'success' })
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      const errorCode = (err as { data?: { code?: string } } | undefined)?.data?.code
      setColumns((prev) =>
        prev
          ? prev.map((c, i) => {
              if (i !== idx) return c
              const next = [...c.history]
              const last = next[next.length - 1]
              if (last?.role === 'assistant') next[next.length - 1] = { ...last, error: `体验请求失败：${(err as Error).message || '请稍后重试'}` }
              return { ...c, history: next }
            })
          : prev,
      )
      trackEvent('playground_model_run_result', {
        model_id: column.model.model_id,
        status: 'failed',
        latency_bucket: latencyBucket(Date.now() - startedAt),
        token_bucket: tokenBucket(0),
        billing_status: 'unbilled',
      }, { result: 'fail', error_code: errorCode })
    } finally {
      updateColumn(idx, { streaming: false })
      settleDispatch(dispatchId)
    }
  }

  /** 图像/音频/视频类列发送（§5.2 同步 JSON / §5.3-5.4 视频异步轮询），qa#543/qa#545。
   *  不带附件时走各类别默认任务（text_to_image/text_to_audio/text_to_video）；带附件时
   *  仍然只传 attachments，task 在会话创建时已固定，后端按实际是否带附件处理。 */
  async function sendMediaOne(idx: number, prompt: string, dispatchId: string, attachment?: DispatchAttachment) {
    const column = columns![idx]
    const modelLabel = prettyModelName(column.model.display_name, column.model.model_id)
    updateColumn(idx, {
      streaming: true,
      history: [...column.history, { role: 'user', content: prompt, dispatchId, media: attachment?.media }, { role: 'assistant', content: '', dispatchId }],
    })
    const startedAt = Date.now()
    let isAsyncVideo = false

    try {
      const { message, attachment_urls } = await sendExperienceMediaMessage({
        conversationId: column.conversationId,
        dispatchId,
        content: prompt,
        attachments: attachment?.resourceIds ?? [],
      })

      if (message.status === 'running' && message.async_task_id) {
        isAsyncVideo = true
        applyAssistant(idx, () => `视频生成中，可点击[在调用日志的异步任务里追踪](/logs?task_id=${encodeURIComponent(message.async_task_id!)})…`)
        void pollVideoColumn(idx, column.conversationId, message.id, modelLabel, dispatchId)
        return
      }

      const media = message.attachments.map((a) => ({ kind: a.kind, url: attachment_urls[a.resource_id] ?? '' }))
      const spend = Number(message.actual_spend ?? 0)
      const totalMs = message.total_ms ?? Date.now() - startedAt
      setColumns((prev) =>
        prev
          ? prev.map((c, i) => {
              if (i !== idx) return c
              const next = [...c.history]
              const last = next[next.length - 1]
              if (last?.role === 'assistant') {
                next[next.length - 1] = {
                  ...last,
                  content: message.content,
                  media: media.length > 0 ? media : undefined,
                  error: message.status === 'failed' ? (message.content ? undefined : '该模型本轮响应失败') : undefined,
                  metrics: {
                    model: modelLabel, inputTokens: 0, outputTokens: 0, firstTokenLatency: '',
                    totalLatency: formatPlaygroundLatency(totalMs), spend, free: spend === 0, totalMs,
                  },
                }
              }
              return { ...c, history: next }
            })
          : prev,
      )
      trackEvent('playground_model_run_result', {
        model_id: column.model.model_id,
        status: message.status === 'failed' ? 'failed' : 'succeeded',
        latency_bucket: latencyBucket(totalMs),
        token_bucket: tokenBucket(0),
        billing_status: spend === 0 ? 'free' : 'billed',
      }, { result: message.status === 'failed' ? 'fail' : 'success' })
    } catch (err) {
      const message = `体验请求失败：${extractApiErrorMessage(err)}`
      setColumns((prev) =>
        prev
          ? prev.map((c, i) => {
              if (i !== idx) return c
              const next = [...c.history]
              const last = next[next.length - 1]
              if (last?.role === 'assistant') next[next.length - 1] = { ...last, error: message }
              return { ...c, history: next }
            })
          : prev,
      )
      const errorCode = (err as { data?: { field_errors?: Array<{ code?: string }> } } | undefined)?.data?.field_errors?.[0]?.code
      trackEvent('playground_model_run_result', {
        model_id: column.model.model_id,
        status: 'failed',
        latency_bucket: latencyBucket(Date.now() - startedAt),
        token_bucket: tokenBucket(0),
        billing_status: 'unbilled',
      }, { result: 'fail', error_code: errorCode })
    } finally {
      updateColumn(idx, { streaming: false })
      // 视频异步分支的 dispatch 结算延后到 pollVideoColumn 轮询终态，这里不提前计入
      if (!isAsyncVideo) settleDispatch(dispatchId)
    }
  }

  /** 视频列异步轮询（§5.4）：running 继续轮询，succeeded/failed 为终态。每列各自独立的
   *  轮询循环，互不阻塞——多列视频任务同时进行时各自按自己的节奏完成。 */
  async function pollVideoColumn(idx: number, conversationId: string, messageId: string, modelLabel: string, dispatchId: string) {
    for (;;) {
      await new Promise((resolve) => window.setTimeout(resolve, 5000))
      try {
        const { message, attachment_urls } = await getExperienceMessage(conversationId, messageId)
        if (message.status === 'running') continue
        setColumns((prev) => {
          if (!prev) return prev
          return prev.map((c, i) => {
            if (i !== idx) return c
            const next = [...c.history]
            const last = next[next.length - 1]
            if (last?.role !== 'assistant') return c
            if (message.status === 'failed') {
              next[next.length - 1] = { ...last, error: message.error || '视频生成失败', content: '' }
              return { ...c, history: next }
            }
            const media = message.attachments.map((a) => ({ kind: a.kind, url: attachment_urls[a.resource_id] ?? '' }))
            next[next.length - 1] = {
              ...last,
              content: '',
              media: media.length > 0 ? media : undefined,
              metrics: {
                model: modelLabel, inputTokens: 0, outputTokens: 0, firstTokenLatency: '',
                totalLatency: formatPlaygroundLatency(message.total_ms ?? 0),
                spend: Number(message.actual_spend ?? 0), free: Number(message.actual_spend ?? 0) === 0,
                totalMs: message.total_ms,
              },
            }
            return { ...c, history: next }
          })
        })
        trackEvent('playground_model_run_result', {
          model_id: columns?.[idx]?.model.model_id ?? '',
          status: message.status === 'failed' ? 'failed' : 'succeeded',
          latency_bucket: latencyBucket(message.total_ms ?? 0),
          token_bucket: tokenBucket(0),
          billing_status: Number(message.actual_spend ?? 0) === 0 ? 'free' : 'billed',
        }, { result: message.status === 'failed' ? 'fail' : 'success' })
        settleDispatch(dispatchId)
        return
      } catch {
        // 单次轮询失败不放弃，继续等下一轮（同单模型页 §8.3：保留最后已知状态，允许稍后重试）
      }
    }
  }

  /** dispatch 组内所有列都完成后，计算最快/成本最低标记（§7.10） */
  function settleDispatch(dispatchId: string) {
    const remaining = (pendingByDispatch.current.get(dispatchId) ?? 1) - 1
    pendingByDispatch.current.set(dispatchId, remaining)
    if (remaining > 0) return
    setColumns((prev) => {
      if (!prev) return prev
      const rounds = prev
        .map((c, i) => ({ i, msg: c.history.find((m) => m.dispatchId === dispatchId && m.role === 'assistant' && m.metrics) }))
        .filter((r): r is { i: number; msg: ExperienceMessage } => !!r.msg)
      if (rounds.length < 2) return prev
      const fastestIdx = rounds.reduce((best, r) => ((r.msg.metrics!.totalMs ?? Infinity) < (rounds[best].msg.metrics!.totalMs ?? Infinity) ? rounds.indexOf(r) : best), 0)
      const cheapestIdx = rounds.reduce((best, r) => (r.msg.metrics!.spend < rounds[best].msg.metrics!.spend ? rounds.indexOf(r) : best), 0)
      return prev.map((c, i) => {
        const round = rounds.find((r) => r.i === i)
        if (!round) return c
        const isFastest = rounds.indexOf(round) === fastestIdx
        const isCheapest = rounds.indexOf(round) === cheapestIdx
        return {
          ...c,
          history: c.history.map((m) =>
            m === round.msg ? { ...m, metrics: { ...m.metrics!, fastest: isFastest, cheapest: isCheapest } } : m,
          ),
        }
      })
    })
  }

  /** §7.4/7.5 差异分发（qa#545）：附件只发给该列模型支持该附件类型的列，不支持的列仍然
   *  发送纯文本 prompt（不带附件、不整列跳过）——PRD 原型 playground-attachment-compatibility
   *  弹窗的文案"发送时仍会同时调用全部模型"逐字对应这个默认行为。 */
  function handleSyncSend() {
    const prompt = sharedDraft.trim()
    if (!prompt || !columns) return
    if (isBalanceZero && columns.some((c) => isPaidModel(c.model))) return
    const dispatchId = crypto.randomUUID()
    pendingByDispatch.current.set(dispatchId, columns.length)
    const currentAttachment = attachment
    const attachedKind = currentAttachment ? attachmentKindFromMime(currentAttachment.uploaded.mime) : null
    const supportingCount = currentAttachment && attachedKind
      ? columns.filter((c) => modelSupportsAttachment(c.model, attachedKind)).length
      : 0
    trackEvent('playground_send', {
      dispatch_id_hash: hashId(dispatchId),
      attachment_kind_set: attachedKind ?? 'none',
      eligible_column_count: columns.length,
      attachment_recipient_count: supportingCount,
    })
    setSharedDraft('')
    clearAttachment()
    columns.forEach((c, idx) => {
      const supports = currentAttachment && attachedKind ? modelSupportsAttachment(c.model, attachedKind) : false
      const dispatchAttachment: DispatchAttachment | undefined = supports && currentAttachment
        ? {
            resourceIds: [currentAttachment.uploaded.resource_id],
            media: [{ kind: attachedKind ?? 'image', url: currentAttachment.previewUrl }],
          }
        : undefined
      void sendOne(idx, prompt, dispatchId, dispatchAttachment)
    })
  }

  function handleIndependentSend(idx: number) {
    if (!columns) return
    const prompt = columns[idx].draft.trim()
    if (!prompt) return
    if (isBalanceZero && isPaidModel(columns[idx].model)) return
    const dispatchId = crypto.randomUUID()
    pendingByDispatch.current.set(dispatchId, 1)
    trackEvent('playground_send', {
      dispatch_id_hash: hashId(dispatchId),
      attachment_kind_set: 'none',
      eligible_column_count: 1,
      attachment_recipient_count: 0,
    })
    updateColumn(idx, { draft: '' })
    void sendOne(idx, prompt, dispatchId)
  }

  /** §7.4：独立→同步，若各列草稿不一致需要确认；一致则直接切换不打扰用户 */
  function handleToggleSync(next: boolean) {
    if (!columns) return
    if (next) {
      const source = columns[lastFocusedIndex] ?? columns[0]
      const allSame = columns.every((c) => c.draft === source.draft)
      const sourceHasAttachment = false // 对比列暂不支持附件，恒为 false
      if (allSame) {
        setSharedDraft(source.draft)
        setSyncInput(true)
        trackEvent('playground_input_mode_change', {
          from_mode: 'independent', to_mode: 'sync', requires_confirmation: false,
          source_has_attachment: sourceHasAttachment, attachment_recipient_count: 0,
        }, { result: 'success' })
        return
      }
      setSyncConfirm({ sourceIndex: lastFocusedIndex, sourceText: source.draft })
      trackEvent('playground_input_mode_change', {
        from_mode: 'independent', to_mode: 'sync', requires_confirmation: true,
        source_has_attachment: sourceHasAttachment, attachment_recipient_count: 0,
      })
      return
    }
    // 同步→独立：无需确认，共享文本复制到每列草稿
    setColumns((prev) => (prev ? prev.map((c) => ({ ...c, draft: sharedDraft })) : prev))
    setSyncInput(false)
    trackEvent('playground_input_mode_change', {
      from_mode: 'sync', to_mode: 'independent', requires_confirmation: false,
      source_has_attachment: false, attachment_recipient_count: 0,
    }, { result: 'success' })
  }

  function confirmSyncSwitch() {
    if (!syncConfirm) return
    setSharedDraft(syncConfirm.sourceText)
    setSyncInput(true)
    setSyncConfirm(null)
    trackEvent('playground_input_mode_change', {
      from_mode: 'independent', to_mode: 'sync', requires_confirmation: true,
      source_has_attachment: false, attachment_recipient_count: 0,
    }, { result: 'success' })
  }

  async function handleRemoveConfirmed() {
    if (removeConfirmIndex === null || !columns || !sessionId) return
    const target = columns[removeConfirmIndex]
    trackEvent('playground_model_remove', { model_id: target.model.model_id, action: 'confirm' })
    if (columns.length <= 2) {
      // §7.3：移除至单模型按退出对比同样规则处理——保留最左侧主模型，恢复侧栏
      const keep = columns[0].model.model_id === target.model.model_id ? columns[1].model : columns[0].model
      try {
        await removeExperienceConversation(sessionId, target.conversationId)
      } catch {
        // 真实删列失败也不阻塞回退到单模型页——用户的主要诉求是离开对比
      }
      restoreSavedPreference()
      navigate('/models/playground', { state: { selectedModelId: keep.model_id } })
      return
    }
    try {
      await removeExperienceConversation(sessionId, target.conversationId)
      setColumns((prev) => (prev ? prev.filter((_, i) => i !== removeConfirmIndex) : prev))
      setRemoveConfirmIndex(null)
    } catch (err) {
      setBootError(`移除模型失败：${(err as Error).message || '请稍后重试'}`)
    }
  }

  function handleExitConfirmed() {
    if (!columns) return
    restoreSavedPreference()
    navigate('/models/playground', { state: { selectedModelId: columns[0].model.model_id } })
  }

  /** §7.3：加模型——调真实加列端点，只追加新列，不影响已有列的对话历史 */
  async function handleAddConfirm(added: CatalogModelItem[]) {
    if (!columns || !sessionId || added.length === 0) return
    try {
      const toAdd = added.slice(0, MAX_COMPARE - columns.length)
      const baseCount = columns.length
      const newConversations = await Promise.all(toAdd.map((model) => addExperienceConversation(sessionId, model.model_id)))
      setColumns((prev) => {
        if (!prev) return prev
        const newColumns: ColumnState[] = toAdd.map((model, i) => ({
          model,
          conversationId: newConversations[i].id,
          history: [],
          streaming: false,
          draft: '',
          chatParams: {},
        }))
        abortRefs.current = [...abortRefs.current, ...newColumns.map(() => null)]
        return [...prev, ...newColumns]
      })
      toAdd.forEach((model, i) => {
        trackEvent('playground_model_add', { model_id: model.model_id, next_count: baseCount + i + 1 })
      })
    } catch (err) {
      setBootError(`添加模型失败：${(err as Error).message || '请稍后重试'}`)
    }
  }

  /** §7.1：对比列内切换模型——调真实换模型端点，保留该列聊天记录（接口原文"保留列内历史"） */
  async function handleSwitchConfirm(model: CatalogModelItem) {
    if (switchPickerIndex === null || !columns || !sessionId) return
    const target = columns[switchPickerIndex]
    try {
      await switchExperienceConversationModel(sessionId, target.conversationId, model.model_id)
      updateColumn(switchPickerIndex, { model, chatParams: {} })
      trackEvent('playground_model_select', { from_model_id: target.model.model_id, to_model_id: model.model_id }, { result: 'success' })
    } catch (err) {
      setBootError(`切换模型失败：${(err as Error).message || '请稍后重试'}`)
      trackEvent('playground_model_select', { from_model_id: target.model.model_id, to_model_id: model.model_id }, { result: 'fail' })
    }
  }

  /** 打开设置弹窗：拉取该列模型已持久化的配置 + 本会话累计统计（真实端点见 Swagger） */
  async function openColumnSettings(idx: number) {
    trackEvent('playground_settings_action', { action: 'open' })
    setSettingsIndex(idx)
    if (!sessionId || !columns) return
    const model = columns[idx].model
    try {
      const [{ items: configs }, { items: stats }] = await Promise.all([
        listExperienceModelConfigs(sessionId),
        getExperienceSessionStats(sessionId),
      ])
      const savedConfig = configs.find((c) => matchesModelConfigId(c.model_id, model.model_id))
      if (savedConfig) updateColumn(idx, { chatParams: savedConfig.config })
      const modelStats = stats.find((s) => s.model_id === model.model_id)
      if (modelStats) {
        setSessionStats({
          requestCount: modelStats.requests,
          tokens: modelStats.total_tokens,
          cost: Number(modelStats.actual_spend ?? modelStats.estimated_spend ?? 0),
        })
      }
    } catch {
      // 拉取失败不阻塞设置弹窗使用
    }
  }

  function handleColumnParamChange(idx: number, key: string, value: unknown) {
    if (!columns) return
    trackEvent('playground_settings_action', { action: 'modify', parameter_name: key })
    const next = { ...columns[idx].chatParams, [key]: value }
    updateColumn(idx, { chatParams: next })
    if (sessionId) void saveExperienceModelConfig(sessionId, columns[idx].model.model_id, next)
  }

  function handleColumnParamReset(idx: number) {
    if (!columns) return
    trackEvent('playground_settings_action', { action: 'reset' })
    updateColumn(idx, { chatParams: {} })
    if (sessionId) void resetExperienceModelConfig(sessionId, columns[idx].model.model_id)
  }

  if (bootError) {
    return (
      <div className="models-experience-page">
        <PageHeader title="模型对比" description={bootError} className="mb-4" />
        <Button variant="brand" onClick={() => navigate('/models/playground')}>返回模型体验</Button>
      </div>
    )
  }

  if (!columns) {
    return (
      <div className="models-experience-page">
        <PageHeader title="模型对比" description="正在准备对比会话…" className="mb-4" />
      </div>
    )
  }

  // qa#543：对比会话的一级类别以首列模型为准（同一组内模型类别一致，选模型/建组时已保证）；
  // task 用该类别的默认任务。
  const compareCategory: ExperienceCategoryKey = resolveModelCategory(columns[0].model)
  const compareTask = EXPERIENCE_CATEGORY_DEFAULT_TASK[compareCategory]

  /** 模型是否真的接受该附件类型：看 input_modalities（比类别粗粒度的 allowedAttachmentKinds
   *  更准——同类别里未必所有模型都收同一种输入模态，例如对话类里有的模型不收图片附件）。 */
  function modelSupportsAttachment(model: CatalogModelItem, kind: string): boolean {
    const inputMods = model.input_modalities ?? model.modalities ?? []
    return inputMods.includes(kind)
  }

  /** 每个类别允许附哪种附件（§7.5），与单模型页同口径 */
  const allowedAttachmentKinds: Array<keyof typeof ATTACHMENT_LIMITS> =
    compareCategory === 'dialogue' ? ['image', 'video'] : compareCategory === 'audio' ? ['audio'] : ['image']

  function clearAttachment() {
    setAttachment((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl)
      return null
    })
    setAttachmentError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  /** 共享附件上传（qa#545，§7.4/7.5）：只做类型/大小校验和上传，不因"部分模型不支持"而拦截
   *  上传——支持哪些列由发送时逐列判断（modelSupportsAttachment），差异分发在 handleSyncSend。 */
  async function handleFileSelect(file: File | null | undefined) {
    if (!file || !columns) return
    const cols = columns
    setAttachmentError(null)
    const kind = attachmentKindFromMime(file.type)
    if (!kind || !allowedAttachmentKinds.includes(kind)) {
      setAttachmentError(`当前对比类别不支持该附件类型，仅支持：${allowedAttachmentKinds.map((k) => ATTACHMENT_LIMITS[k].label).join('、')}`)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    if (file.size > ATTACHMENT_LIMITS[kind].maxBytes) {
      setAttachmentError(`文件超出大小限制（${ATTACHMENT_LIMITS[kind].label}）`)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    const previewUrl = URL.createObjectURL(file)
    setAttachmentUploading(true)
    try {
      const uploaded = await uploadExperienceAttachment(file)
      setAttachment({ file, previewUrl, uploaded })
      const supportingCount = cols.filter((c) => modelSupportsAttachment(c.model, kind)).length
      trackEvent('playground_attachment_result', {
        kind, size_bucket: sizeBucket(file.size), result: 'success',
        supporting_model_count: supportingCount, unsupported_model_count: cols.length - supportingCount,
        distribution_mode: 'compare',
      })
    } catch (err) {
      URL.revokeObjectURL(previewUrl)
      setAttachmentError(extractApiErrorMessage(err))
      trackEvent('playground_attachment_result', {
        kind, size_bucket: sizeBucket(file.size), result: 'fail',
        supporting_model_count: 0, unsupported_model_count: cols.length, distribution_mode: 'compare',
      })
    } finally {
      setAttachmentUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const excludeIdsFor = (idx: number) => columns.filter((_, i) => i !== idx).map((c) => c.model.id)

  /** 窄屏 Tab 状态点（§8.5：显示运行中/完成/失败） */
  function columnStatus(column: ColumnState): 'running' | 'failed' | 'succeeded' | 'idle' {
    if (column.streaming) return 'running'
    const last = column.history[column.history.length - 1]
    if (!last) return 'idle'
    if (last.error) return 'failed'
    if (last.role === 'assistant' && last.metrics) return 'succeeded'
    return 'idle'
  }

  return (
    <div className="models-experience-page">
      <PageHeader title="模型体验" description="同类别、同任务的最多 3 个模型并排对比，逐列独立设置与费用。" className="mb-4" />

      <div className="models-experience-shell">
        {/* §7.8 历史会话侧栏（qa#546）：与单模型页同款受控组件，展开时拉取列表；选中会话
            按 conversation_id 分组还原成多列（见 openHistorySession），新建会话退回单模型页
            重新走"选模型 → 模型对比"入口（对比页本身没有内嵌选模型态）。 */}
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

      <div className="models-compare-toolbar">
        <div className="models-compare-toolbar-left">
          <LuColumns2 size={15} className="text-brand-base" />
          <strong>模型对比</strong>
          <span className="models-compare-toolbar-meta">{EXPERIENCE_CATEGORY_LABEL[compareCategory]} · {columns.length} / {MAX_COMPARE} 个模型</span>
        </div>
        <div className="models-compare-toolbar-right">
          <label className="flex items-center gap-2 select-none cursor-pointer">
            <span className="text-xs font-semibold text-mg-text-3">同步输入</span>
            <Switch checked={syncInput} onChange={handleToggleSync} />
          </label>
          <Button
            variant="outline"
            size="sm"
            disabled={columns.length >= MAX_COMPARE}
            onClick={() => {
              trackEvent('playground_model_picker_open', { picker_type: 'compareAdd', browse_category: compareCategory })
              setAddPickerOpen(true)
            }}
          >
            <LuPlus size={13} /> 添加模型
          </Button>
          <Button variant="outline" size="sm" onClick={() => setExitConfirmOpen(true)}>
            <LuLogOut size={13} /> 退出对比
          </Button>
        </div>
      </div>

      {/* §8.5 窄屏一次展示一个模型列，顶部 Tab 切换；宽屏由 CSS 隐藏，不影响并排布局 */}
      <div className="models-compare-mobile-tabs" role="tablist" aria-label="切换对比模型列">
        {columns.map((column, idx) => {
          const status = columnStatus(column)
          return (
            <button
              key={column.conversationId || idx}
              type="button"
              role="tab"
              aria-selected={idx === activeColumnIndex}
              className={cn('models-compare-mobile-tab', idx === activeColumnIndex && 'is-active')}
              onClick={() => setActiveColumnIndex(idx)}
            >
              <span
                className={cn('models-compare-mobile-tab-dot', `is-${status}`)}
                aria-hidden="true"
              />
              {prettyModelName(column.model.display_name, column.model.model_id)}
            </button>
          )
        })}
      </div>

      <div className="models-compare-columns" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map((column, idx) => (
          <section
            key={column.conversationId || idx}
            className={cn(
              'models-experience-chat models-compare-column',
              idx === activeColumnIndex && 'is-active-mobile',
            )}
          >
            <div className="models-experience-modelbar">
              <button
                type="button"
                className="models-experience-model-trigger"
                onClick={() => {
                  trackEvent('playground_model_picker_open', { picker_type: 'compareSwitch', browse_category: compareCategory })
                  setSwitchPickerIndex(idx)
                }}
              >
                <span className="models-experience-model-avatar">
                  {prettyModelName(column.model.display_name, column.model.model_id).slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="models-experience-modelbar-title">{prettyModelName(column.model.display_name, column.model.model_id)}</div>
                  <div className="models-experience-modelbar-sub">{column.model.vendor || column.model.provider || 'ModelGo'} · {EXPERIENCE_CATEGORY_LABEL[compareCategory]}</div>
                </div>
                <span className="models-experience-price-chip">{dualPriceText(column.model)}</span>
                <LuChevronDown size={13} className="text-mg-text-3 shrink-0" />
              </button>
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  className="models-experience-icon-btn"
                  aria-label="打开 API 调用"
                  title="打开 API 调用"
                  onClick={() => {
                    trackEvent('playground_api_modal_action', { action: 'open', protocol: '', language: '', model_id: column.model.model_id })
                    setApiIndex(idx)
                  }}
                >
                  <LuCode size={13} />
                </button>
                <button type="button" className="models-experience-icon-btn" aria-label="打开模型设置" title="打开模型设置" onClick={() => void openColumnSettings(idx)}>
                  <LuSettings2 size={13} />
                </button>
                <button type="button" className="models-experience-icon-btn" aria-label="移除模型" title="移除模型" onClick={() => setRemoveConfirmIndex(idx)}>
                  <LuX size={13} />
                </button>
              </div>
            </div>

            <ExperienceMessageList
              messages={column.history}
              isStreaming={column.streaming}
              showModelNameInMeta={false}
              emptyState={
                <div className="models-experience-empty">
                  {(() => {
                    const EmptyIcon = CATEGORY_EMPTY_COPY[compareCategory].icon
                    return <EmptyIcon size={18} />
                  })()}
                  <span>{CATEGORY_EMPTY_COPY[compareCategory].hint}</span>
                </div>
              }
            />

            {isBalanceZero && isPaidModel(column.model) && (
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
                    navigate('/billing', { state: { entrySource: 'recharge_cta' } })
                  }}
                >
                  去充值
                </button>
              </div>
            )}

            {!syncInput && (
              // onFocusCapture 记录"最后聚焦列"，独立→同步切换时用它当来源列（§7.4）
              <div onFocusCapture={() => setLastFocusedIndex(idx)}>
                <Composer
                  value={column.draft}
                  onChange={(v) => updateColumn(idx, { draft: v })}
                  onSend={() => handleIndependentSend(idx)}
                  isStreaming={column.streaming}
                  disabled={isBalanceZero && isPaidModel(column.model)}
                  onStop={() => abortRefs.current[idx]?.abort()}
                  placeholder={`仅向 ${prettyModelName(column.model.display_name, column.model.model_id)}：${CATEGORY_PLACEHOLDER[compareCategory]}`}
                  sendLabel="发送"
                  className="models-experience-composer-wrap models-compare-composer"
                  activeChip={<span />}
                />
              </div>
            )}
          </section>
        ))}
      </div>

      {syncInput && isBalanceZero && columns.some((c) => isPaidModel(c.model)) && (
        <div className="playground-balance-notice" role="alert">
          <LuTriangleAlert size={15} />
          <span>
            <strong>余额不足，仅可体验免费模型</strong>
            当前模型与输入已为你保留，充值后即可继续运行。
          </span>
          <button
            type="button"
            onClick={() => {
              trackEvent('playground_recharge_click', { locked_model_count: columns.filter((c) => isPaidModel(c.model)).length })
              navigate('/billing', { state: { entrySource: 'recharge_cta' } })
            }}
          >
            去充值
          </button>
        </div>
      )}

      {/* 共享附件预览/校验错误（qa#545 §7.4/7.5）：只在同步输入态展示——独立输入模式
          每列各自打字，附件是同步态的共享概念。 */}
      {syncInput && (attachment || attachmentError) && (
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
          {attachment && (() => {
            const kind = attachmentKindFromMime(attachment.uploaded.mime)
            const supportingCount = kind ? columns.filter((c) => modelSupportsAttachment(c.model, kind)).length : 0
            return (
              <span className="models-compare-attachment-support">
                {supportingCount} / {columns.length} 个模型支持该附件；其余模型本轮仅收到文本
              </span>
            )
          })()}
          {attachmentError && <span className="models-experience-attachment-error">{attachmentError}</span>}
        </div>
      )}

      {syncInput && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept={allowedAttachmentKinds.map((k) => ATTACHMENT_LIMITS[k].accept).join(',')}
            className="hidden"
            onChange={(e) => void handleFileSelect(e.target.files?.[0])}
          />
          <Composer
            value={sharedDraft}
            onChange={setSharedDraft}
            onSend={handleSyncSend}
            isStreaming={columns.some((c) => c.streaming)}
            disabled={isBalanceZero && columns.some((c) => isPaidModel(c.model))}
            onStop={() => abortRefs.current.forEach((c) => c?.abort())}
            placeholder={`${CATEGORY_PLACEHOLDER[compareCategory]}（同时发送给 ${columns.length} 个模型）`}
            sendLabel="发送"
            className="models-experience-composer-wrap models-compare-shared-composer"
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
                  {attachmentUploading ? '附件上传中…' : '同步发送给全部已选模型'}
                </span>
              </div>
            }
          />
        </>
      )}

      {historyActionError && (
        <div className="models-experience-inline-error" role="alert">
          <LuTriangleAlert size={14} />
          <span>{historyActionError}</span>
        </div>
      )}

        </div>
      </div>

      <ModelPickerDialog
        open={switchPickerIndex !== null}
        onClose={() => setSwitchPickerIndex(null)}
        mode="compareSwitch"
        models={allModels.filter((m) => switchPickerIndex === null || !excludeIdsFor(switchPickerIndex).includes(m.id))}
        isBalanceZero={isBalanceZero}
        currentCategory={compareCategory}
        currentTask={compareTask}
        onSelect={(model) => {
          void handleSwitchConfirm(model)
          setSwitchPickerIndex(null)
        }}
      />

      <ModelPickerDialog
        open={addPickerOpen}
        onClose={() => setAddPickerOpen(false)}
        mode="compareAdd"
        models={allModels}
        isBalanceZero={isBalanceZero}
        currentCategory={compareCategory}
        currentTask={compareTask}
        alreadySelectedIds={columns.map((c) => c.model.id)}
        maxAdditional={MAX_COMPARE - columns.length}
        onConfirmAdd={handleAddConfirm}
      />

      {settingsIndex !== null && columns[settingsIndex] && (
        <ModelSettingsModal
          open
          onClose={() => setSettingsIndex(null)}
          modelName={prettyModelName(columns[settingsIndex].model.display_name, columns[settingsIndex].model.model_id)}
          vendor={columns[settingsIndex].model.vendor || columns[settingsIndex].model.provider || 'ModelGo'}
          maxOutputTokens={Math.max(256, columns[settingsIndex].model.max_output_tokens || 4096)}
          task={EXPERIENCE_CATEGORY_DEFAULT_TASK[resolveModelCategory(columns[settingsIndex].model)]}
          values={columns[settingsIndex].chatParams}
          onChange={(key, value) => handleColumnParamChange(settingsIndex, key, value)}
          onReset={() => handleColumnParamReset(settingsIndex)}
          sessionStats={sessionStats}
        />
      )}

      {apiIndex !== null && columns[apiIndex] && (
        <ApiQuickCallModal
          open
          onClose={() => setApiIndex(null)}
          modelName={prettyModelName(columns[apiIndex].model.display_name, columns[apiIndex].model.model_id)}
          modelId={columns[apiIndex].model.model_id}
          supportedProtocols={columns[apiIndex].model.protocols?.length ? (columns[apiIndex].model.protocols as never) : ['openai']}
          onAction={(action, protocol, language) => trackEvent('playground_api_modal_action', { action, protocol, language, model_id: columns[apiIndex].model.model_id })}
        />
      )}

      <ConfirmModal
        open={removeConfirmIndex !== null}
        onClose={() => {
          if (removeConfirmIndex !== null && columns[removeConfirmIndex]) {
            trackEvent('playground_model_remove', { model_id: columns[removeConfirmIndex].model.model_id, action: 'cancel' })
          }
          setRemoveConfirmIndex(null)
        }}
        onConfirm={handleRemoveConfirmed}
        title="移除该模型？"
        description="确认后将删除该列的聊天记录，无法恢复。"
        variant="destructive"
        confirmLabel="移除"
      />

      <ConfirmModal
        open={exitConfirmOpen}
        onClose={() => setExitConfirmOpen(false)}
        onConfirm={handleExitConfirmed}
        title="退出模型对比？"
        description="将保留最左侧主模型及其内容，其余模型列的对话记录会被丢弃。"
        confirmLabel="退出对比"
      />

      <ConfirmModal
        open={syncConfirm !== null}
        onClose={() => setSyncConfirm(null)}
        onConfirm={confirmSyncSwitch}
        title="同步各列输入？"
        description={`将使用「${syncConfirm ? prettyModelName(columns[syncConfirm.sourceIndex]?.model.display_name, columns[syncConfirm.sourceIndex]?.model.model_id) : ''}」当前输入同步到全部模型列，其他列文本将被替换。`}
        confirmLabel="确认同步"
      />
    </div>
  )
}
