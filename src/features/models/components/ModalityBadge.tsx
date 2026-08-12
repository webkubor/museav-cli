import { useTranslation } from 'react-i18next'

interface ModalityBadgeProps {
  modality: string
}

const MODALITY_CLASSES: Record<string, string> = {
  text:      'bg-[var(--mg-modality-text-bg)] text-[var(--mg-modality-text-fg)] border-[var(--mg-modality-text-border)]',
  image:     'bg-[var(--mg-modality-image-bg)] text-[var(--mg-modality-image-fg)] border-[var(--mg-modality-image-border)]',
  audio:     'bg-[var(--mg-modality-audio-bg)] text-[var(--mg-modality-audio-fg)] border-[var(--mg-modality-audio-border)]',
  video:     'bg-[var(--mg-modality-video-bg)] text-[var(--mg-modality-video-fg)] border-[var(--mg-modality-video-border)]',
  embedding: 'bg-[var(--mg-modality-embedding-bg)] text-[var(--mg-modality-embedding-fg)] border-[var(--mg-modality-embedding-border)]',
  reranker:  'bg-[var(--mg-modality-reranker-bg)] text-[var(--mg-modality-reranker-fg)] border-[var(--mg-modality-reranker-border)]',
}

export function ModalityBadge({ modality }: ModalityBadgeProps) {
  const { t } = useTranslation()
  const cls = MODALITY_CLASSES[modality] ?? MODALITY_CLASSES.reranker
  const label = t(`models.modality.${modality}`, { defaultValue: modality })
  return (
    <span
      data-modality={modality in MODALITY_CLASSES ? modality : 'reranker'}
      className={`badge-interactive inline-flex items-center text-xs font-semibold px-[7px] py-[1px] rounded-sm border ${cls}`}
    >
      {label}
    </span>
  )
}
