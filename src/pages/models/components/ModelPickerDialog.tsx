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
 *
 * 容器形态（2026-07-31 二次修正，shared/modelgo_prd#320）：原型里两种入口是**两种形态**——
 * - single/compareSwitch：`.playground-model-panel` 锚定在触发按钮正下方的浮层
 *   （position:absolute; left:0; top:calc(100% + 6px)，无遮罩）。
 * - compareAdd：「添加模型/模型对比」走的是 `MarketplaceCompareModal`
 *   （App.tsx:18744，`.marketplace-compare-modal-overlay` fixed inset:0 + flex 居中 + 遮罩）。
 * 2026-07-30 那次「对齐原型」把三种模式全改成了锚定浮层，compareAdd 被顺带带偏——
 * 触发按钮在右上角，浮层挂在按钮左沿往右铺，直接捅出视口被裁。这里按原型把
 * compareAdd 改回「遮罩 + 居中」，另两种保持锚定；视觉细节仍走本仓 token。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  LuSearch, LuFileText, LuImage, LuMic, LuVideo, LuArrowRight, LuCircleAlert, LuWifiOff, LuCheck, LuFileX, LuX,
} from 'react-icons/lu'
import type { IconType } from 'react-icons'
import i18n from '@/i18n'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { modelVendorLabel, currencySymbol, isZhLang } from '@/features/models/model-format'
import { cn, formatContextLength, prettyModelName, trimPriceZeros } from '@/lib/utils'
import type { CatalogModelItem } from '@/types'
import {
  resolveModelCategory,
  isPaidModel,
  modelSupportsAttachment,
  modelCategoryTasks,
  modelExperienceTasks,
  EXPERIENCE_CATEGORY_ORDER,
  EXPERIENCE_CATEGORY_DEFAULT_TASK,
  experienceCategoryLabel,
  experienceTaskLabel,
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
  const currency = currencySymbol(model.pricing?.currency, isZhLang())
  const unit = model.price_unit ? `/${model.price_unit}` : '/1M tokens'
  if (!isPaidModel(model)) return i18n.t('modelsExperience.picker.free')
  const input = model.pricing?.input_per_1m
  if (!input) return '—'
  return `${currency}${trimPriceZeros(input)}${unit}`
}

function cachePriceLabel(model: CatalogModelItem): string {
  const currency = currencySymbol(model.pricing?.currency, isZhLang())
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

/** 浮层与视口边缘的最小留白（横竖同值，视觉上四周一致） */
const EDGE_MARGIN = 8
/** 可用空间再小也别把浮层压扁到没法用——低于这个值就宁可溢出一点，靠内部滚动兜 */
const MIN_PANEL_HEIGHT = 240

export interface ModelPickerDialogProps {
  open: boolean
  onClose: () => void
  /** 触发按钮的 DOM 节点（点击时 e.currentTarget 传入），浮层锚定在它正下方；
   *  为空时兜底为屏幕居中（理论上不该发生，所有调用方都应传） */
  anchorEl?: HTMLElement | null
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
    { label: i18n.t('modelsExperience.picker.vendor'), render: (m) => modelVendorLabel(m) },
    { label: i18n.t('modelsExperience.picker.contextWindow'), render: (m) => formatContextLength(m.context_length) },
    { label: i18n.t('modelsExperience.picker.inputPrice'), render: (m) => priceLabel(m) },
    { label: i18n.t('modelsExperience.picker.outputPrice'), render: (m) => {
      const currency = currencySymbol(m.pricing?.currency, isZhLang())
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
  anchorEl = null,
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
  const panelRef = useRef<HTMLDivElement>(null)
  // compareAdd 是「遮罩 + 居中」的 modal（原型 MarketplaceCompareModal），不参与锚点定位
  const isCentered = mode === 'compareAdd'
  // 首帧 hidden，测量完锚点坐标后才 visible，杜绝位置闪烁（同 Popover.tsx 的手法）
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({ position: 'fixed', visibility: 'hidden' })

  const computePosition = useCallback(() => {
    if (isCentered || !anchorEl) return
    const rect = anchorEl.getBoundingClientRect()
    const gap = 6
    const vw = window.innerWidth
    const vh = window.innerHeight
    const panelW = panelRef.current?.offsetWidth ?? rect.width
    const panelH = panelRef.current?.offsetHeight ?? 0

    let left = rect.left
    if (left + panelW > vw - EDGE_MARGIN) left = Math.max(EDGE_MARGIN, vw - panelW - EDGE_MARGIN)

    const spaceBelow = vh - rect.bottom
    const useTop = spaceBelow < panelH + gap && rect.top > spaceBelow
    const top = useTop ? undefined : rect.bottom + gap
    const bottom = useTop ? vh - rect.top + gap : undefined

    // 高度必须夹到「翻转后那一侧的实际可用空间」，不能交给 CSS 的 100vh：浮层顶边钉在
    // 按钮下方（top = rect.bottom + gap），而 max-height 按满屏算的话，按钮越靠页面中下部
    // 浮层底部就越捅出窗口——列表下半截和底部确认栏直接够不着（shared/modelgo_prd#302）。
    // 位置在这里算，高度就也在这里算，两者同源；已有的 scroll/resize reposition 自动带上。
    const avail = (useTop ? rect.top : spaceBelow) - gap - EDGE_MARGIN
    const maxHeight = Math.max(MIN_PANEL_HEIGHT, avail)

    setPanelStyle({
      position: 'fixed',
      top,
      bottom,
      left,
      zIndex: 60,
      visibility: 'visible',
      ['--mg-picker-max-h' as string]: `${maxHeight}px`,
    })
  }, [isCentered, anchorEl])

  useLayoutEffect(() => {
    if (open) {
      computePosition()
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPanelStyle({ position: 'fixed', visibility: 'hidden' })
    }
  }, [open, computePosition])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (anchorEl?.contains(target)) return
      if (panelRef.current && !panelRef.current.contains(target)) onClose()
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    function handleReposition() { computePosition() }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleReposition, true)
    window.addEventListener('resize', handleReposition)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleReposition, true)
      window.removeEventListener('resize', handleReposition)
    }
  }, [open, anchorEl, onClose, computePosition])

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
          const tasks = modelExperienceTasks(model)
          if (tasks.length > 0 && !tasks.includes(currentTask as ExperienceTaskType)) return false
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

  /** single 模式的候选分三组（原型 App.tsx:19562-19575 / 19729-19733）：
   *  当前任务 · X（推导任务含当前任务）→ 其他可体验任务（有任务但不含当前任务）
   *  → 暂不支持在线体验（推导任务为空，不可选）。任务一律由模态推导
   *  （modelExperienceTasks），不再读 experience_types（该字段后端将删除）。 */
  const singleGroupedRows = useMemo(() => {
    if (mode !== 'single') return []
    const taskOf = new Map(candidates.map((m) => [m.id, modelExperienceTasks(m)]))
    const withTasks = candidates.filter((m) => (taskOf.get(m.id)?.length ?? 0) > 0)
    const currentTaskModels = currentTask
      ? withTasks.filter((m) => taskOf.get(m.id)?.includes(currentTask as ExperienceTaskType))
      : withTasks
    const otherTaskModels = currentTask
      ? withTasks.filter((m) => !taskOf.get(m.id)?.includes(currentTask as ExperienceTaskType))
      : []
    const unsupportedModels = candidates.filter((m) => (taskOf.get(m.id)?.length ?? 0) === 0)

    const rows: Array<{ groupLabel: string } | { model: CatalogModelItem; unsupported: boolean }> = []
    if (currentTaskModels.length > 0) {
      // currentTask 是后端任务枚举字面值，转成展示文案再插值
      if (currentTask) {
        rows.push({ groupLabel: t('modelsExperience.picker.groupCurrentTask', { task: experienceTaskLabel(currentTask as ExperienceTaskType) }) })
      }
      currentTaskModels.forEach((model) => rows.push({ model, unsupported: false }))
    }
    if (otherTaskModels.length > 0) {
      rows.push({ groupLabel: t('modelsExperience.picker.groupOtherTasks') })
      otherTaskModels.forEach((model) => rows.push({ model, unsupported: false }))
    }
    if (unsupportedModels.length > 0) {
      rows.push({ groupLabel: t('modelsExperience.picker.groupUnsupported') })
      unsupportedModels.forEach((model) => rows.push({ model, unsupported: true }))
    }
    return rows
  }, [mode, candidates, currentTask, t])
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

  if (!open) return null

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal={isCentered ? 'true' : 'false'}
      aria-label={title}
      style={isCentered ? undefined : panelStyle}
      className={cn(
        'model-picker-dialog__panel mg-panel rounded-lg border border-mg-border bg-mg-bg-0 shadow-xl',
        'animate-in zoom-in-95 fade-in-0 duration-150',
        // 宽度用本仓 Modal 的既有刻度（sm 400 / md 520 / lg 720），但只在 lg 断点
        // (≥1024px) 才用满 720——之前不管视口多窄都死守 720，只有 <736px 那个
        // max-w 兜底才收缩，中间一大段笔记本宽度（900~1400px 很常见）完全没反应，
        // 弹层比可用空间宽得不成比例（2026-07-30 实测反馈）。别自造 880/1120 这种
        // 刻度外的值，本仓 Modal sm/md 就是刻度本身。
        mode === 'compareAdd'
          ? 'is-compare w-[92vw] sm:w-[520px] lg:w-[720px] max-w-[calc(100vw-16px)]'
          : 'w-[92vw] sm:w-[520px] lg:w-[720px] max-w-[calc(100vw-16px)]',
      )}
    >
      <div className="model-picker-dialog__panel-head">
        <span className="mg-text-title-sm font-bold text-mg-text-1">{title}</span>
        <button type="button" className="model-picker-dialog__panel-close" aria-label={t('modelsExperience.picker.cancel')} onClick={onClose}>
          <LuX size={16} />
        </button>
      </div>
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
                        {prettyModelName(model.display_name, model.model_id, modelVendorLabel(model, ''))}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-mg-text-3">
                        <span className="truncate">{modelVendorLabel(model)}</span>
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
            {/* compareSwitch 落进这个分支时之前直接吃 singleGroupedRows——那个 memo 对非 single
                模式恒返回 []（三组分类是 single 独有的原型交互），于是「切换模型」面板永远空、
                只剩搜索框（shared/modelgo_prd#316）。上面第 452 行的空状态判断早就正确地用了
                candidates，这里漏了同步，两处对不上就是本 bug。compareSwitch 用扁平 candidates，
                跟 addableCandidates 一样是 CatalogModelItem[]，下面 'model' in entry 判断本身
                兼容扁平数组（entry 本身当 model 用），不用改渲染逻辑。 */}
            {(mode === 'compareAdd' ? addableCandidates : mode === 'single' ? singleGroupedRows : candidates).map((entry) => {
              // single 模式按原型三组渲染，组标题作为列表项混在同一个流里
              if ('groupLabel' in entry) {
                return (
                  <div key={`group-${entry.groupLabel}`} className="model-picker-dialog__group-label">
                    {entry.groupLabel}
                  </div>
                )
              }
              const model = 'model' in entry ? entry.model : entry
              const unsupported = 'model' in entry ? entry.unsupported : false
              const reason = disableReasonOf(model, isBalanceZero, requiredAttachmentKind)
              const checked = mode === 'compareAdd' && checkedIds.includes(model.id)
              const atCap = mode === 'compareAdd' && !checked && checkedIds.length >= maxAdditional
              const disabled = unsupported || reason !== null || atCap
              return (
                <button
                  key={model.id}
                  type="button"
                  // 悬停即预览右栏详情（shared/modelgo_prd#351：滑过不出详情、点击行为不一致）。
                  // 附带统一了点击语义：桌面端悬停已把 detailId 设为本行，handleRowClick 的
                  // 「多任务模型第一次点击只预览」保护自然短路——所有模型点击=选中；
                  // 触屏无 hover 时该保护原样生效（首击预览、再击提交），无回归。
                  onMouseEnter={() => setDetailId(model.id)}
                  onClick={() => { if (!unsupported) handleRowClick(model) }}
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
                      {prettyModelName(model.display_name, model.model_id, modelVendorLabel(model, ''))}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-mg-text-3">
                      <span className="truncate">{modelVendorLabel(model)}</span>
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
                    {unsupported && (
                      <Badge variant="secondary" size="xs" className="gap-1">
                        <LuWifiOff size={10} /> {t('modelsExperience.picker.groupUnsupported')}
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
                        <span className="text-xs font-bold text-mg-text-1 truncate">{prettyModelName(m.display_name, m.model_id, modelVendorLabel(m, ''))}</span>
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
                      {prettyModelName(detailModel.display_name, detailModel.model_id, modelVendorLabel(detailModel, ''))}
                    </div>
                    <div className="text-xs text-mg-text-3">{modelVendorLabel(detailModel)}</div>
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
                  <div className="min-w-0">
                    <div className="text-xs text-mg-text-3 font-semibold">{t('modelsExperience.picker.contextWindow')}</div>
                    {/* 详情栏窄屏收窄到 200px 后这两格每格不到 90px，价格文案（如"¥10/1M tokens"）
                        中间有空格，浏览器默认换行会把单位拆到第二行，难看——加 nowrap+ellipsis，
                        宁可省略号收尾也不断行（2026-07-30 实测截图发现）。 */}
                    <div className="text-sm font-semibold text-mg-text-1 mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
                      {formatContextLength(detailModel.context_length)}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-mg-text-3 font-semibold">{t('modelsExperience.picker.price')}</div>
                    <div className="text-sm font-semibold text-mg-text-1 mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">{priceLabel(detailModel)}</div>
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

      {mode === 'compareAdd' && (
        <div className="model-picker-dialog__panel-footer">
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
      )}
    </div>
  )

  // compareAdd：遮罩 + flex 居中（原型 .marketplace-compare-modal-overlay 的形态，
  // 遮罩视觉复用本仓 Dialog 的 overlay 刻度）；点击遮罩关闭由既有的
  // document mousedown 外点处理器兜住，这里不用重复绑。
  return createPortal(
    isCentered ? (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in-0 duration-150">
        {panel}
      </div>
    ) : panel,
    document.body,
  )
}

export default ModelPickerDialog
