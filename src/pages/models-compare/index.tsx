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
  LuColumns2, LuChevronDown, LuCode, LuSettings2, LuX, LuPlus, LuLogOut, LuTriangleAlert,
} from 'react-icons/lu'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Switch'
import { Composer } from '@/components/ui/Composer'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useModels } from '@/features/models/hooks/useModels'
import { prettyModelName } from '@/lib/utils'
import type { CatalogModelItem } from '@/types'
import {
  createExperienceSession,
  streamExperienceMessage,
  addExperienceConversation,
  removeExperienceConversation,
  switchExperienceConversationModel,
  listExperienceModelConfigs,
  saveExperienceModelConfig,
  resetExperienceModelConfig,
  getExperienceSessionStats,
  matchesModelConfigId,
  type ExperienceStatsEvent,
} from '@/services/experience-sessions'
import { useSidebarCollapseStore } from '@/store/use-sidebar-collapse-store'
import { useAuthStore } from '@/store/auth'
import { useBalance, useBalanceBreakdown } from '@/hooks/use-balance'
import { calculateSpendableBalance } from '@/pages/billing/formatBalance'
import {
  isChatModel,
  isPaidModel,
  estimateTokens,
  formatPlaygroundLatency,
  dualPriceText,
  type ExperienceMessage,
} from '../models/model-experience-data'
import { ModelPickerDialog } from '../models/components/ModelPickerDialog'
import { ModelSettingsModal } from '../models/components/ModelSettingsModal'
import { ApiQuickCallModal } from '../models/components/ApiQuickCallModal'
import { ExperienceMessageList } from '../models/components/ExperienceMessageList'
import '../models/styles/model-experience-layout.css'
import '../models/styles/model-chat.css'
import '../models/styles/model-composer.css'
import '../models/styles/model-picker-dialog.css'
import '../models/styles/model-settings-modal.css'
import '../models/styles/api-quick-call-modal.css'
import './compare.css'

const MAX_COMPARE = 3

interface ColumnState {
  model: CatalogModelItem
  conversationId: string
  history: ExperienceMessage[]
  streaming: boolean
  draft: string
  chatParams: Record<string, unknown>
}

export default function ModelsComparePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const collapseForCompare = useSidebarCollapseStore((s) => s.collapseForCompare)
  const restoreSavedPreference = useSidebarCollapseStore((s) => s.restoreSavedPreference)

  const { modelsQuery } = useModels({ modality: 'text' })
  const allModels = useMemo(
    () => (modelsQuery.data?.items ?? []).filter(isChatModel),
    [modelsQuery.data?.items],
  )

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

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [columns, setColumns] = useState<ColumnState[] | null>(null)
  const [syncInput, setSyncInput] = useState(true)
  const [sessionStats, setSessionStats] = useState({ requestCount: 0, tokens: 0, cost: 0 })
  const [sharedDraft, setSharedDraft] = useState('')
  const [lastFocusedIndex, setLastFocusedIndex] = useState(0)
  const [bootError, setBootError] = useState<string | null>(null)

  const [removeConfirmIndex, setRemoveConfirmIndex] = useState<number | null>(null)
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false)
  const [switchPickerIndex, setSwitchPickerIndex] = useState<number | null>(null)
  const [addPickerOpen, setAddPickerOpen] = useState(false)
  const [syncConfirm, setSyncConfirm] = useState<{ sourceIndex: number; sourceText: string } | null>(null)
  const [settingsIndex, setSettingsIndex] = useState<number | null>(null)
  const [apiIndex, setApiIndex] = useState<number | null>(null)

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

  async function bootSession(models: CatalogModelItem[]) {
    try {
      const session = await createExperienceSession({
        name: '未命名会话',
        category: 'dialogue',
        task: 'text_to_text',
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

  /** 单列发送；sync 模式下多列共用同一个 dispatchId，用于事后计算最快/成本最低 */
  async function sendOne(idx: number, prompt: string, dispatchId: string) {
    if (!columns) return
    const column = columns[idx]
    if (!column || column.streaming || !prompt) return

    updateColumn(idx, {
      streaming: true,
      history: [...column.history, { role: 'user', content: prompt, dispatchId }, { role: 'assistant', content: '', dispatchId }],
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
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
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
    } finally {
      updateColumn(idx, { streaming: false })
      settleDispatch(dispatchId)
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

  function handleSyncSend() {
    const prompt = sharedDraft.trim()
    if (!prompt || !columns) return
    if (isBalanceZero && columns.some((c) => isPaidModel(c.model))) return
    const dispatchId = crypto.randomUUID()
    pendingByDispatch.current.set(dispatchId, columns.length)
    setSharedDraft('')
    columns.forEach((_, idx) => void sendOne(idx, prompt, dispatchId))
  }

  function handleIndependentSend(idx: number) {
    if (!columns) return
    const prompt = columns[idx].draft.trim()
    if (!prompt) return
    if (isBalanceZero && isPaidModel(columns[idx].model)) return
    const dispatchId = crypto.randomUUID()
    pendingByDispatch.current.set(dispatchId, 1)
    updateColumn(idx, { draft: '' })
    void sendOne(idx, prompt, dispatchId)
  }

  /** §7.4：独立→同步，若各列草稿不一致需要确认；一致则直接切换不打扰用户 */
  function handleToggleSync(next: boolean) {
    if (!columns) return
    if (next) {
      const source = columns[lastFocusedIndex] ?? columns[0]
      const allSame = columns.every((c) => c.draft === source.draft)
      if (allSame) {
        setSharedDraft(source.draft)
        setSyncInput(true)
        return
      }
      setSyncConfirm({ sourceIndex: lastFocusedIndex, sourceText: source.draft })
      return
    }
    // 同步→独立：无需确认，共享文本复制到每列草稿
    setColumns((prev) => (prev ? prev.map((c) => ({ ...c, draft: sharedDraft })) : prev))
    setSyncInput(false)
  }

  function confirmSyncSwitch() {
    if (!syncConfirm) return
    setSharedDraft(syncConfirm.sourceText)
    setSyncInput(true)
    setSyncConfirm(null)
  }

  async function handleRemoveConfirmed() {
    if (removeConfirmIndex === null || !columns || !sessionId) return
    const target = columns[removeConfirmIndex]
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
    } catch (err) {
      setBootError(`切换模型失败：${(err as Error).message || '请稍后重试'}`)
    }
  }

  /** 打开设置弹窗：拉取该列模型已持久化的配置 + 本会话累计统计（真实端点见 Swagger） */
  async function openColumnSettings(idx: number) {
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
    const next = { ...columns[idx].chatParams, [key]: value }
    updateColumn(idx, { chatParams: next })
    if (sessionId) void saveExperienceModelConfig(sessionId, columns[idx].model.model_id, next)
  }

  function handleColumnParamReset(idx: number) {
    if (!columns) return
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

  const excludeIdsFor = (idx: number) => columns.filter((_, i) => i !== idx).map((c) => c.model.id)

  return (
    <div className="models-experience-page">
      <PageHeader title="模型体验" description="同类别、同任务的最多 3 个模型并排对比，逐列独立设置与费用。" className="mb-4" />

      <div className="models-compare-toolbar">
        <div className="models-compare-toolbar-left">
          <LuColumns2 size={15} className="text-brand-base" />
          <strong>模型对比</strong>
          <span className="models-compare-toolbar-meta">对话 · {columns.length} / {MAX_COMPARE} 个模型</span>
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
            onClick={() => setAddPickerOpen(true)}
          >
            <LuPlus size={13} /> 添加模型
          </Button>
          <Button variant="outline" size="sm" onClick={() => setExitConfirmOpen(true)}>
            <LuLogOut size={13} /> 退出对比
          </Button>
        </div>
      </div>

      <div className="models-compare-columns" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map((column, idx) => (
          <section key={column.conversationId || idx} className="models-experience-chat models-compare-column">
            <div className="models-experience-modelbar">
              <button type="button" className="models-experience-model-trigger" onClick={() => setSwitchPickerIndex(idx)}>
                <span className="models-experience-model-avatar">
                  {prettyModelName(column.model.display_name, column.model.model_id).slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="models-experience-modelbar-title">{prettyModelName(column.model.display_name, column.model.model_id)}</div>
                  <div className="models-experience-modelbar-sub">{column.model.vendor || column.model.provider || 'ModelGo'} · 对话</div>
                </div>
                <span className="models-experience-price-chip">{dualPriceText(column.model)}</span>
                <LuChevronDown size={13} className="text-mg-text-3 shrink-0" />
              </button>
              <div className="ml-auto flex items-center gap-1">
                <button type="button" className="models-experience-icon-btn" aria-label="打开 API 调用" title="打开 API 调用" onClick={() => setApiIndex(idx)}>
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
                  <span>发送 Prompt 后，各模型输出与成本将在此并排对比。</span>
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
                <button type="button" onClick={() => navigate('/billing')}>去充值</button>
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
                  placeholder={`仅向 ${prettyModelName(column.model.display_name, column.model.model_id)} 提问…`}
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
          <button type="button" onClick={() => navigate('/billing')}>去充值</button>
        </div>
      )}

      {syncInput && (
        <Composer
          value={sharedDraft}
          onChange={setSharedDraft}
          onSend={handleSyncSend}
          isStreaming={columns.some((c) => c.streaming)}
          disabled={isBalanceZero && columns.some((c) => isPaidModel(c.model))}
          onStop={() => abortRefs.current.forEach((c) => c?.abort())}
          placeholder={`输入 Prompt，同时发送给 ${columns.length} 个模型，Enter 发送…`}
          sendLabel="发送"
          className="models-experience-composer-wrap models-compare-shared-composer"
          activeChip={<span className="models-experience-composer-hint">同步发送给全部已选模型</span>}
        />
      )}

      <ModelPickerDialog
        open={switchPickerIndex !== null}
        onClose={() => setSwitchPickerIndex(null)}
        mode="compareSwitch"
        models={allModels.filter((m) => switchPickerIndex === null || !excludeIdsFor(switchPickerIndex).includes(m.id))}
        isBalanceZero={isBalanceZero}
        currentCategory="dialogue"
        currentTask="text_to_text"
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
        currentCategory="dialogue"
        currentTask="text_to_text"
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
          task="text_to_text"
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
        />
      )}

      <ConfirmModal
        open={removeConfirmIndex !== null}
        onClose={() => setRemoveConfirmIndex(null)}
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
