export const MODALITY_LABEL: Record<string, string> = {
  text: '文本',
  image: '图像',
  audio: '音频',
  video: '视频',
  embedding: '向量',
  reranker: '重排',
}

interface ModalityBadgeProps {
  modality: string
}

export function ModalityBadge({ modality }: ModalityBadgeProps) {
  const colors: Record<string, { bg: string; color: string; border: string }> = {
    text:      { bg: 'var(--semi-color-primary-light-default)', color: 'var(--semi-color-primary)', border: 'var(--semi-color-primary-light-active)' },
    image:     { bg: '#f5f3ff', color: '#7c3aed', border: '#ede9fe' },
    audio:     { bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' },
    video:     { bg: '#fff7ed', color: '#ea580c', border: '#fed7aa' },
    embedding: { bg: '#fef9c3', color: '#ca8a04', border: '#fef08a' },
    reranker:  { bg: 'var(--semi-color-bg-1)', color: 'var(--semi-color-text-1)', border: 'var(--semi-color-fill-0)' },
  }
  const cfg = colors[modality] ?? colors.reranker
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
      {MODALITY_LABEL[modality] ?? modality}
    </span>
  )
}
