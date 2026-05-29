import { useTranslation } from 'react-i18next'

interface ModalityBadgeProps {
  modality: string
}

export function ModalityBadge({ modality }: ModalityBadgeProps) {
  const { t } = useTranslation()
  const colors: Record<string, { bg: string; color: string; border: string }> = {
    text:      { bg: 'var(--mg-primary-light)', color: 'var(--mg-primary)', border: 'var(--mg-primary-light-active)' },
    image:     { bg: '#f5f3ff', color: '#7c3aed', border: '#ede9fe' },
    audio:     { bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' },
    video:     { bg: '#fff7ed', color: '#ea580c', border: '#fed7aa' },
    embedding: { bg: '#fef9c3', color: '#ca8a04', border: '#fef08a' },
    reranker:  { bg: 'var(--mg-bg-1)', color: 'var(--mg-text-1)', border: 'var(--mg-fill-0)' },
  }
  const cfg = colors[modality] ?? colors.reranker
  const label = t(`models.modality.${modality}`, { defaultValue: modality })
  return (
    <span
      className="badge-interactive"
      style={{
        fontSize: '11px',
        fontWeight: 600,
        padding: '1px 7px',
        borderRadius: '10px',
        backgroundColor: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
      }}
    >
      {label}
    </span>
  )
}
