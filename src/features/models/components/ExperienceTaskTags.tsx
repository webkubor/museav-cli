/**
 * 「可体验任务」标签组（shared/modelgo_prd#872 需求点 10，原型 MarketplaceTaskTags）。
 * 卡片与详情规格条共用：有任务时逐个渲染独立小标签（去重后按任务顺序），
 * 无任务时渲染「暂未开放」纯文本（AC-13 口径不变）。
 * 样式 .mg-task-tags 在 catalog-grid-card.css（两处规格条都会引到 catalog.css 聚合）。
 */
import { useTranslation } from 'react-i18next'
import { experienceTaskLabel, type ExperienceTaskType } from '@/pages/models/model-experience-data'

export function ExperienceTaskTags({ tasks }: { tasks: ExperienceTaskType[] }) {
  const { t } = useTranslation()
  const labels = [...new Set(tasks.map(experienceTaskLabel))]
  if (labels.length === 0) {
    return <span className="mg-metric-value">{t('modelsCatalog.button.comingSoon')}</span>
  }
  return (
    <span className="mg-task-tags">
      {labels.map((label) => <em key={label}>{label}</em>)}
    </span>
  )
}
