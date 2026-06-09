import { useTranslation } from 'react-i18next'

interface ModalityBadgeProps {
  modality: string
}

const MODALITY_CLASSES: Record<string, string> = {
  text:      'bg-mg-primary-light text-mg-primary border-mg-primary-light',
  image:     'bg-violet-500/10 text-violet-600 border-violet-500/20',
  audio:     'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  video:     'bg-orange-500/10 text-orange-600 border-orange-500/20',
  embedding: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
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
