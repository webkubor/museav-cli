/**
 * 模型选择器弹层（PRD 1.0.4 模型体验 §7.1/7.3）。
 *
 * 三种用途：
 * - mode="single"：首列 / 单模型选择器，带 对话/图像/音频/视频 类别 Tab，单击立即切换。
 * - mode="compareSwitch"：对比列内「切换模型」，不展示类别 Tab，只列「当前会话同类别、
 *   同任务」的可替换模型，单击立即切换（原文 §7.1："对比列内切换模型时复用相同的列表 +
 *   详情面板，但不展示类别 Tab，只列出当前会话同类别、同任务的可替换模型"）。
 * - mode="compareAdd"：单模型点「模型对比」或对比中点「添加模型」——多选，已选模型固定
 *   展示不可取消，右侧实时参数对照，确认后一次性批量加入（原文 §7.3）。
 *
 * 硬约束（原文逐条落地）：
 * 1) 类别 Tab 只改变候选列表，不自动选中、不清空当前会话——纯 UI 状态，不触发 onSelect。
 * 2) single/compareSwitch：只有点击具体模型条目才切换；禁用行（余额不足/已下线）点击只
 *    更新详情面板，不切换。
 * 3) compareAdd：已选模型固定展示且不可重复选择，只能在剩余名额内勾选候选，确认后才批量加入。
 * 4) 付费模型零余额时仍展示，禁用 + 标记「余额不足」；已下线模型仅展示 disabled 徽标。
 * 5) 条目只展示 图标/名称/厂商/输入→输出模态/价格/状态——不展示推理供应商。
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  LuSearch, LuFileText, LuImage, LuMic, LuVideo, LuArrowRight, LuCircleAlert, LuWifiOff, LuCheck, LuFileX,
} from 'react-icons/lu'
import type { IconType } from 'react-icons'
import i18n from '@/i18n'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { cn, formatContextLength, prettyModelName, trimPriceZeros } from '@/lib/utils'
import type { CatalogModelItem } from '@/types'
import {
  resolveModelCategory,
  isPaidModel,
  modelSupportsAttachment,
  modelCategoryTasks,
  EXPERIENCE_CATEGORY_ORDER,
  EXPERIENCE_CATEGORY_DEFAULT_TASK,
  experienceCategoryLabel,
  type ExperienceCategoryKey,
  type ExperienceTaskType,
} from '../model-experience-data'
import { TaskSwitch } from './TaskSwitch'
import '../styles/model-picker-dialog.css'

/** 一级类别，PRD 1.0.4 原文四类——复用 model-experience-data 里的共享定义，单模型页/对比页/弹窗三处口径一致 */
export type ModelPickerCategory = ExperienceCategoryKey

export type ModelPickerMode = 'single' | 'compareSwitch' | 'compareAdd'

const CATEGORY_ORDER = EXPERIENCE_CATEGORY_ORDER
const resolveCategory = resolveModelCategory

const MODALITY_ICON: Record<string, IconType> = {
  text: LuFileText,
  image: LuImage,
  audio: LuMic,
  video: LuVideo,
}
const MODALITY_CODES = ['text', 'image', 'audio', 'video']

type DisableReason = 'offline' | 'balance' | 'attachment' | null

function disableReasonOf(model: CatalogModelItem, isBalanceZero: boolean, requiredAttachmentKind?: string | null): DisableReason {
  if (model.status === 'disabled') return 'offline'
  if (isBalanceZero && isPaidModel(model)) return 'balance'
  if (requiredAttachmentKind && !modelSupportsAttachment(model, requiredAttachmentKind)) return 'attachment'
  return null
}

function priceLabel(model: CatalogModelItem): string {
  const currency = model.pricing?.currency === 'USD' ? '$' : '¥'
  const unit = model.price_unit ? `/${model.price_unit}` : '/1M tokens'
  if (!isPaidModel(model)) return i18n.t('modelsExperience.picker.free')
  const input = model.pricing?.input_per_1m
  if (!input) return '—'
  return `${currency}${trimPriceZeros(input)}${unit}`
}

function cachePriceLabel(model: CatalogModelItem): string {
  const currency = model.pricing?.currency === 'USD' ? '$' : '¥'
  const cache = model.pricing?.cache_read_per_1m
  if (!cache) return '—'
  return `${currency}${trimPriceZeros(cache)}/1M`
}

function ModalityFlow({ model }: { model: CatalogModelItem }) {
  const inputMods = (model.input_modalities ?? model.modalities ?? []).filter((m) => MODALITY_CODES.includes(m))
  const outputMods = (model.output_modalities ?? model.modalities ?? []).filter((m) => MODALITY_CODES.includes(m))
  return (
    <span className="model-picker-dialog__modal-flow">
      {inputMods.slice(0, 3).map((m) => {
        const Icon = MODALITY_ICON[m]
        return Icon ? <Icon key={m} size={12} /> : null
      })}
      <LuArrowRight size={11} />
      {outputMods.slice(0, 3).map((m) => {
        const Icon = MODALITY_ICON[m]
        return Icon ? <Icon key={m} size={12} /> : null
      })}
    </span>
  )
}

export interface ModelPickerDialogProps {
  open: boolean
  onClose: () => void
  mode: ModelPickerMode
  models: CatalogModelItem[]
  /** compareSwitch/compareAdd 时需要，用于过滤候选到同类别 */
  currentCategory?: ModelPickerCategory
  /** compareSwitch/compareAdd 时需要，用于过滤候选到同任务 */
  currentTask?: string
  /** single/compareSwitch：单击立即切换；显式点了「可体验任务」按钮组里的某个任务时带上 task */
  onSelect?: (model: CatalogModelItem, task?: ExperienceTaskType) => void
  /** compareAdd：已在对比会话中的模型，固定展示在候选列表最前，不可取消选中 */
  alreadySelectedIds?: string[]
  /** compareAdd：还能加入几个（3 - 已选数量），勾选数达到上限后其余候选禁用 */
  maxAdditional?: number
  /** compareAdd：确认后一次性把本轮勾选的模型交给调用方 */
  onConfirmAdd?: (models: CatalogModelItem[]) => void
  /** 余额是否为零，控制付费模型的禁用 + 「余额不足」标记 */
  isBalanceZero?: boolean
  /** single/compareSwitch：当前会话已暂存的附件类型（image/audio/video）。传入后，不支持
   *  该附件的候选模型会被禁用并标「不支持当前附件」（PRD 原型 MultimodalPlaygroundModelPicker
   *  的 disabledReason 逻辑，此前选择器完全没做这个判断）。 */
  requiredAttachmentKind?: string | null
}

/** 对比表行定义；用函数而非模块级常量是因为 label 要按当前语言取值（渲染时调用，随语言切换更新） */
function compareRows(): Array<{ label: string; render: (m: CatalogModelItem) => React.ReactNode }> {
  return [
    { label: i18n.t('modelsExperience.picker.vendor'), render: (m) => m.provider || m.vendor || 'ModelGo' },
    { label: i18n.t('modelsExperience.picker.contextWindow'), render: (m) => formatContextLength(m.context_length) },
    { label: i18n.t('modelsExperience.picker.inputPrice'), render: (m) => priceLabel(m) },
    { label: i18n.t('modelsExperience.picker.outputPrice'), render: (m) => {
      const currency = m.pricing?.currency === 'USD' ? '$' : '¥'
      const output = m.pricing?.output_per_1m
      if (!isPaidModel(m)) return i18n.t('modelsExperience.picker.free')
      return output ? `${currency}${trimPriceZeros(output)}/1M` : '—'
    } },
    { label: i18n.t('modelsExperience.picker.cachePrice'), render: (m) => cachePriceLabel(m) },
    { label: i18n.t('modelsExperience.picker.modalityFlow'), render: (m) => <ModalityFlow model={m} /> },
    { label: i18n.t('modelsExperience.picker.compatibleProtocols'), render: (m) => (m.protocols && m.protocols.length > 0 ? m.protocols.join(' / ') : 'openai') },
    {
      label: i18n.t('modelsExperience.picker.capabilityTags'),
      render: (m) => (
        <div className="flex flex-wrap gap-1">
          {(m.tags ?? []).slice(0, 4).map((tag) => (
            <span key={tag} className="model-picker-dialog__detail-chip">{tag}</span>
          ))}
        </div>
      ),
    },
  ]
}

export function ModelPickerDialog({
  open,
  onClose,
  mode,
  models,
  currentCategory,
  currentTask,
  onSelect,
  alreadySelectedIds = [],
  maxAdditional = 2,
  onConfirmAdd,
  isBalanceZero = false,
  requiredAttachmentKind = null,
}: ModelPickerDialogProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<ModelPickerCategory>(currentCategory ?? 'dialogue')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [checkedIds, setCheckedIds] = useState<string[]>([])

  // 弹层重新打开时重置为初始状态（渲染期同步，非交互副作用，避免残留上一次的搜索/详情）
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setSearch('')
      setActiveCategory(currentCategory ?? 'dialogue')
      setDetailId(null)
      setCheckedIds([])
    }
  }

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase()
    return models.filter((model) => {
      if (mode === 'single') {
        if (resolveCategory(model) !== activeCategory) return false
      } else {
        if (currentCategory && resolveCategory(model) !== currentCategory) return false
        if (currentTask) {
          const tasks = model.experience_types
          if (tasks && tasks.length > 0 && !tasks.includes(currentTask)) return false
        }
      }
      if (!q) return true
      const haystack = `${model.display_name} ${model.provider ?? ''} ${model.vendor ?? ''} ${model.model_id}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [models, mode, activeCategory, currentCategory, currentTask, search])

  // compareAdd：候选列表 = 已选模型（固定在前，不可交互）+ 其余可勾选候选
  const alreadySelectedModels = useMemo(
    () => alreadySelectedIds.map((id) => models.find((m) => m.id === id)).filter((m): m is CatalogModelItem => !!m),
    [alreadySelectedIds, models],
  )
  const addableCandidates = useMemo(
    () => candidates.filter((m) => !alreadySelectedIds.includes(m.id)),
    [candidates, alreadySelectedIds],
  )
  const checkedModels = useMemo(
    () => checkedIds.map((id) => models.find((m) => m.id === id)).filter((m): m is CatalogModelItem => !!m),
    [checkedIds, models],
  )
  const compareModels = mode === 'compareAdd' ? [...alreadySelectedModels, ...checkedModels] : []

  const detailModel = candidates.find((m) => m.id === detailId) ?? null

  function handleRowClick(model: CatalogModelItem) {
    if (mode === 'compareAdd') {
      setDetailId(model.id)
      if (disableReasonOf(model, isBalanceZero) !== null) return
      setCheckedIds((prev) => {
        if (prev.includes(model.id)) return prev.filter((id) => id !== model.id)
        if (prev.length >= maxAdditional) return prev
        return [...prev, model.id]
      })
      return
    }
    // single 模式下，一个类别声明了 >=2 个可体验任务的模型，第一次点行只预览（带出「可体验
    // 任务」按钮组），不立即提交——不然任务按钮组永远来不及被点到（点行的同一下就已经
    // onSelect+关弹层了）。已经预览过的行（detailId 已经是它）再点一次才按默认任务提交，
    // 跟点某个具体任务按钮（走 TaskSwitch onChange，不经过这个函数）二选一。
    const tasks = mode === 'single' ? modelCategoryTasks(model, resolveCategory(model)) : []
    if (tasks.length >= 2 && detailId !== model.id) {
      setDetailId(model.id)
      return
    }
    setDetailId(model.id)
    if (disableReasonOf(model, isBalanceZero, requiredAttachmentKind) === null) {
      onSelect?.(model)
    }
  }

  const title = mode === 'single' ? t('modelsExperience.picker.selectModel') : mode === 'compareSwitch' ? t('modelsExperience.picker.switchModel') : t('modelsExperience.picker.addCompareModel')

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      // compareAdd 右侧是最多 3 列的参数对比表格（88px 固定列 + N 等分列），880px 在选满
      // 3 个模型时明显局促——模型名/价格/模态全被截断；这个模式单独放宽，其余模式不动
      className={mode === 'compareAdd' ? 'sm:max-w-[1120px]' : 'sm:max-w-[880px]'}
      title={title}
      footer={
        mode === 'compareAdd' ? (
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-mg-text-3">
              {t('modelsExperience.picker.selectedCount', { count: alreadySelectedModels.length + checkedModels.length })}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>{t('modelsExperience.picker.cancel')}</Button>
              <Button
                variant="brand"
                size="sm"
                disabled={checkedModels.length === 0}
                onClick={() => {
                  onConfirmAdd?.(checkedModels)
                  onClose()
                }}
              >
                {t('modelsExperience.picker.confirmAdd', { count: checkedModels.length })}
              </Button>
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="model-picker-dialog__body">
        <div className="model-picker-dialog__list-pane">
          <Input
            variant="search"
            prefix={<LuSearch size={14} className="text-mg-text-3" />}
            placeholder={t('modelsExperience.picker.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs"
            autoFocus
          />

          {mode === 'single' && (
            <Tabs value={activeCategory} onValueChange={(v) => setActiveCategory(v as ModelPickerCategory)}>
              <TabsList variant="pills" className="w-full">
                {CATEGORY_ORDER.map((cat) => (
                  <TabsTrigger key={cat} value={cat} variant="pills" className="flex-1">
                    {experienceCategoryLabel(cat)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          <div className="model-picker-dialog__list">
            {mode === 'compareAdd' && alreadySelectedModels.length > 0 && (
              <>
                <div className="model-picker-dialog__group-label">{t('modelsExperience.picker.selectedModels')}</div>
                {alreadySelectedModels.map((model) => (
                  <div key={model.id} className="model-picker-dialog__row is-fixed-selected" aria-disabled>
                    <ModelIcon model={model} size={30} rounded="rounded-md" className="bg-mg-bg-0" />
                    <div className="model-picker-dialog__row-main">
                      <span className="mg-text-body font-semibold text-mg-text-1 truncate">
                        {prettyModelName(model.display_name, model.model_id)}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-mg-text-3">
                        <span className="truncate">{model.provider || model.vendor || 'ModelGo'}</span>
                      </span>
                    </div>
                    <span className="model-picker-dialog__fixed-badge"><LuCheck size={12} /> {t('modelsExperience.picker.alreadyInCompare')}</span>
                  </div>
                ))}
                <div className="model-picker-dialog__group-label">{t('modelsExperience.picker.addableCandidates')}</div>
              </>
            )}

            {(mode === 'compareAdd' ? addableCandidates : candidates).length === 0 && (
              <EmptyState title={t('modelsExperience.picker.noMatch')} className="py-10" />
            )}
            {(mode === 'compareAdd' ? addableCandidates : candidates).map((model) => {
              const reason = disableReasonOf(model, isBalanceZero, requiredAttachmentKind)
              const checked = mode === 'compareAdd' && checkedIds.includes(model.id)
              const atCap = mode === 'compareAdd' && !checked && checkedIds.length >= maxAdditional
              const disabled = reason !== null || atCap
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => handleRowClick(model)}
                  className={cn(
                    'model-picker-dialog__row',
                    (detailId === model.id || checked) && 'is-active',
                    disabled && 'is-disabled',
                  )}
                  aria-disabled={disabled}
                >
                  {mode === 'compareAdd' && (
                    <span className={cn('model-picker-dialog__checkbox', checked && 'is-checked')}>
                      {checked && <LuCheck size={11} />}
                    </span>
                  )}
                  <ModelIcon model={model} size={30} rounded="rounded-md" className="bg-mg-bg-0" />
                  <div className="model-picker-dialog__row-main">
                    <span className="mg-text-body font-semibold text-mg-text-1 truncate">
                      {prettyModelName(model.display_name, model.model_id)}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-mg-text-3">
                      <span className="truncate">{model.provider || model.vendor || 'ModelGo'}</span>
                      <ModalityFlow model={model} />
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="model-picker-dialog__price">{priceLabel(model)}</span>
                    {reason === 'balance' && (
                      <Badge variant="danger" size="xs" className="gap-1">
                        <LuCircleAlert size={10} /> {t('modelsExperience.picker.balanceInsufficient')}
                      </Badge>
                    )}
                    {reason === 'offline' && (
                      <Badge variant="secondary" size="xs" className="gap-1">
                        <LuWifiOff size={10} /> {t('modelsExperience.modelOffline')}
                      </Badge>
                    )}
                    {reason === 'attachment' && (
                      <Badge variant="secondary" size="xs" className="gap-1">
                        <LuFileX size={10} /> {t('modelsExperience.picker.attachmentUnsupported')}
                      </Badge>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {mode === 'compareAdd' ? (
          <div className="model-picker-dialog__detail-pane model-picker-dialog__compare-pane">
            {compareModels.length === 0 ? (
              <EmptyState title={t('modelsExperience.picker.checkToCompare')} className="h-full justify-center" />
            ) : (
              <div className="model-picker-dialog__compare-table">
                <div
                  className="model-picker-dialog__compare-row model-picker-dialog__compare-head"
                  style={{ gridTemplateColumns: `88px repeat(${compareModels.length}, 1fr)` }}
                >
                  <div />
                  {compareModels.map((m) => (
                    <div key={m.id} className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <ModelIcon model={m} size={18} rounded="rounded-sm" />
                        <span className="text-xs font-bold text-mg-text-1 truncate">{prettyModelName(m.display_name, m.model_id)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {compareRows().map((row) => (
                  <div
                    key={row.label}
                    className="model-picker-dialog__compare-row"
                    style={{ gridTemplateColumns: `88px repeat(${compareModels.length}, 1fr)` }}
                  >
                    <div className="text-xs font-semibold text-mg-text-3">{row.label}</div>
                    {compareModels.map((m) => (
                      <div key={m.id} className="text-xs text-mg-text-1 min-w-0 truncate">{row.render(m)}</div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="model-picker-dialog__detail-pane">
            {!detailModel ? (
              <EmptyState title={t('modelsExperience.picker.selectToViewDetail')} className="h-full justify-center" />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <ModelIcon model={detailModel} size={40} rounded="rounded-lg" className="bg-mg-bg-0" />
                  <div className="min-w-0">
                    <div className="mg-text-title-sm font-bold text-mg-text-1 truncate">
                      {prettyModelName(detailModel.display_name, detailModel.model_id)}
                    </div>
                    <div className="text-xs text-mg-text-3">{detailModel.provider || detailModel.vendor || 'ModelGo'}</div>
                  </div>
                </div>

                <p className="text-sm text-mg-text-2 leading-relaxed">
                  {detailModel.tagline || t('modelsExperience.picker.noTagline')}
                </p>

                {detailModel.tags && detailModel.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {detailModel.tags.slice(0, 6).map((tag) => (
                      <span key={tag} className="model-picker-dialog__detail-chip">{tag}</span>
                    ))}
                  </div>
                )}

                {/* 只在 single 模式显示：compareSwitch 的 task 是整个对比会话共用的，
                    换某一列的模型顺带改任务会让其余列的模型/任务对不上，不在这个入口开放。 */}
                {mode === 'single' && (() => {
                  const detailCategory = resolveCategory(detailModel)
                  const detailTasks = modelCategoryTasks(detailModel, detailCategory)
                  if (detailTasks.length < 2) return null
                  const fallback = EXPERIENCE_CATEGORY_DEFAULT_TASK[detailCategory]
                  const previewTask = (currentTask && detailTasks.includes(currentTask as ExperienceTaskType))
                    ? (currentTask as ExperienceTaskType)
                    : (detailTasks.includes(fallback) ? fallback : detailTasks[0])
                  return (
                    <div className="pt-1">
                      <div className="text-xs text-mg-text-3 font-semibold mb-1.5">{t('modelsExperience.taskSwitchLabel')}</div>
                      <TaskSwitch
                        tasks={detailTasks}
                        value={previewTask}
                        onChange={(task) => {
                          if (disableReasonOf(detailModel, isBalanceZero, requiredAttachmentKind) === null) onSelect?.(detailModel, task)
                        }}
                      />
                    </div>
                  )
                })()}

                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-mg-border">
                  <div>
                    <div className="text-xs text-mg-text-3 font-semibold">{t('modelsExperience.picker.contextWindow')}</div>
                    <div className="text-sm font-semibold text-mg-text-1 mt-0.5">
                      {formatContextLength(detailModel.context_length)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-mg-text-3 font-semibold">{t('modelsExperience.picker.price')}</div>
                    <div className="text-sm font-semibold text-mg-text-1 mt-0.5">{priceLabel(detailModel)}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs text-mg-text-3 font-semibold">{t('modelsExperience.picker.compatibleProtocols')}</div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {(detailModel.protocols && detailModel.protocols.length > 0 ? detailModel.protocols : ['openai']).map((p) => (
                        <span key={p} className="model-picker-dialog__detail-chip capitalize">{p}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

export default ModelPickerDialog
