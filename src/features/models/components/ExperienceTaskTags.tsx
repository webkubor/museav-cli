/**
 * 「可体验任务」标签组（shared/modelgo_prd#872 需求点 10，原型 MarketplaceTaskTags）。
 * 卡片与详情规格条共用：有任务时逐个渲染独立小标签（去重后按任务顺序），
 * 无任务时渲染「暂未开放」纯文本（AC-13 口径不变）。
 *
 * max：最多显示的标签数，超出折叠为「+N」计数标签，悬停/聚焦冒气泡列出其余
 * （防词表增长/英文长标签把等高卡片的贴底规格区撑高；详情页宽度富余不传即不折叠）。
 * 气泡走 portal 挂 body，与 OverflowTip 同一套 token 与理由 —— 规格值嵌在
 * .mg-tile 卡片里，卡片有 overflow 剪裁 + hover transform（transform 会劫持
 * fixed 的包含块），absolute/fixed 内联都会被剪。
 * 样式 .mg-task-tags 在 catalog-grid-card.css（两处规格条都会引到 catalog.css 聚合）。
 */
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { experienceTaskLabel, type ExperienceTaskType } from '@/pages/models/model-experience-data'

export function ExperienceTaskTags({ tasks, max }: { tasks: ExperienceTaskType[]; max?: number }) {
  const { t } = useTranslation()
  const labels = [...new Set(tasks.map(experienceTaskLabel))]
  if (labels.length === 0) {
    return <span className="mg-metric-value">{t('modelsCatalog.button.comingSoon')}</span>
  }
  // 只在真的超出时折叠：等于 max 时全量展示（折叠成 max-1 + 「+1」反而多占一个位）
  const folded = max !== undefined && labels.length > max
  const visible = folded ? labels.slice(0, max) : labels
  const hidden = folded ? labels.slice(max) : []
  return (
    <span className="mg-task-tags">
      {visible.map((label) => <em key={label}>{label}</em>)}
      {hidden.length > 0 && <TaskOverflowChip hidden={hidden} />}
    </span>
  )
}

/** 「+N」计数标签：悬停/键盘聚焦冒气泡列出被折叠的任务。 */
function TaskOverflowChip({ hidden }: { hidden: string[] }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const text = hidden.join(t('modelsExperience.listSeparator'))

  const show = () => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ x: r.left + r.width / 2, y: r.top - 6 })
  }

  return (
    <span
      ref={ref}
      role="img"
      tabIndex={0}
      aria-label={text}
      className="mg-task-tags-more"
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
      onFocus={show}
      onBlur={() => setPos(null)}
    >
      +{hidden.length}
      {pos && createPortal(
        <span
          role="tooltip"
          style={{ left: pos.x, top: pos.y }}
          className="pointer-events-none fixed z-[var(--mg-z-tooltip)] w-max max-w-[300px] -translate-x-1/2 -translate-y-full whitespace-normal rounded-[var(--mg-tooltip-radius)] border border-mg-border bg-mg-bg-3 px-[var(--mg-tooltip-pad-x)] py-[var(--mg-tooltip-pad-y)] text-left mg-text-caption font-medium leading-snug text-mg-text-2 shadow-lg"
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  )
}
