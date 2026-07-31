import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuSearch, LuX, LuGitCompareArrows, LuFileText, LuImage, LuMic, LuVideo, LuArrowRight } from 'react-icons/lu'
import type { IconType } from 'react-icons'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn, formatContextLength, trimPriceZeros } from '@/lib/utils'
import type { CatalogModelItem } from '@/types'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { resolveModelCategory, modelExperienceTasks } from '../model-experience-data'

interface ModelsCompareModalProps {
  isOpen: boolean
  onClose: () => void
  allModels: CatalogModelItem[]
  onConfirmCompare?: (ids: string[]) => void
  initialSelectedIds?: string[]
  /**
   * 对比基准（发起对比的「当前模型」，PRD §7.7 模型广场对比以当前模型为基准）。
   * 候选资格判断（一级类别 + 共同支持的基准任务，均由模态推导）都以它为准；
   * 缺省时回退取 initialSelectedIds[0]（现有调用方始终把当前模型作为首个选中项传入）。
   */
  currentModelId?: string
}

const MAX_COMPARE = 3
const MODALITY_ICON: Record<string, IconType> = { text: LuFileText, image: LuImage, audio: LuMic, video: LuVideo }
const MODALITY_CODES = ['text', 'image', 'audio', 'video']

// 格式化展示单价，若无则显示横线；货币符号按模型自身 pricing.currency 解析，不写死 $
function formatPrice(val: string | undefined, currency: string | undefined) {
  if (!val) return '—'
  const n = parseFloat(val)
  if (isNaN(n)) return val
  const symbol = currency === 'USD' ? '$' : '¥'
  return `${symbol}${trimPriceZeros(n)}`
}

/**
 * 模型是否「公开在线」。status 真实取值见 Swagger catalog.ModelListItem：
 * available | unavailable | degraded（并非部分旧代码里误用的 disabled/enabled）。
 * 只有显式 unavailable 才算离线；缺省（老数据未下发该字段）按在线处理。
 */
function isOnline(model: CatalogModelItem): boolean {
  return model.status !== 'unavailable'
}

/** 输入 → 输出模态流：与 ModelPickerDialog 的 ModalityFlow 同口径，方向用箭头分隔 */
function ModalityFlow({ model }: { model: CatalogModelItem }) {
  const inputMods = (model.input_modalities ?? model.modalities ?? []).filter((m) => MODALITY_CODES.includes(m))
  const outputMods = (model.output_modalities ?? model.modalities ?? []).filter((m) => MODALITY_CODES.includes(m))
  if (inputMods.length === 0 && outputMods.length === 0) return <span>—</span>
  return (
    <span className="inline-flex items-center gap-1">
      {inputMods.map((m) => {
        const Icon = MODALITY_ICON[m]
        return Icon ? <Icon key={`i-${m}`} size={12} /> : null
      })}
      <LuArrowRight size={11} className="text-mg-text-3" />
      {outputMods.map((m) => {
        const Icon = MODALITY_ICON[m]
        return Icon ? <Icon key={`o-${m}`} size={12} /> : null
      })}
    </span>
  )
}

export const ModelsCompareModal: React.FC<ModelsCompareModalProps> = ({
  isOpen,
  onClose,
  allModels,
  onConfirmCompare,
  initialSelectedIds = [],
  currentModelId,
}) => {
  const { t } = useTranslation()
  const anchorId = currentModelId ?? initialSelectedIds[0]
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds)
  const [searchQuery, setSearchQuery] = useState('')

  // 弹窗打开瞬间在渲染期重置选中项（react.dev: adjusting state when a prop changes）
  const [prevOpen, setPrevOpen] = useState(isOpen)
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen)
    if (isOpen) setSelectedIds(initialSelectedIds)
  }

  // 监听 Esc 键自动关闭弹窗
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const anchorModel = useMemo(() => allModels.find((m) => m.id === anchorId), [allModels, anchorId])
  const anchorCategory = anchorModel ? resolveModelCategory(anchorModel) : undefined
  // 基准任务取模态推导任务集的首个（类别默认任务在前）——default_experience_type/
  // experience_types 字段后端将删除，共同任务资格改为「候选的推导任务集包含基准任务」
  const anchorTask = anchorModel ? modelExperienceTasks(anchorModel)[0] : undefined

  /**
   * 候选资格判断（PRD §7.7 模型广场页面）：compare_enabled=true、公开在线、一级类别
   * 与基准模型相同、且与基准模型共同支持基准任务的候选，最多再选 2 个。
   * 一级类别不同 / 不共享可体验任务的模型直接不出现在候选列表里（过滤掉，非禁用置灰）。
   * 无基准模型时（防御性兜底，理论上不会发生——现有调用方都会带上当前模型）不做限制。
   */
  const eligibleModels = useMemo(() => {
    return allModels.filter((m) => {
      if (m.id === anchorId) return false
      if (m.compare_enabled !== true) return false
      if (!isOnline(m)) return false
      if (!anchorModel) return true
      if (resolveModelCategory(m) !== anchorCategory) return false
      if (anchorTask && !modelExperienceTasks(m).includes(anchorTask)) return false
      return true
    })
  }, [allModels, anchorId, anchorModel, anchorCategory, anchorTask])

  if (!isOpen) return null

  // 已选模型（基准 + 已勾选候选），保留用户选择顺序
  const selectedModels = selectedIds
    .map((id) => allModels.find((m) => m.id === id))
    .filter((m): m is CatalogModelItem => !!m)

  // 左侧候选列表：仅在资格候选内搜索，支持中文、ID 和厂商的模糊查询
  const filteredModels = eligibleModels.filter((m) =>
    (m.display_name + m.model_id + (m.vendor ?? '')).toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleToggleModel = (modelId: string) => {
    if (modelId === anchorId) return // 基准模型固定参与对比，不可取消
    setSelectedIds((prev) => {
      if (prev.includes(modelId)) {
        return prev.filter((id) => id !== modelId)
      }
      if (prev.length >= MAX_COMPARE) return prev // 达到最大对比数，拦截
      return [...prev, modelId]
    })
  }

  const handleClearSelected = () => {
    setSelectedIds(anchorId ? [anchorId] : [])
  }

  // 厂商 Logo 渲染，提供精美后备
  const renderLogo = (m: CatalogModelItem) => (
    <ModelIcon model={m} size={24} rounded="rounded-sm" className="bg-white border border-mg-border/40" />
  )

  // 参数明细行（PRD §7.7：厂商、上下文窗口、输入/输出价格、缓存价格、输入→输出模态、
  // 兼容协议、能力标签——厂商已在卡片头部展示，这里不重复渲染）
  const ROWS: Array<{ label: string; render: (m: CatalogModelItem) => React.ReactNode }> = [
    { label: t('modelsCompare.row.contextLength', '上下文长度'), render: (m) => formatContextLength(m.context_length) },
    { label: t('modelsCompare.row.maxOutput', '最大输出'), render: (m) => formatContextLength(m.max_output_tokens) },
    { label: t('modelsCompare.row.modalityFlow', '输入→输出模态'), render: (m) => <ModalityFlow model={m} /> },
    { label: t('modelsCompare.row.inputPrice', '输入价格 (百万)'), render: (m) => formatPrice(m.pricing?.input_per_1m, m.pricing?.currency) },
    { label: t('modelsCompare.row.outputPrice', '输出价格 (百万)'), render: (m) => formatPrice(m.pricing?.output_per_1m, m.pricing?.currency) },
    { label: t('modelsCompare.row.cachePrice', '缓存读取 (百万)'), render: (m) => formatPrice(m.pricing?.cache_read_per_1m, m.pricing?.currency) },
    {
      label: t('modelsCompare.row.protocols', '兼容协议'),
      render: (m) => (m.protocols && m.protocols.length > 0 ? m.protocols.join(' / ') : 'openai'),
    },
    {
      label: t('modelsCompare.row.tags', '标签'),
      render: (m) => (
        <div className="flex gap-0.5 flex-wrap">
          {(m.tags ?? []).slice(0, 4).map((tag) => (
            <Badge key={tag} variant="secondary" size="xs">{tag}</Badge>
          ))}
        </div>
      ),
    },
  ]

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-black/35 backdrop-blur-[12px] animate-in fade-in duration-200 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-card-glow w-full max-w-5xl h-[80vh] max-h-[660px] rounded-lg flex flex-col overflow-hidden relative shadow-2xl animate-in zoom-in-95 duration-200"
      >
        {/* 顶栏 */}
        <div className="px-6 py-4 border-b border-mg-border flex items-center justify-between shrink-0 bg-mg-fill-0/20">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-selected-bg text-brand-base flex items-center justify-center">
              <LuGitCompareArrows size={18} />
            </div>
            <div>
              <h2 className="text-[14.5px] font-bold text-mg-text-1 m-0 leading-tight">
                {t('modelsCompare.title') || '模型性能对比'}
              </h2>
              <p className="text-xs text-mg-text-3 m-0 mt-0.5">
                最多可选 3 个模型进行对比，当前已选择 <strong className="text-brand-base">{selectedIds.length}</strong> / 3 个
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-mg-fill-0 hover:bg-mg-fill-1 text-mg-text-3 hover:text-mg-text-1 flex items-center justify-center cursor-pointer transition-all active:scale-90"
          >
            <LuX size={16} />
          </button>
        </div>

        {/* 主体两栏布局 */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* 左侧：选择模型列表 */}
          <div className="w-[280px] border-r border-mg-border flex flex-col bg-mg-fill-0/5 min-h-0 shrink-0">
            {/* 搜索框 */}
            <div className="p-3 border-b border-mg-border shrink-0">
              <Input
                prefix={<LuSearch size={14} className="text-mg-text-3" />}
                placeholder="搜索模型、ID 或厂商..."
                className="h-8 text-xs rounded-lg bg-mg-fill-0"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>

            {/* 滚动模型列表：基准模型固定置顶（不可取消）+ 同一级类别 / 同可体验类型的候选 */}
            <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
              {anchorModel && (
                <>
                  <div className="px-2.5 pt-1 pb-1 text-[11px] font-bold uppercase tracking-wide text-mg-text-4">
                    {t('modelsCompare.currentModel', '当前模型')}
                  </div>
                  <div
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-default select-none border border-brand-mid/15 border-l-2 border-l-brand-base bg-brand-selected-bg text-mg-text-1 font-bold"
                    aria-current="true"
                  >
                    {renderLogo(anchorModel)}
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-bold text-mg-text-1 truncate leading-tight">
                        {anchorModel.display_name}
                      </div>
                      <div className="text-xs text-mg-text-3 truncate font-mono mt-0.5">
                        {anchorModel.vendor || 'ModelGo'} · {anchorModel.model_id}
                      </div>
                    </div>
                  </div>
                  <div className="px-2.5 pt-2.5 pb-1 text-[11px] font-bold uppercase tracking-wide text-mg-text-4">
                    {t('modelsCompare.candidates', '可选候选')}
                  </div>
                </>
              )}

              {filteredModels.map((m) => {
                const isSelected = selectedIds.includes(m.id)
                const isDisabled = !isSelected && selectedIds.length >= MAX_COMPARE

                return (
                  <div
                    key={m.id}
                    onClick={() => !isDisabled && handleToggleModel(m.id)}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all select-none border border-transparent",
                      isSelected
                        ? "bg-brand-selected-bg border-brand-mid/15 border-l-2 border-l-brand-base text-mg-text-1 font-bold"
                        : "hover:bg-mg-fill-0/40 text-mg-text-2",
                      isDisabled && "opacity-30 cursor-not-allowed pointer-events-none"
                    )}
                  >
                    {renderLogo(m)}
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-bold text-mg-text-1 truncate leading-tight">
                        {m.display_name}
                      </div>
                      <div className="text-xs text-mg-text-3 truncate font-mono mt-0.5">
                        {m.vendor || 'ModelGo'} · {m.model_id}
                      </div>
                    </div>
                  </div>
                )
              })}

              {filteredModels.length === 0 && (
                <EmptyState
                  title={anchorModel && !searchQuery ? '暂无同类可对比模型' : '未匹配到相关模型'}
                />
              )}
            </div>
          </div>

          {/* 右侧：纵向对比区 */}
          <div className="flex-1 overflow-y-auto p-5 md:p-6 min-h-0 flex flex-col justify-between bg-mg-fill-0/5">
            {selectedModels.length > 0 ? (
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {selectedModels.map((m) => (
                  <div
                    key={m.id}
                    className="border border-mg-border bg-mg-bg-0 rounded-md p-4.5 relative shadow-sm hover:border-brand-base transition-all duration-300"
                  >
                    {/* 卡片头部 */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        {renderLogo(m)}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[13px] text-mg-text-1 leading-none">{m.display_name}</span>
                            <span className="text-xs text-brand-base font-semibold px-2 py-0.5 rounded-full bg-brand-selected-bg border border-brand-mid/10">
                              {m.vendor || 'ModelGo'}
                            </span>
                            {m.id === anchorId && (
                              <span className="text-xs text-mg-text-3 font-semibold px-2 py-0.5 rounded-full bg-mg-fill-1 border border-mg-border/40">
                                {t('modelsCompare.currentModel', '当前模型')}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-mg-text-3 font-mono mt-1.5">
                            ID: <span className="select-all text-mg-text-2 font-medium">{m.model_id}</span>
                          </div>
                        </div>
                      </div>

                      {/* 取消对比按钮（基准模型固定参与对比，不可取消） */}
                      {m.id !== anchorId && (
                        <button
                          onClick={() => handleToggleModel(m.id)}
                          className="w-5.5 h-5.5 rounded-full bg-mg-fill-0 hover:bg-mg-fill-2 text-mg-text-3 hover:text-mg-text-1 flex items-center justify-center transition-colors cursor-pointer"
                          title="取消对比"
                        >
                          <LuX size={12} />
                        </button>
                      )}
                    </div>

                    {/* 卡片属性网格 */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mt-3.5 pt-3.5 border-t border-mg-border">
                      {ROWS.map((row, idx) => (
                        <div key={idx} className="flex flex-col gap-1 min-w-0">
                          <span className="text-xs font-bold text-mg-text-3 tracking-wide">
                            {row.label}
                          </span>
                          <span className="text-[12px] font-semibold text-mg-text-1 truncate">
                            {row.render(m)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<LuGitCompareArrows size={26} className="opacity-40" />}
                title="请勾选需要对比的模型"
                description="在左侧列表中勾选最多 3 个模型，即可在此区域直观展示核心指标、上下文与价格对比。"
                className="flex-1 animate-in fade-in duration-300"
              />
            )}

            {/* 底部操作工具栏 */}
            <div className="mt-5 pt-4.5 border-t border-mg-border/50 flex items-center justify-between shrink-0 bg-transparent">
              {selectedIds.length > (anchorId ? 1 : 0) ? (
                <button
                  onClick={handleClearSelected}
                  className="text-xs text-mg-text-3 hover:text-brand-base font-semibold transition-colors bg-none border-none cursor-pointer active:scale-95"
                >
                  清空对比槽位
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="px-5 py-2 rounded-md text-xs font-semibold bg-mg-fill-0 hover:bg-mg-fill-1 text-mg-text-2 hover:text-mg-text-1 border border-mg-border/30 transition-all cursor-pointer active:scale-95 outline-none"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    if (onConfirmCompare) {
                      onConfirmCompare(selectedIds)
                    }
                    onClose()
                  }}
                  className="px-6 py-2 rounded-md text-xs font-bold bg-brand-base text-white hover:bg-brand-deep shadow-md hover:shadow-brand-glow/15 transition-all cursor-pointer active:scale-95 border-none outline-none"
                >
                  确认对比
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
