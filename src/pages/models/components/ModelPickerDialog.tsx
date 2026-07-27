/**
 * 模型选择器弹层（PRD 1.0.4 模型体验 §模型选择）。
 *
 * 两种用途，同一份列表 + 详情面板：
 * - mode="single"：首列 / 单模型选择器，带 对话/图像/音频/视频 类别 Tab。
 * - mode="compareAdd"：对比列切换模型，不展示类别 Tab，只列「当前会话同类别、
 *   同任务」的可替换模型（currentCategory/currentTask 收窄候选）。
 *
 * 硬约束（原文逐条落地）：
 * 1) 类别 Tab 只改变候选列表，不自动选中、不清空当前会话——纯 UI 状态，不触发 onSelect。
 * 2) 只有点击具体模型条目才调用 onSelect；禁用行（余额不足/已下线）点击只更新详情面板，不切换。
 * 3) 付费模型零余额时仍展示，禁用 + 标记「余额不足」；已下线模型仅展示 disabled 徽标（历史
 *    恢复场景不在本次范围，这里只提供状态位）。
 * 4) 条目只展示 图标/名称/厂商/输入→输出模态/价格/状态——不展示推理供应商。
 */
import { useMemo, useState } from 'react'
import {
  LuSearch, LuFileText, LuImage, LuMic, LuVideo, LuArrowRight, LuCircleAlert, LuWifiOff,
} from 'react-icons/lu'
import type { IconType } from 'react-icons'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { cn, formatContextLength, prettyModelName, trimPriceZeros } from '@/lib/utils'
import type { CatalogModelItem } from '@/types'
import '../styles/model-picker-dialog.css'

/** 一级类别，PRD 1.0.4 原文四类 */
export type ModelPickerCategory = 'dialogue' | 'image' | 'audio' | 'video'

/** 类别 → 任务枚举（仅用于分类推断/展示，任务级交互本次不实现） */
// 九类体验任务枚举，取自后端 2026-07-27 已合入 test 的《模型体验(Playground V1)前端接口文档》
// §二 task 值域，字面值以文档为准（不是 PRD 文字里的猜测名）
const CATEGORY_TASKS: Record<ModelPickerCategory, string[]> = {
  dialogue: ['text_to_text', 'image_to_text', 'video_to_text'],
  image: ['text_to_image', 'image_to_image'],
  audio: ['text_to_audio', 'audio_to_text'],
  video: ['text_to_video', 'image_to_video'],
}

const CATEGORY_ORDER: ModelPickerCategory[] = ['dialogue', 'image', 'audio', 'video']

const CATEGORY_LABEL: Record<ModelPickerCategory, string> = {
  dialogue: '对话',
  image: '图像',
  audio: '音频',
  video: '视频',
}

const MODALITY_ICON: Record<string, IconType> = {
  text: LuFileText,
  image: LuImage,
  audio: LuMic,
  video: LuVideo,
}
const MODALITY_CODES = ['text', 'image', 'audio', 'video']

function taskToCategory(task: string): ModelPickerCategory | undefined {
  for (const cat of CATEGORY_ORDER) {
    if (CATEGORY_TASKS[cat].includes(task)) return cat
  }
  return undefined
}

/**
 * 推断模型所属一级类别。优先取 experience_types（服务端下发的可体验任务，直接
 * 对应 PRD 任务枚举）；缺失时按 输出模态 兜底（老数据/字段未下发场景）。
 */
function resolveCategory(model: CatalogModelItem): ModelPickerCategory {
  for (const task of model.experience_types ?? []) {
    const cat = taskToCategory(task)
    if (cat) return cat
  }
  const out = model.output_modalities ?? model.modalities ?? []
  if (out.includes('video')) return 'video'
  if (out.includes('audio')) return 'audio'
  if (out.includes('image') && !out.includes('text')) return 'image'
  return 'dialogue'
}

/** 是否付费模型：只认服务端显式限免标记 + 价格字段，不做其它推断 */
function isPaidModel(model: CatalogModelItem): boolean {
  if (model.promotion?.free) return false
  const input = parseFloat(model.pricing?.input_per_1m ?? '0')
  const output = parseFloat(model.pricing?.output_per_1m ?? '0')
  return (Number.isFinite(input) && input > 0) || (Number.isFinite(output) && output > 0)
}

type DisableReason = 'offline' | 'balance' | null

function disableReasonOf(model: CatalogModelItem, isBalanceZero: boolean): DisableReason {
  if (model.status === 'disabled') return 'offline'
  if (isBalanceZero && isPaidModel(model)) return 'balance'
  return null
}

function priceLabel(model: CatalogModelItem): string {
  const currency = model.pricing?.currency === 'USD' ? '$' : '¥'
  const unit = model.price_unit ? `/${model.price_unit}` : '/1M tokens'
  if (!isPaidModel(model)) return '免费'
  const input = model.pricing?.input_per_1m
  if (!input) return '—'
  return `${currency}${trimPriceZeros(input)}${unit}`
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
  /** single=首列/单模型选择器(带类别Tab)；compareAdd=对比列切换(不带类别Tab，只列同类别同任务模型) */
  mode: 'single' | 'compareAdd'
  models: CatalogModelItem[]
  /** mode='compareAdd' 时需要，用于过滤候选 */
  currentCategory?: ModelPickerCategory
  /** mode='compareAdd' 时需要，用于过滤候选 */
  currentTask?: string
  onSelect: (model: CatalogModelItem) => void
  /** 余额是否为零，控制付费模型的禁用 + 「余额不足」标记 */
  isBalanceZero?: boolean
}

export function ModelPickerDialog({
  open,
  onClose,
  mode,
  models,
  currentCategory,
  currentTask,
  onSelect,
  isBalanceZero = false,
}: ModelPickerDialogProps) {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<ModelPickerCategory>(currentCategory ?? 'dialogue')
  const [detailId, setDetailId] = useState<string | null>(null)

  // 弹层重新打开时重置为初始状态（渲染期同步，非交互副作用，避免残留上一次的搜索/详情）
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setSearch('')
      setActiveCategory(currentCategory ?? 'dialogue')
      setDetailId(null)
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

  const detailModel = candidates.find((m) => m.id === detailId) ?? null

  function handleRowClick(model: CatalogModelItem) {
    setDetailId(model.id)
    if (disableReasonOf(model, isBalanceZero) === null) {
      onSelect(model)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      className="sm:max-w-[880px]"
      title={mode === 'single' ? '选择模型' : '切换模型'}
    >
      <div className="model-picker-dialog__body">
        <div className="model-picker-dialog__list-pane">
          <Input
            variant="search"
            prefix={<LuSearch size={14} className="text-mg-text-3" />}
            placeholder="搜索模型、厂商..."
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
                    {CATEGORY_LABEL[cat]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          <div className="model-picker-dialog__list">
            {candidates.length === 0 && (
              <EmptyState title="没有匹配的模型" className="py-10" />
            )}
            {candidates.map((model) => {
              const reason = disableReasonOf(model, isBalanceZero)
              const disabled = reason !== null
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => handleRowClick(model)}
                  className={cn(
                    'model-picker-dialog__row',
                    detailId === model.id && 'is-active',
                    disabled && 'is-disabled',
                  )}
                  aria-disabled={disabled}
                >
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
                        <LuCircleAlert size={10} /> 余额不足
                      </Badge>
                    )}
                    {reason === 'offline' && (
                      <Badge variant="secondary" size="xs" className="gap-1">
                        <LuWifiOff size={10} /> 已下线
                      </Badge>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="model-picker-dialog__detail-pane">
          {!detailModel ? (
            <EmptyState title="选择左侧模型查看详情" className="h-full justify-center" />
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
                {detailModel.tagline || '暂无模型简介。'}
              </p>

              {detailModel.tags && detailModel.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {detailModel.tags.slice(0, 6).map((tag) => (
                    <span key={tag} className="model-picker-dialog__detail-chip">{tag}</span>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-mg-border">
                <div>
                  <div className="text-xs text-mg-text-3 font-semibold">上下文窗口</div>
                  <div className="text-sm font-semibold text-mg-text-1 mt-0.5">
                    {formatContextLength(detailModel.context_length)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-mg-text-3 font-semibold">价格</div>
                  <div className="text-sm font-semibold text-mg-text-1 mt-0.5">{priceLabel(detailModel)}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-xs text-mg-text-3 font-semibold">兼容协议</div>
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
      </div>
    </Modal>
  )
}

export default ModelPickerDialog
