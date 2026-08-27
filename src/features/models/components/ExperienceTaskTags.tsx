/**
 * 「可体验任务」标签组（shared/modelgo_prd#872 需求点 10，原型 MarketplaceTaskTags）。
 * 卡片与详情规格条共用：有任务时逐个渲染独立小标签（去重后按任务顺序），
 * 无任务时渲染「暂未开放」纯文本（AC-13 口径不变）。
 *
 * 两种折叠口径，超出部分都收成「+N」，悬停/聚焦冒气泡列出其余：
 *   - `fit`：按容器**实际宽度**算一行能放几个（卡片用这个）
 *   - `max`：写死条数（保留给按条数控制的场景；详情页宽度富余，两个都不传即不折叠）
 *
 * 为什么卡片不能写死条数（2026-08-27）：同一份词表中英宽度差近一倍
 * （「文生视频」58px vs「Text-to-video」88px），而任务列宽随网格列数在 121~209px
 * 之间跳。155px 列宽下英文只放得下 1 个、中文放得下 2 个；121px 时中文两连(131px)
 * 也放不下，209px 时英文两连(194px)反而放得下 —— 任何固定值都会在某个
 * 语言×断点组合下翻车。原先卡片传 max={3} 且恰好 3 个任务时不折叠，视频模型的
 * 三连长标签就各占一行，把等高卡片的贴底规格区撑高三行（线上 Doubao-Seedance-2.0）。
 *
 * 宽度折叠与「+N」气泡的公共实现在 tag-fit.ts / TagOverflowChip.tsx（与 API 协议行共用）。
 * 样式 .mg-task-tags 在 catalog-grid-card.css（两处规格条都会引到 catalog.css 聚合）。
 */
import { useTranslation } from 'react-i18next'
import { experienceTaskLabel, type ExperienceTaskType } from '@/pages/models/model-experience-data'
import { TagOverflowChip } from './TagOverflowChip'
import { splitByFit, useTagFit } from './tag-fit'

/** 与 .mg-task-tags 的 gap 对齐的兜底值（真值从容器 column-gap 读） */
const TASK_GAP = 4

export function ExperienceTaskTags({
  tasks,
  max,
  fit,
}: {
  tasks: ExperienceTaskType[]
  max?: number
  /** 按容器实际宽度折叠到一行（卡片口径）。量不到宽度时（jsdom / 容器 0 宽）不折叠。 */
  fit?: boolean
}) {
  const { t } = useTranslation()
  const labels = [...new Set(tasks.map(experienceTaskLabel))]
  const { ref, fitted } = useTagFit<HTMLSpanElement>(labels, { gap: TASK_GAP, enabled: !!fit })

  if (labels.length === 0) {
    return <span className="mg-metric-value">{t('modelsCatalog.button.comingSoon')}</span>
  }

  const { visible, hidden } = splitByFit(labels, fit ? fitted : max ?? null)
  return (
    <span className={fit ? 'mg-task-tags is-fit' : 'mg-task-tags'} ref={ref}>
      {visible.map((label) => <em key={label}>{label}</em>)}
      {hidden.length > 0 && <TagOverflowChip hidden={hidden} className="mg-task-tags-more" />}
    </span>
  )
}
