/**
 * 模型对比工作台数据层：状态、副作用、会话生命周期与派生值（拆分后抽取）。
 * 发送流程与交互处理器见 use-models-compare.tsx，附件状态与处理器见
 * use-compare-attachments.tsx。
 *
 * 真源：飞书《ModelGo Console 重构 PRD：模型体验页面（v0.1）》+ 后端
 * 《模型体验(Playground V1)前端接口文档》2026-07-27 + Swagger（modelgo-web-api）核实到的
 * 真实列级端点（PRD 接口文档 §3.8 对应的表格在飞书内嵌 sheet 里，工具权限读不到，
 * 是从 https://modelgo-web-api.test.modelgo.com/swagger/doc.json 里查到 POST/PATCH/DELETE
 * .../conversations 和 .../configs 的真实路径与请求体形状，不是瞎猜）。
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useModels } from '@/features/models/hooks/useModels'
import type { CatalogModelItem } from '@/types'
import {
  createExperienceSession,
  getExperienceSession,
  getExperienceSessionMessages,
  type ExperienceMessageView,
} from '@/services/experience-sessions'
import { useSidebarCollapseStore } from '@/store/use-sidebar-collapse-store'
import { useExperienceWorkbenchStore } from '@/store/use-experience-workbench-store'
import { useAuthStore } from '@/store/auth'
import { useBalance, useBalanceBreakdown } from '@/hooks/use-balance'
import { calculateSpendableBalance } from '@/pages/billing/formatBalance'
import { trackEvent } from '@/lib/track'
import {
  experienceTaskLabel,
  resolveModelCategory,
  EXPERIENCE_CATEGORY_DEFAULT_TASK,
  modelCategoryTasks,
  taskNeedsFile,
  ATTACHMENT_LIMITS,
  cleanErrorMessage,
  offlineModelPlaceholder,
  type ExperienceMessage,
  type ExperienceCategoryKey,
  type ExperienceTaskType,
} from '../models/model-experience-data'
import { resolveExperienceMessageMedia } from '../models/experience-message-attachments'
import { useExperienceHistorySidebar } from '../models/use-experience-history-sidebar'
import { useStreamingController } from '@/hooks/use-streaming-controller'
import { patchLastAssistant } from '@/lib/message-patch'
import { MAX_COMPARE, type ColumnState } from './models-compare-utils'
import { useCompareAttachments } from './use-compare-attachments'

/** 页面状态层：状态、副作用、会话生命周期、派生值与附件处理器。 */
export function useModelsCompareState() {
  const { t } = useTranslation()
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
  // 切去看账单）再切回不再清空；变量名保持不变，后续几十处引用几乎不用改。
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

  // §7.8 历史会话侧栏（qa#546）：historyCollapsed/historySessions 走共享 hook，
  // 见下方 useExperienceHistorySidebar。historyActionError 是对比页独有。
  const [historyActionError, setHistoryActionError] = useState<string | null>(null)

  const [removeConfirmIndex, setRemoveConfirmIndex] = useState<number | null>(null)
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false)
  const [switchPickerIndex, setSwitchPickerIndex] = useState<number | null>(null)
  const [switchPickerAnchor, setSwitchPickerAnchor] = useState<HTMLElement | null>(null)
  const [addPickerOpen, setAddPickerOpen] = useState(false)
  const [syncConfirm, setSyncConfirm] = useState<{ sourceIndex: number; sourceText: string; sourceAttachmentName: string | null } | null>(null)
  const [settingsIndex, setSettingsIndex] = useState<number | null>(null)
  const [apiIndex, setApiIndex] = useState<number | null>(null)
  // §8.5 窄屏一次展示一个模型列，顶部 Tab 切换；宽屏 CSS 直接把 tab 隐藏，不影响并排布局
  const [activeColumnIndex, setActiveColumnIndex] = useState(0)

  // 各列的流式中断编排（key = 列索引）：新请求自动掐同列旧请求、卸载自动全部收尾
  const stream = useStreamingController<number>()
  const pendingByDispatch = useRef<Map<string, number>>(new Map())
  const bootedRef = useRef(false)

  // 进入对比页即代表已经从 1→N 模型；自动收起一次 Console 侧栏（幂等，重复调用不覆盖已记录的偏好）
  useEffect(() => {
    collapseForCompare()
    return () => restoreSavedPreference()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 建会话：入口带模型时创建新会话；刷新/直达时默认恢复最新历史会话。
  useEffect(() => {
    if (bootedRef.current) return
    const navState = location.state as { selectedIds?: string[]; compareTask?: ExperienceTaskType } | null
    const ids = navState?.selectedIds
    if (!ids || ids.length < 2) {
      if (!modelsQuery.isSuccess) return
      bootedRef.current = true
      void restoreFirstHistorySession()
      return
    }
    if (allModels.length === 0) return
    bootedRef.current = true
    const resolved = ids.slice(0, MAX_COMPARE).map((id) => allModels.find((m) => m.id === id)).filter((m): m is CatalogModelItem => !!m)
    if (resolved.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- boot 失败态由导航来源决定，一次性展示
      setBootError(t('modelsExperience.compare.modelsNotFound'))
      setHistoryCollapsed(false)
      return
    }
    void bootSession(resolved, navState?.compareTask)
    navigate(location.pathname, { replace: true, state: {} })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allModels, modelsQuery.isSuccess])

  // 会话按租户隔离，切换租户后各列绑的旧 conversationId 在新租户下已不存在，继续发消息
  // 会被后端 404「资源不存在」拒绝（同 shared/modelgo_prd#296，单模型页那份修法搬过来）。
  // 对比页本来就没有"留在原页面重开"的形态，startNewSession 会退回单模型页重新选模型，
  // 语义上跟"租户变了、旧对比会话作废"一致。首次挂载时 tenantId 从空变初始值不算切换，跳过。
  const prevTenantIdRef = useRef(tenantId)
  useEffect(() => {
    if (prevTenantIdRef.current && prevTenantIdRef.current !== tenantId) {
      startNewSession()
    }
    prevTenantIdRef.current = tenantId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  // 列数变化（加/移除模型）后夹紧窄屏 Tab 的激活列，避免越界指向已不存在的列
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 列数变更后回夹到合法索引
    if (columns && activeColumnIndex >= columns.length) setActiveColumnIndex(0)
  }, [columns, activeColumnIndex])

  // 历史侧栏：刷新/重命名/删除/展开副作用共享逻辑（与 models 单模型页共用同一 hook）
  const {
    historyCollapsed,
    setHistoryCollapsed,
    historySessions,
    refreshHistorySessions,
    renameHistorySession,
    deleteHistorySession,
  } = useExperienceHistorySidebar({
    sessionId,
    allModels,
    taskLabel: (task) => experienceTaskLabel(task as Parameters<typeof experienceTaskLabel>[0]),
    onDeletedCurrent: startNewSession,
  })

  /** 刷新或直达对比页时优先恢复列表第一条（接口按更新时间倒序），无记录才展示入口错误态。 */
  async function restoreFirstHistorySession() {
    const sessions = await refreshHistorySessions()
    const firstSession = sessions[0]
    if (firstSession && await openHistorySession(firstSession.id)) {
      setHistoryCollapsed(false)
      return
    }
    setBootError(t('modelsExperience.compare.modelsNotFound'))
    setHistoryCollapsed(false)
  }

  /**
   * §7.8 对比页历史恢复：GET .../messages 是 session 粒度，单条消息自带 conversation_id，
   * 按它分组即可还原成每列各自的 history，不需要逐 conversation 再分别调接口。
   * conversations 组合要拿真实模型 id，走 GET 详情接口（列表响应不带 conversations）。
   */
  async function openHistorySession(id: string): Promise<boolean> {
    if (!id) return false
    try {
      const [detail, { items: msgItems }] = await Promise.all([
        getExperienceSession(id),
        getExperienceSessionMessages(id),
      ])
      const convs = (detail.conversations ?? []).slice().sort((a, b) => a.position - b.position)
      if (convs.length === 0) throw new Error(t('modelsExperience.compare.noRestorableColumns'))
      const byConv = new Map<string, ExperienceMessageView[]>()
      for (const msg of msgItems) {
        const list = byConv.get(msg.conversation_id) ?? []
        list.push(msg)
        byConv.set(msg.conversation_id, list)
      }
      const nextColumns: ColumnState[] = await Promise.all(convs.map(async (conv) => {
        const model = allModels.find((m) => m.model_id === conv.model_id) ?? offlineModelPlaceholder(conv.model_id)
        const convMessages = (byConv.get(conv.id) ?? []).slice().sort((a, b) => a.seq - b.seq)
        const history: ExperienceMessage[] = await Promise.all(convMessages.map(async (msg) => {
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
        return { model, conversationId: conv.id, history, streaming: false, draft: '', chatParams: {} }
      }))
      bootedRef.current = true
      // 换一整组列：旧列的在途请求连同句柄一起作废（原实现只丢句柄不中断，旧流仍会按
      // 索引写回新列，属于同一处的隐患，一并收敛到 abortAll）
      stream.abortAll()
      setActiveColumnIndex(0)
      setLastFocusedIndex(0)
      setSharedDraft('')
      setSessionId(id)
      setColumns(nextColumns)
      // 详情响应带真实 task（跟列表不一样，列表轻量响应没有），恢复历史时用它，不用猜
      setCompare({ task: detail.task as ExperienceTaskType })
      setSessionStats({ requestCount: 0, tokens: 0, cost: 0 })
      setBootError(null)
      setHistoryActionError(null)
      trackEvent('playground_history_action', { action: 'restore' }, { result: 'success' })
      return true
    } catch (err) {
      trackEvent('playground_history_action', { action: 'restore' }, { result: 'fail' })
      setHistoryActionError(`${t('modelsExperience.historyLoadFailed')}${(err as Error).message || t('modelsExperience.retryLater')}`)
      return false
    }
  }

  /** §7.8 新建会话：对比页本身没有内嵌的"选模型"态（一直要求带 selectedIds 进场），
   *  退回单模型页重新走"选模型 → 模型对比"的标准入口，跟移除至单模型/退出对比同一归宿。 */
  function startNewSession() {
    bootedRef.current = false
    setSessionId(null)
    setColumns(null)
    setCompare({ task: null })
    setSessionStats({ requestCount: 0, tokens: 0, cost: 0 })
    setHistoryActionError(null)
    restoreSavedPreference()
    navigate('/models/playground')
  }

  async function bootSession(models: CatalogModelItem[], requestedTask?: ExperienceTaskType) {
    try {
      // qa#543：按首个模型推断一级类别（同组模型类别一致，picker 已保证）。task 优先用
      // 单模型页「模型对比」带过来的显式选定任务（PRD §7.1 selectModelTask，同组模型已经
      // 按 currentTask 过滤过，兼容）；没带（比如历史场景）就退化到该类别默认任务。
      const category = resolveModelCategory(models[0])
      const categoryTasks = modelCategoryTasks(models[0], category)
      const task = requestedTask && categoryTasks.includes(requestedTask) ? requestedTask : EXPERIENCE_CATEGORY_DEFAULT_TASK[category]
      const session = await createExperienceSession({
        // name 传空串：后端会在首条用户提问落库时用其前 15 字自动生成标题，
        // 传非空值会被判定为「已显式命名」，反而挡住自动标题
        name: '',
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
      // 换一整组列：旧列的在途请求连同句柄一起作废（原实现只丢句柄不中断，旧流仍会按
      // 索引写回新列，属于同一处的隐患，一并收敛到 abortAll）
      stream.abortAll()
      setSessionId(session.id)
      setColumns(nextColumns)
      setCompare({ task })
      setBootError(null)
    } catch (err) {
      setBootError(`${t('modelsExperience.compare.createSessionFailed')}${(err as Error).message || t('modelsExperience.retryLater')}`)
    }
  }

  function updateColumn(idx: number, patch: Partial<ColumnState>) {
    setColumns((prev) => (prev ? prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)) : prev))
  }

  /** 改某列「当前这条正在生成的回复」（该列 history 的最后一条 assistant）——流式增量、
   *  统计回填、报错、异步视频终态都走这里，业务层不用再手写数组拷贝 + 定位。 */
  function patchAssistant(
    idx: number,
    patch: Partial<ExperienceMessage> | ((last: ExperienceMessage) => Partial<ExperienceMessage>),
  ) {
    setColumns((prev) =>
      prev
        ? prev.map((c, i) => (i === idx ? { ...c, history: patchLastAssistant(c.history, patch) } : c))
        : prev,
    )
  }

  function applyAssistant(idx: number, updater: (content: string) => string) {
    patchAssistant(idx, (last) => ({ content: updater(last.content) }))
  }

  // qa#543：对比会话的一级类别以首列模型为准（同一组内模型类别一致，选模型/建组时已保证）。
  // task 是会话级显式选定值（PRD §7.1 selectModelTask，bootSession/openHistorySession 里写入
  // compare.task），不兼容当前列（比如历史恢复的模型已经变了）就退化到该类别默认任务。
  const compareCategory: ExperienceCategoryKey = columns ? resolveModelCategory(columns[0].model) : 'dialogue'
  const compareCategoryTasks = columns ? modelCategoryTasks(columns[0].model, compareCategory) : []
  const compareTask: ExperienceTaskType = compare.task && compareCategoryTasks.includes(compare.task)
    ? compare.task
    : EXPERIENCE_CATEGORY_DEFAULT_TASK[compareCategory]
  const compareNeedsFileTask = compareCategory !== 'dialogue' && taskNeedsFile(compareTask)

  /** dialogue 类允许附哪种附件（§7.5），与单模型页同口径；image/audio/video 类不走这条
   *  通用回形针路径，改用 needs-file 时的 TaskFileDropZone（taskAttachmentKind(compareTask)） */
  const allowedAttachmentKinds: Array<keyof typeof ATTACHMENT_LIMITS> = ['image', 'video']

  // 附件状态与上传/清理处理器独立成层（use-compare-attachments.tsx），对比页只透传其返回值
  const attachments = useCompareAttachments({
    columns,
    setColumns,
    compareCategory,
    compareTask,
    allowedAttachmentKinds,
  })

  const excludeIdsFor = (idx: number) => (columns?.filter((_, i) => i !== idx).map((c) => c.model.id) ?? [])

  return {
    t,
    navigate,
    restoreSavedPreference,
    bootError,
    setBootError,
    columns,
    setColumns,
    sessionId,
    sessionStats,
    setSessionStats,
    historyCollapsed,
    setHistoryCollapsed,
    historySessions,
    historyActionError,
    openHistorySession,
    renameHistorySession,
    deleteHistorySession,
    startNewSession,
    syncInput,
    setSyncInput,
    sharedDraft,
    setSharedDraft,
    lastFocusedIndex,
    setLastFocusedIndex,
    removeConfirmIndex,
    setRemoveConfirmIndex,
    exitConfirmOpen,
    setExitConfirmOpen,
    switchPickerIndex,
    setSwitchPickerIndex,
    switchPickerAnchor,
    setSwitchPickerAnchor,
    addPickerOpen,
    setAddPickerOpen,
    syncConfirm,
    setSyncConfirm,
    settingsIndex,
    setSettingsIndex,
    apiIndex,
    setApiIndex,
    activeColumnIndex,
    setActiveColumnIndex,
    ...attachments,
    stream,
    pendingByDispatch,
    allModels,
    isBalanceZero,
    updateColumn,
    applyAssistant,
    patchAssistant,
    refreshHistorySessions,
    compareCategory,
    compareTask,
    compareNeedsFileTask,
    allowedAttachmentKinds,
    excludeIdsFor,
  }
}

/** 页面状态上下文：useModelsCompareState 的返回值，供处理器层与 UI 层使用。 */
export type CompareState = ReturnType<typeof useModelsCompareState>
