import { useTranslation } from 'react-i18next'

interface ModalityBadgeProps {
  modality: string
}

const MODALITY_CLASSES: Record<string, string> = {
  text:      'bg-mg-primary-light text-mg-primary border-mg-primary-light',
  image:     'bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800/50',
  audio:     'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50',
  video:     'bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800/50',
  embedding: 'bg-yellow-50 dark:bg-yellow-950/30 text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800/50',
  reranker:  'bg-mg-fill-0 text-mg-text-1 border-mg-fill-1',
}

export function ModalityBadge({ modality }: ModalityBadgeProps) {
  const { t } = useTranslation()
  const cls = MODALITY_CLASSES[modality] ?? MODALITY_CLASSES.reranker
  const label = t(`models.modality.${modality}`, { defaultValue: modality })
  return (
    <span
      className={`badge-interactive inline-flex items-center text-[11px] font-semibold px-[7px] py-[1px] rounded-[10px] border ${cls}`}
    >
      {label}
    </span>
  )
}
