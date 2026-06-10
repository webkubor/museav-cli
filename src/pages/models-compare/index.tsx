import { useState, useEffect, useRef, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Switch } from '@/components/ui/Switch'
import { LuSearch, LuPlus, LuX, LuMessageSquare, LuTrash2, LuSparkles } from 'react-icons/lu'
import { listModels } from '@/services/catalog'
import { streamExperienceChat } from '@/services/experience'
import type { CatalogModelItem } from '@/types'
import { cn } from '@/lib/utils'
import { ModelIcon } from '@/features/models/components/ModelIcon'

const MAX_COMPARE = 3

function formatPrice(val: string | undefined) {
  if (!val) return '—'
  const n = parseFloat(val)
  if (isNaN(n)) return val
  return `$${n.toFixed(4)}`
}

function formatContext(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function formatDate(val: string | undefined) {
  if (!val) return '—'
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 从 modalities 派生模型类型，用于同类对比限制 */
function getModelType(modalities: string[]): string {
  if (modalities.includes('audio')) return 'Audio'
  if (modalities.includes('image')) return 'VLM'
  if (modalities.includes('video')) return 'Video'
  return 'LLM'
}

const MODEL_TYPE_STYLE: Record<string, string> = {
  LLM:   'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
  VLM:   'bg-blue-500/10 text-blue-500 border-blue-500/20',
  Audio: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  Video: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
}

function ModelTypeBadge({ modalities, className }: { modalities: string[]; className?: string }) {
  const type = getModelType(modalities)
  return (
    <span className={cn(
      'text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border',
      MODEL_TYPE_STYLE[type] ?? MODEL_TYPE_STYLE.LLM,
      className
    )}>
      {type}
    </span>
  )
}

interface ModelPickerProps {
  models: CatalogModelItem[]
  selected: CatalogModelItem | null
  onSelect: (m: CatalogModelItem) => void
  onClear: () => void
  search: string
  onSearch: (v: string) => void
}

function ModelPicker({ models, selected, onSelect, onClear, search, onSearch }: ModelPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const filtered = models.filter((m) =>
    (m.display_name + m.model_id + (m.vendor ?? '')).toLowerCase().includes(search.toLowerCase())
  )

  if (selected) {
    return (
      <div className="border border-[var(--mg-border)] rounded-xl p-4 bg-card-bg min-h-[120px] relative">
        <button
          onClick={onClear}
          className="absolute top-2.5 right-2.5 bg-none border-none cursor-pointer text-[var(--mg-text-2)] hover:text-[var(--mg-text-1)] p-0.5 flex items-center transition-colors"
        >
          <LuX size={14} />
        </button>
        <div className="flex items-center gap-2 mb-2">
          <ModelIcon model={selected} size={28} rounded="rounded-md" />
          <ModelTypeBadge modalities={selected.modalities} />
        </div>
        <div className="font-semibold text-sm text-[var(--mg-text-0)] mb-1">
          {selected.display_name}
        </div>
        <div className="text-[11px] text-[var(--mg-text-2)] font-mono mb-1.5 truncate">
          {selected.model_id}
        </div>
        <div className="flex gap-1 flex-wrap">
          {selected.modalities.map((m) => (
            <Badge key={m} variant="info" className="py-0.5 px-2">{m}</Badge>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full border-2 border-dashed border-[var(--mg-border)] rounded-xl p-6 bg-transparent cursor-pointer flex flex-col items-center gap-2 text-[var(--mg-text-2)] hover:border-[var(--brand-base)] hover:text-[var(--brand-base)] hover:bg-[var(--mg-fill-0)]/50 transition-all duration-150"
      >
        <LuPlus size={20} />
        <span className="text-[13px]">{t('modelsCompare.button.select')}</span>
      </button>

      {open && (
        <div className="absolute top-[calc(100%+6px)] left-0 right-0 bg-card-bg border border-[var(--mg-border)] rounded-lg shadow-lg z-50 max-h-[280px] overflow-hidden flex flex-col animate-[fadeIn_0.15s_ease-out]">
          <div className="p-2 border-b border-[var(--mg-border)] bg-[var(--mg-fill-0)]">
            <Input
              prefix={<LuSearch className="w-3.5 h-3.5" />}
              placeholder={t('modelsCompare.placeholder.search')}
              className="h-8 text-xs rounded-md"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="overflow-y-auto flex-1 py-1">
            {filtered.slice(0, 30).map((m) => (
              <div
                key={m.model_id}
                onClick={() => { onSelect(m); setOpen(false); onSearch('') }}
                className="px-3 py-2 cursor-pointer flex items-center gap-2 hover:bg-[var(--mg-fill-0)] transition-colors"
              >
                <ModelIcon model={m} size={20} rounded="rounded" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[var(--mg-text-0)] truncate">
                    {m.display_name}
                  </div>
                  <div className="text-[11px] text-[var(--mg-text-2)] truncate font-mono">
                    {m.model_id}
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="p-4 text-center text-[13px] text-[var(--mg-text-2)]">
                {t('modelsCompare.empty.noMatch')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function renderCell(model: CatalogModelItem, key: string) {
  if (key === 'pricing_input') return formatPrice(model.pricing?.input_per_1m)
  if (key === 'pricing_output') return formatPrice(model.pricing?.output_per_1m)
  if (key === 'pricing_cache') return formatPrice(model.pricing?.cache_read_per_1m)
  if (key === 'context_length') return formatContext(model.context_length)
  if (key === 'max_output_tokens') return formatContext(model.max_output_tokens)
  if (key === 'knowledge_cutoff') return formatDate(model.knowledge_cutoff)
  if (key === 'released_at') return formatDate(model.released_at)
  if (key === 'providers_count') return model.providers_count != null ? String(model.providers_count) : '—'
  if (key === 'zero_data_retention') {
    return model.zero_data_retention
      ? <Badge variant="success" className="py-0.5 px-2">支持</Badge>
      : <span className="text-[var(--mg-text-2)]">—</span>
  }
  if (key === 'in_region_routing') {
    return model.in_region_routing
      ? <Badge variant="success" className="py-0.5 px-2">支持</Badge>
      : <span className="text-[var(--mg-text-2)]">—</span>
  }
  if (key === 'modalities') {
    return (
      <div className="flex gap-1 flex-wrap">
        {(model.modalities ?? []).map((m) => <Badge key={m} variant="info" className="py-0.5 px-2">{m}</Badge>)}
      </div>
    )
  }
  if (key === 'tags') {
    return (
      <div className="flex gap-1 flex-wrap">
        {(model.tags ?? []).slice(0, 4).map((t) => <Badge key={t} variant="secondary" className="py-0.5 px-2">{t}</Badge>)}
      </div>
    )
  }
  const val = (model as unknown as Record<string, unknown>)[key]
  return val != null ? String(val) : '—'
}

const Spinner = () => (
  <svg className="animate-spin text-current h-6 w-6 text-[var(--brand-base)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
)

export default function ModelsComparePage() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [slots, setSlots] = useState<Array<CatalogModelItem | null>>([null, null, null])
  const [searches, setSearches] = useState(['', '', ''])

  const modelsQuery = useQuery({
    queryKey: ['catalog-models'],
    queryFn: () => listModels({ page_size: 100 }),
  })

  // 对比只支持文本模型（LLM），过滤掉 VLM / Audio / Video
  const models = useMemo(
    () => (modelsQuery.data?.items ?? []).filter((m) => getModelType(m.modalities) === 'LLM'),
    [modelsQuery.data]
  )

  // 接收来自其他页面的对比数据跳转
  useEffect(() => {
    if (models.length > 0 && location.state?.selectedIds) {
      const ids = location.state.selectedIds as string[]
      const newSlots: Array<CatalogModelItem | null> = [null, null, null]
      ids.slice(0, 3).forEach((id, idx) => {
        const found = models.find((m) => m.id === id)
        if (found) {
          newSlots[idx] = found
        }
      })
      setSlots(newSlots)
      
      // 清空路由 state，防止后续刷新再次覆盖 slots
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [models, location.state, navigate, location.pathname])

  // 每个模型槽位各自的输入框；同步开关打开时一处输入镜像到全部
  const [chatInputs, setChatInputs] = useState<string[]>(['', '', ''])
  const [syncInput, setSyncInput] = useState(true)
  const [histories, setHistories] = useState<Array<Array<{ role: 'user' | 'assistant'; content: string; meta?: string }>>>([
    [],
    [],
    []
  ])
  // 每个槽位独立的流式状态与 AbortController（并行对话互不阻塞）
  const [streaming, setStreaming] = useState<boolean[]>([false, false, false])
  const abortRefs = useRef<Array<AbortController | null>>([null, null, null])

  // 监听槽位变动，若槽位被置空，则自动清空对应槽位的历史对话
  useEffect(() => {
    setHistories((prev) => prev.map((history, idx) => {
      return slots[idx] ? history : []
    }))
  }, [slots])

  // 卸载时中止所有进行中的流，避免 setState-after-unmount
  useEffect(() => {
    const controllers = abortRefs.current
    return () => controllers.forEach((c) => c?.abort())
  }, [])

  // 输入变化：同步开启时镜像到全部槽位，否则只改当前槽位
  const handleInputChange = (idx: number, value: string) => {
    setChatInputs((prev) => (syncInput ? prev.map(() => value) : prev.map((v, i) => (i === idx ? value : v))))
  }

  const setSlotStreaming = (idx: number, value: boolean) =>
    setStreaming((prev) => prev.map((s, i) => (i === idx ? value : s)))

  // 更新某槽位最后一条 assistant 消息（流式增量 / 元信息 / 错误文案）
  const applyAssistant = (idx: number, updater: (content: string) => string, meta?: string) => {
    setHistories((prev) =>
      prev.map((history, i) => {
        if (i !== idx) return history
        const next = [...history]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') {
          next[next.length - 1] = { ...last, content: updater(last.content), ...(meta ? { meta } : {}) }
        }
        return next
      })
    )
  }

  // 向单个槽位发起真实体验对话流（POST /api/v1/experience/chat/completions）
  const streamOne = async (idx: number, prompt: string) => {
    const model = slots[idx]
    if (!model || streaming[idx]) return

    // 该槽位既有历史（仅 role/content）+ 本次输入 → 上游对话上下文
    const requestMessages = [
      ...histories[idx].map(({ role, content }) => ({ role, content })),
      { role: 'user' as const, content: prompt },
    ]

    setHistories((prev) =>
      prev.map((history, i) =>
        i === idx ? [...history, { role: 'user', content: prompt }, { role: 'assistant', content: '' }] : history
      )
    )
    setSlotStreaming(idx, true)
    abortRefs.current[idx]?.abort()
    const controller = new AbortController()
    abortRefs.current[idx] = controller
    const startedAt = Date.now()

    try {
      await streamExperienceChat({
        model: model.model_id,
        messages: requestMessages,
        signal: controller.signal,
        onDelta: (delta) => applyAssistant(idx, (content) => content + delta),
      })
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
      applyAssistant(idx, (content) => content, `延迟 ${seconds}s · 预估成本 ${formatPrice(model.pricing?.output_per_1m)} / 1M`)
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      applyAssistant(idx, (content) => content || `体验请求失败：${(err as Error).message || '请稍后重试'}`)
    } finally {
      setSlotStreaming(idx, false)
    }
  }

  // 从某个槽位发送：同步开启 → 同一 prompt 并行分发给所有已选模型；否则只发该模型
  const handleSendFrom = (idx: number) => {
    const prompt = chatInputs[idx].trim()
    if (!prompt) return

    if (syncInput) {
      slots.forEach((model, i) => {
        if (model) void streamOne(i, prompt)
      })
      setChatInputs(['', '', ''])
    } else {
      if (!slots[idx]) return
      void streamOne(idx, prompt)
      setChatInputs((prev) => prev.map((v, i) => (i === idx ? '' : v)))
    }
  }

  const handleClearChat = () => {
    abortRefs.current.forEach((c) => c?.abort())
    setStreaming([false, false, false])
    setHistories([[], [], []])
  }

  const setSlot = (idx: number, m: CatalogModelItem | null) => {
    setSlots((prev) => prev.map((s, i) => (i === idx ? m : s)))
  }

  const setSearch = (idx: number, v: string) => {
    setSearches((prev) => prev.map((s, i) => (i === idx ? v : s)))
  }

  const selectedModels = slots.filter((s): s is CatalogModelItem => s !== null)
  const hasAny = selectedModels.length > 0


  const ROWS: Array<{ labelKey: string; key: keyof CatalogModelItem | 'pricing_input' | 'pricing_output' | 'pricing_cache' }> = [
    { labelKey: 'modelsCompare.row.contextLength', key: 'context_length' },
    { labelKey: 'modelsCompare.row.maxOutput', key: 'max_output_tokens' },
    { labelKey: 'modelsCompare.row.modalities', key: 'modalities' },
    { labelKey: 'modelsCompare.row.releasedAt', key: 'released_at' },
    { labelKey: 'modelsCompare.row.knowledgeCutoff', key: 'knowledge_cutoff' },
    { labelKey: 'modelsCompare.row.inputPrice', key: 'pricing_input' },
    { labelKey: 'modelsCompare.row.outputPrice', key: 'pricing_output' },
    { labelKey: 'modelsCompare.row.cachePrice', key: 'pricing_cache' },
    { labelKey: 'modelsCompare.row.providersCount', key: 'providers_count' },
    { labelKey: 'modelsCompare.row.zeroDataRetention', key: 'zero_data_retention' },
    { labelKey: 'modelsCompare.row.inRegionRouting', key: 'in_region_routing' },
    { labelKey: 'modelsCompare.row.tags', key: 'tags' },
  ]

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-[var(--mg-text-0)] m-0 mb-1.5 tracking-tight">
          {t('modelsCompare.title')}
        </h1>
        <p className="text-[13px] text-[var(--mg-text-1)] m-0">
          {t('modelsCompare.desc', { max: MAX_COMPARE })}
        </p>
      </div>

      {modelsQuery.isLoading ? (
        <div className="flex justify-center items-center h-[200px]">
          <Spinner />
        </div>
      ) : modelsQuery.isError ? (
        <div className="text-[var(--mg-danger)] text-[13px] py-6">{t('modelsCompare.error.load')}</div>
      ) : (
        <div>
          {/* Picker row */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            {Array.from({ length: MAX_COMPARE }).map((_, idx) => (
              <ModelPicker
                key={idx}
                models={models.filter((m) => !slots.some((s, si) => si !== idx && s?.model_id === m.model_id))}
                selected={slots[idx]}
                onSelect={(m) => setSlot(idx, m)}
                onClear={() => setSlot(idx, null)}
                search={searches[idx]}
                onSearch={(v) => setSearch(idx, v)}
              />
            ))}
          </div>

          {/* Comparison table */}
          {hasAny && (
            <div className="border border-[var(--mg-border)] rounded-xl overflow-hidden shadow-sm bg-card-bg">
              {/* Header */}
              <div
                className="grid items-center border-b border-[var(--mg-border)] bg-[var(--mg-fill-0)]"
                style={{
                  gridTemplateColumns: `180px repeat(${selectedModels.length}, 1fr)`,
                }}
              >
                <div className="p-3.5 px-4 text-xs font-semibold text-[var(--mg-text-2)]">
                  {t('modelsCompare.table.attr')}
                </div>
                {selectedModels.map((m) => (
                  <div key={m.model_id} className="p-3.5 px-4 border-l border-[var(--mg-border)]">
                    <div className="flex items-center gap-2">
                      <ModelIcon model={m} size={22} rounded="rounded" />
                      <div className="min-w-0">
                        <div className="font-bold text-[13px] text-[var(--mg-text-0)] truncate">{m.display_name}</div>
                        <div className="text-[10px] text-[var(--mg-text-2)] font-mono truncate">{m.vendor}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Rows */}
              {ROWS.map((row, rowIdx) => (
                <div
                  key={row.key}
                  className={cn(
                    "grid items-center border-b border-[var(--mg-border)]",
                    rowIdx === ROWS.length - 1 && "border-none",
                    rowIdx % 2 === 0 ? "bg-transparent" : "bg-[var(--mg-fill-0)]/50"
                  )}
                  style={{
                    gridTemplateColumns: `180px repeat(${selectedModels.length}, 1fr)`,
                  }}
                >
                  <div className="p-3.5 px-4 text-xs font-semibold text-[var(--mg-text-1)]">
                    {t(row.labelKey)}
                  </div>
                  {selectedModels.map((m) => (
                    <div key={m.model_id} className="p-3.5 px-4 border-l border-[var(--mg-border)] text-[13px] text-[var(--mg-text-0)] flex items-center">
                      {renderCell(m, row.key)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* 对话对比 Playground */}
          {hasAny && (
            <div className="mt-8 pt-8 border-t border-[var(--mg-border)]">
              <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-sm font-bold text-[var(--mg-text-0)] m-0 flex items-center gap-2">
                    <LuMessageSquare size={15} className="text-[var(--brand-base)]" />
                    实时对话对比 (Chat Arena)
                  </h2>
                  <p className="text-[11.5px] text-[var(--mg-text-2)] m-0 mt-1">
                    每个模型卡片底部独立输入框；开启「同步输入」则一处输入分发给所有已选模型，分栏并行对比。
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {histories.some((h) => h.length > 0) && (
                    <button
                      onClick={handleClearChat}
                      title="清空对话历史"
                      className="h-8 px-3 rounded-lg cursor-pointer text-[var(--mg-text-2)] hover:text-[var(--mg-danger)] hover:bg-[var(--mg-fill-0)] transition-all flex items-center gap-1.5 border border-[var(--mg-border)] bg-transparent text-xs font-semibold"
                    >
                      <LuTrash2 size={14} />
                      清空
                    </button>
                  )}
                  <label className="flex items-center gap-2 select-none cursor-pointer">
                    <span className="text-[11.5px] font-semibold text-[var(--mg-text-2)]">同步输入</span>
                    <Switch checked={syncInput} onChange={setSyncInput} />
                  </label>
                </div>
              </div>

              {/* 多栏并排对话 */}
              <div
                className="grid gap-4 mb-5"
                style={{
                  gridTemplateColumns: `repeat(${selectedModels.length}, minmax(0, 1fr))`,
                }}
              >
                {slots.map((m, idx) => {
                  if (!m) return null
                  const history = histories[idx]
                  
                  return (
                    <div 
                      key={`${m.id}-${idx}`} 
                      className="glass-card-glow flex flex-col h-[440px] overflow-hidden rounded-xl border border-[var(--mg-border)]"
                    >
                      {/* 栏头部 */}
                      <div className="p-3 bg-[var(--mg-fill-0)]/40 border-b border-[var(--mg-border)]/65 flex items-center gap-2 shrink-0 select-none">
                        <ModelIcon model={m} size={20} rounded="rounded" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-[var(--mg-text-0)] truncate">{m.display_name}</div>
                          <div className="text-[9.5px] text-[var(--mg-text-2)] font-mono truncate">{m.model_id}</div>
                        </div>
                      </div>

                      {/* 消息历史滚动 */}
                      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 no-scrollbar bg-[var(--mg-bg-0)]/20">
                        {history.map((msg, msgIdx) => (
                          <div 
                            key={msgIdx} 
                            className={cn(
                              "flex flex-col gap-1 max-w-[85%]",
                              msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                            )}
                          >
                            <div 
                              className={cn(
                                "p-2.5 rounded-xl text-xs leading-relaxed shadow-sm",
                                msg.role === 'user'
                                  ? "bg-[var(--brand-selected-bg)] border border-[var(--brand-mid)]/10 text-[var(--mg-text-0)]"
                                  : "bg-[var(--mg-bg-0)] border border-[var(--mg-border)] text-[var(--mg-text-1)] border-l-[3px] border-l-[var(--brand-base)]"
                              )}
                            >
                              {msg.role === 'assistant' && msg.content === '' && streaming[idx] ? (
                                <span className="inline-flex gap-1 py-1 items-center" aria-label="生成中">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--mg-text-2)] animate-bounce [animation-delay:-0.3s]" />
                                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--mg-text-2)] animate-bounce [animation-delay:-0.15s]" />
                                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--mg-text-2)] animate-bounce" />
                                </span>
                              ) : (
                                msg.content.split('\n').map((line, lIdx) => (
                                  <p key={lIdx} className="m-0 select-text break-words">{line}</p>
                                ))
                              )}
                              {msg.meta && (
                                <span className="block text-[9.5px] text-[var(--mg-text-2)] mt-1.5 font-bold tracking-wide">
                                  {msg.meta}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}

                        {history.length === 0 && (
                          <div className="h-full flex flex-col items-center justify-center text-center p-4 select-none opacity-40">
                            <LuMessageSquare size={20} className="text-mg-text-2 mb-2" />
                            <span className="text-[10.5px] text-[var(--mg-text-2)]">等待发送提问</span>
                          </div>
                        )}
                      </div>

                      {/* 卡片底部输入框（复用渐变流光样式，紧凑版） */}
                      <div className="shrink-0 p-2 border-t border-[var(--mg-border)]/65 bg-[var(--mg-bg-0)]/30">
                        <div className="rounded-xl p-[1.5px] bg-gradient-to-r from-[#4285f4] via-[#9b72cb] to-[#d96570] transition-all focus-within:shadow-[0_0_14px_rgba(155,114,203,0.12)]">
                          <div className="rounded-[10px] bg-[var(--mg-bg-0)] p-2 flex items-end gap-2">
                            <textarea
                              value={chatInputs[idx]}
                              onChange={(e) => handleInputChange(idx, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault()
                                  handleSendFrom(idx)
                                }
                              }}
                              placeholder={syncInput ? '输入分发给全部模型…' : `仅向 ${m.display_name} 提问…`}
                              rows={1}
                              className="flex-1 w-full bg-transparent border-none outline-none resize-none text-[12.5px] text-[var(--mg-text-0)] placeholder-[var(--mg-text-2)] focus:ring-0 leading-relaxed max-h-20"
                            />
                            <button
                              onClick={() => handleSendFrom(idx)}
                              disabled={!chatInputs[idx].trim() || streaming[idx]}
                              title={syncInput ? '分发给全部模型' : '发送'}
                              className={cn(
                                "h-7 w-7 shrink-0 rounded-full flex items-center justify-center border-none transition-all",
                                chatInputs[idx].trim() && !streaming[idx]
                                  ? "bg-gradient-to-r from-[#9b72cb] to-[#d96570] text-white hover:opacity-90 active:scale-95 cursor-pointer"
                                  : "bg-[var(--mg-fill-0)] text-[var(--mg-text-2)]/50 cursor-not-allowed"
                              )}
                            >
                              <LuSparkles size={13} className={streaming[idx] ? 'animate-pulse' : ''} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

            </div>
          )}

          {!hasAny && (
            <div className="text-center py-12">
              <span className="text-[var(--mg-text-2)] text-[13px]">
                {t('modelsCompare.empty.hint')}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
