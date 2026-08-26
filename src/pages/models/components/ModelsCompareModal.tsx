import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuSearch, LuX, LuGitCompareArrows, LuFileText, LuImage, LuMic, LuVideo, LuArrowRight } from 'react-icons/lu'
import type { IconType } from 'react-icons'
import i18n from '@/i18n'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn, formatContextLength, trimPriceZeros } from '@/lib/utils'
import type { CatalogModelItem } from '@/types'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import {
  modelVendorLabel, currencySymbol, isZhLang, priceTierLabel, sortProtocols, priceUnitSuffix,
  protocolLabel, PROTOCOL_LABEL_ZH, PROTOCOL_LABEL_EN, mergeProtocolLabels,
} from '@/features/models/model-format'
import { usePublicProtocolsStore } from '@/store/use-public-protocols-store'
import {
  resolveModelCategory, modelExperienceTasks, isPaidModel,
  type ExperienceCategoryKey, type ExperienceTaskType,
} from '../model-experience-data'

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

  // ── 模型体验侧接入所需（shared/modelgo_prd#335）────────────────────────────
  /**
   * 已选且固定参与对比、不可取消的模型。缺省 = 基准模型一个（模型广场口径）；
   * 模型体验的对比页会把当前所有列都传进来（此时「当前模型」区展示多条）。
   */
  lockedIds?: string[]
  /** 参与对比的模型总数上限（含 locked）。默认 3；对比页按剩余列数传入。 */
  maxSelectable?: number
  /**
   * 零余额：付费模型禁用并标「余额不足」（PRD §7.1 硬约束 4）。
   * **模型广场不传** —— PRD 明确公开广场不引入余额资格过滤。
   */
  isBalanceZero?: boolean
  /**
   * 候选资格基准的一级类别 / 任务。不传则从基准模型推导（模型广场口径）；
   * 模型体验侧传当前会话的类别与任务，避免拿首列模型的默认任务去误判候选。
   */
  anchorCategory?: ExperienceCategoryKey
  anchorTask?: ExperienceTaskType
  /**
   * 只回传本次**新增**的模型（模型体验 onConfirmAdd 口径：调用方自己已经持有当前列）。
   * 与 onConfirmCompare 互不排斥，确认时两个都会调用（各自按需传）。
   */
  onConfirmAdd?: (added: CatalogModelItem[]) => void
}

const MAX_COMPARE = 3
const MODALITY_ICON: Record<string, IconType> = { text: LuFileText, image: LuImage, audio: LuMic, video: LuVideo }
const MODALITY_CODES = ['text', 'image', 'audio', 'video']

// 格式化展示单价，若无则显示横线；货币符号按模型自身 pricing.currency 解析，不写死 $
function formatPrice(val: string | undefined, currency: string | undefined) {
  if (!val) return '—'
  const n = parseFloat(val)
  if (isNaN(n)) return val
  // 零价（后端下发字符串 "0"）按未配价显示「—」，不渲染 ¥0（qa#624）
  if (n <= 0) return '—'
  const symbol = currencySymbol(currency, isZhLang())
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
  lockedIds,
  maxSelectable = MAX_COMPARE,
  isBalanceZero = false,
  anchorCategory: anchorCategoryProp,
  anchorTask: anchorTaskProp,
  onConfirmAdd,
}) => {
  const { t } = useTranslation()
  const isZhCurrent = isZhLang()
  const publicProtocolItems = usePublicProtocolsStore((s) => s.items)
  const protocolLabelMap = mergeProtocolLabels(
    isZhCurrent ? PROTOCOL_LABEL_ZH : PROTOCOL_LABEL_EN,
    publicProtocolItems,
    isZhCurrent ? 'label' : 'label_en',
  )
  const anchorId = currentModelId ?? initialSelectedIds[0] ?? lockedIds?.[0]
  /** 固定参与对比、不可取消的模型集合。模型广场只有基准一个，对比页是当前所有列。 */
  const lockedIdList = useMemo(
    () => (lockedIds && lockedIds.length > 0 ? lockedIds : anchorId ? [anchorId] : []),
    [lockedIds, anchorId],
  )
  /** 打开时的初始选中：调用方显式给了就用，否则等于锁定项。 */
  const initialSelection = initialSelectedIds.length > 0 ? initialSelectedIds : lockedIdList
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelection)
  const [searchQuery, setSearchQuery] = useState('')

  // 弹窗打开瞬间在渲染期重置选中项（react.dev: adjusting state when a prop changes）
  const [prevOpen, setPrevOpen] = useState(isOpen)
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen)
    if (isOpen) setSelectedIds(initialSelection)
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
  // 类别 / 任务基准：调用方显式给了就用（模型体验按当前会话），否则从基准模型推导（模型广场）。
  // 基准任务取模态推导任务集的首个（类别默认任务在前）——default_experience_type/
  // experience_types 字段后端将删除，共同任务资格改为「候选的推导任务集包含基准任务」
  const anchorCategory = anchorCategoryProp ?? (anchorModel ? resolveModelCategory(anchorModel) : undefined)
  const anchorTask = anchorTaskProp ?? (anchorModel ? modelExperienceTasks(anchorModel)[0] : undefined)

  /**
   * 候选资格判断（PRD §7.7 模型广场页面）：compare_enabled=true、公开在线、一级类别
   * 与基准相同、且与基准共同支持基准任务的候选。已锁定（当前模型 / 已在对比中的列）
   * 不再出现在候选里。一级类别不同 / 不共享可体验任务的模型直接过滤掉，不做禁用置灰。
   * 无基准时（防御性兜底，理论上不会发生——现有调用方都会带上当前模型）不做限制。
   */
  const eligibleModels = useMemo(() => {
    return allModels.filter((m) => {
      if (lockedIdList.includes(m.id)) return false
      if (m.compare_enabled !== true) return false
      if (!isOnline(m)) return false
      if (!anchorModel && !anchorCategory) return true
      if (anchorCategory && resolveModelCategory(m) !== anchorCategory) return false
      if (anchorTask && !modelExperienceTasks(m).includes(anchorTask)) return false
      return true
    })
  }, [allModels, lockedIdList, anchorModel, anchorCategory, anchorTask])

  /** 零余额时付费模型不可勾选（PRD §7.1 硬约束 4）。模型广场不传 isBalanceZero，恒为 false。 */
  const isBalanceBlocked = (m: CatalogModelItem) => isBalanceZero && isPaidModel(m)

  if (!isOpen) return null

  // 已选模型（锁定项 + 已勾选候选），保留用户选择顺序
  const selectedModels = selectedIds
    .map((id) => allModels.find((m) => m.id === id))
    .filter((m): m is CatalogModelItem => !!m)
  /** 锁定展示区的模型（模型广场 1 条 = 当前模型；对比页 = 当前所有列） */
  const lockedModels = lockedIdList
    .map((id) => allModels.find((m) => m.id === id))
    .filter((m): m is CatalogModelItem => !!m)
  /** 原型 `!sourceAccessible || selectedIds.length === 0`：基准不可用、或一个对手都没勾，都不放行。 */
  const confirmDisabled =
    selectedModels.length <= lockedIdList.length || lockedModels.some((m) => isBalanceBlocked(m))

  // 左侧候选列表：仅在资格候选内搜索，支持中文、ID 和厂商的模糊查询
  const filteredModels = eligibleModels.filter((m) =>
    (m.display_name + m.model_id + (m.vendor ?? '')).toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleToggleModel = (modelId: string) => {
    if (lockedIdList.includes(modelId)) return // 锁定项固定参与对比，不可取消
    const target = allModels.find((m) => m.id === modelId)
    if (target && isBalanceBlocked(target)) return
    setSelectedIds((prev) => {
      if (prev.includes(modelId)) {
        return prev.filter((id) => id !== modelId)
      }
      if (prev.length >= maxSelectable) return prev // 达到最大对比数，拦截
      return [...prev, modelId]
    })
  }

  const handleClearSelected = () => {
    setSelectedIds(lockedIdList)
  }

  // 厂商 Logo 渲染，提供精美后备
  const renderLogo = (m: CatalogModelItem) => (
    <ModelIcon model={m} variant="compact" rounded="rounded-sm" className="bg-white border border-mg-border/40" />
  )

  // 参数明细行（PRD §7.7：厂商、上下文窗口、输入/输出价格、缓存价格、输入→输出模态、
  // 兼容协议、能力标签——厂商已在卡片头部展示，这里不重复渲染）
  const ROWS: Array<{ label: string; render: (m: CatalogModelItem) => React.ReactNode }> = [
    { label: t('modelsCompare.row.contextLength'), render: (m) => formatContextLength(m.context_length) },
    { label: t('modelsCompare.row.modalityFlow'), render: (m) => <ModalityFlow model={m} /> },
    { label: t('modelsCompare.row.inputPrice'), render: (m) => {
      // 限免只认 promotion.free 显式标记（与 dualPriceText / 广场卡片同口径，qa#624）
      if (m.promotion?.free) return i18n.t('modelsExperience.limitedFree')
      if (m.price_tiers?.length)
        return m.price_tiers.map((tier) => `${priceTierLabel(tier, isZhLang())} ${formatPrice(tier.price, m.pricing?.currency)}/${tier.unit}`).join(' · ')
      // per_call（按张计价）：行标签写死「(百万)」不适用，价格带上 /张 免得被读成每 M（prd#851 同族）
      if (m.pricing?.mode === 'per_call') {
        const perCall = formatPrice(m.pricing.per_call_price || m.pricing.input_per_1m, m.pricing?.currency)
        return perCall === '—' ? '—' : `${perCall}${priceUnitSuffix(m.price_unit, 'per_call')}`
      }
      return formatPrice(m.pricing?.input_per_1m, m.pricing?.currency)
    } },
    { label: t('modelsCompare.row.outputPrice'), render: (m) => (
      m.price_tiers?.length || m.pricing?.mode === 'per_call' ? '—' : formatPrice(m.pricing?.output_per_1m, m.pricing?.currency)
    ) },
    { label: t('modelsCompare.row.cachePrice'), render: (m) => (
      m.price_tiers?.length || m.pricing?.mode === 'per_call' ? '—' : formatPrice(m.pricing?.cache_read_per_1m, m.pricing?.currency)
    ) },
    {
      label: t('modelsCompare.row.protocols'),
      render: (m) => (m.protocols && m.protocols.length > 0
        ? sortProtocols(m.protocols).map((p) => protocolLabel(p, isZhCurrent, protocolLabelMap)).join(' / ')
        : protocolLabel('openai_chat', isZhCurrent, protocolLabelMap)),
    },
    {
      label: t('modelsCompare.row.tags'),
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
    <Modal
      open={isOpen}
      onClose={onClose}
      closeButton={false}
      size="lg"
      className="sm:max-w-[1024px] h-[80vh] max-h-[660px] !p-0"
    >
      <div className="flex h-full flex-col">
        {/* 顶栏 */}
        <div className="px-6 py-4 border-b border-mg-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-selected-bg text-brand-base flex items-center justify-center">
              <LuGitCompareArrows size={18} />
            </div>
            <div>
              <h2 className="text-[14.5px] font-bold text-mg-text-1 m-0 leading-tight">
                {t('modelsCompare.title')}
              </h2>
              <p className="text-xs text-mg-text-3 m-0 mt-0.5">
                {t('modelsCompare.selectedCount', { max: maxSelectable, count: selectedIds.length })}
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
                placeholder={t('modelsCompare.searchDetailed')}
                className="h-8 text-xs rounded-lg bg-mg-fill-0"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>

            {/* 滚动模型列表：基准模型固定置顶（不可取消）+ 同一级类别 / 同可体验类型的候选 */}
            <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
              {lockedModels.length > 0 && (
                <>
                  <div className="px-2.5 pt-1 pb-1 text-[11px] font-bold uppercase tracking-wide text-mg-text-4">
                    {lockedModels.length > 1
                      ? t('modelsCompare.selectedModels')
                      : t('modelsCompare.currentModel')}
                  </div>
                  {lockedModels.map((locked) => (
                    <div
                      key={locked.id}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-default select-none border border-brand-mid/15 border-l-2 border-l-brand-base bg-brand-selected-bg text-mg-text-1 font-bold"
                      aria-current="true"
                    >
                      {renderLogo(locked)}
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-bold text-mg-text-1 truncate leading-tight">
                          {locked.display_name}
                        </div>
                        <div className="text-xs text-mg-text-3 truncate font-mono mt-0.5">
                          {modelVendorLabel(locked)} · {locked.model_id}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="px-2.5 pt-2.5 pb-1 text-[11px] font-bold uppercase tracking-wide text-mg-text-4">
                    {t('modelsCompare.candidates')}
                  </div>
                </>
              )}

              {filteredModels.map((m) => {
                const isSelected = selectedIds.includes(m.id)
                // 零余额的付费模型仍然展示，只禁用并标「余额不足」（PRD §7.1 硬约束 4）；
                // 槽位满则是另一种禁用（不加徽标，避免与余额原因混淆）。
                const balanceBlocked = isBalanceBlocked(m)
                const capReached = !isSelected && selectedIds.length >= maxSelectable
                const isDisabled = balanceBlocked || capReached

                return (
                  <div
                    key={m.id}
                    data-model-id={m.id}
                    onClick={() => !isDisabled && handleToggleModel(m.id)}
                    title={balanceBlocked ? t('modelsExperience.picker.balanceInsufficient') : undefined}
                    aria-disabled={isDisabled}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all select-none border border-transparent",
                      isSelected
                        ? "bg-brand-selected-bg border-brand-mid/15 border-l-2 border-l-brand-base text-mg-text-1 font-bold"
                        : "hover:bg-mg-fill-0/40 text-mg-text-2",
                      balanceBlocked && "opacity-60 cursor-not-allowed hover:bg-transparent",
                      capReached && "opacity-30 cursor-not-allowed pointer-events-none"
                    )}
                  >
                    {renderLogo(m)}
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-bold text-mg-text-1 truncate leading-tight">
                        {m.display_name}
                      </div>
                      <div className="text-xs text-mg-text-3 truncate font-mono mt-0.5">
                        {modelVendorLabel(m)} · {m.model_id}
                      </div>
                    </div>
                    {balanceBlocked && (
                      <Badge variant="secondary" size="xs" className="shrink-0">
                        {t('modelsExperience.picker.balanceInsufficient')}
                      </Badge>
                    )}
                  </div>
                )
              })}

              {filteredModels.length === 0 && (
                <EmptyState
                  title={anchorModel && !searchQuery ? t('modelsCompare.empty.noComparable') : t('modelsCompare.empty.noRelevant')}
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
                              {modelVendorLabel(m)}
                            </span>
                            {lockedIdList.includes(m.id) && (
                              <span className="text-xs text-mg-text-3 font-semibold px-2 py-0.5 rounded-full bg-mg-fill-1 border border-mg-border/40">
                                {t('modelsCompare.currentModel')}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-mg-text-3 font-mono mt-1.5">
                            ID: <span className="select-all text-mg-text-2 font-medium">{m.model_id}</span>
                          </div>
                        </div>
                      </div>

                      {/* 取消对比按钮（锁定项固定参与对比，不可取消） */}
                      {!lockedIdList.includes(m.id) && (
                        <button
                          onClick={() => handleToggleModel(m.id)}
                          className="w-5.5 h-5.5 rounded-full bg-mg-fill-0 hover:bg-mg-fill-2 text-mg-text-3 hover:text-mg-text-1 flex items-center justify-center transition-colors cursor-pointer"
                          title={t('modelsCompare.button.remove')}
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
                title={t('modelsCompare.empty.selectTitle')}
                description={t('modelsCompare.empty.selectDesc', { max: maxSelectable })}
                className="flex-1 animate-in fade-in duration-300"
              />
            )}

            {/* 底部操作工具栏 */}
            <div className="mt-5 pt-4.5 border-t border-mg-border/50 flex items-center justify-between shrink-0 bg-transparent">
              {selectedIds.length > lockedIdList.length ? (
                <button
                  onClick={handleClearSelected}
                  className="text-xs text-mg-text-3 hover:text-brand-base font-semibold transition-colors bg-none border-none cursor-pointer active:scale-95"
                >
                  {t('modelsCompare.button.clear')}
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={onClose}>
                  {t('modelsCompare.button.cancel')}
                </Button>
                {/* 原型口径 disabled={!sourceAccessible || selectedIds.length === 0}：
                    至少勾 1 个对手才能开始对比；基准模型自身余额不足时也不放行。 */}
                <Button
                  variant="brand"
                  size="sm"
                  disabled={confirmDisabled}
                  onClick={() => {
                    // 两种口径并存：模型广场要完整模型组（含基准），模型体验只要本次新增的。
                    onConfirmCompare?.(selectedIds)
                    onConfirmAdd?.(selectedModels.filter((m) => !lockedIdList.includes(m.id)))
                    onClose()
                  }}
                >
                  {t('modelsCompare.button.confirm')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
