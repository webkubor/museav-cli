import { useTranslation } from 'react-i18next'
import type { CatalogModelItem } from '@/types'
import { ModalityBadge } from './ModalityBadge'
import { ModelIcon } from './ModelIcon'
import { formatContextLength, formatModelPrice } from '@/lib/utils'

interface ModelCardProps {
  model: CatalogModelItem
  onSelect?: (id: string) => void
}

export function ModelCard({ model, onSelect }: ModelCardProps) {
  const { t } = useTranslation()
  return (
    <div
      className="card-glow-hover"
      style={{
        background: 'var(--mg-bg-0)',
        border: '1px solid var(--mg-fill-0)',
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        cursor: onSelect ? 'pointer' : 'default',
        overflow: 'hidden',
        minWidth: 0,
      }}
      onClick={() => onSelect?.(model.id)}
    >
      {/* 头部：Logo + 名称 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <ModelIcon model={model} size={28} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--mg-text-0)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {model.display_name}
          </div>
          {model.vendor && (
            <div style={{ fontSize: '11.5px', color: 'var(--mg-text-2)', marginTop: '1px' }}>{model.vendor}</div>
          )}
        </div>
      </div>

      {/* 模态标签 */}
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
        {model.modalities.map((m) => <ModalityBadge key={m} modality={m} />)}
      </div>

      {/* 参数行 */}
      <div style={{ display: 'flex', gap: '8px 16px', fontSize: '12px', color: 'var(--mg-text-1)', flexWrap: 'wrap' }}>
        <span>{t('models.card.context')} <b style={{ color: 'var(--mg-text-0)' }}>{formatContextLength(model.context_length)}</b></span>
        {model.pricing?.input_per_1m && (
          <span>{t('models.card.inputPrice')} <b style={{ color: 'var(--mg-text-0)' }}>{formatModelPrice(model.pricing.input_per_1m, model.pricing.currency)}</b></span>
        )}
        {model.pricing?.output_per_1m && (
          <span>{t('models.card.outputPrice')} <b style={{ color: 'var(--mg-text-0)' }}>{formatModelPrice(model.pricing.output_per_1m, model.pricing.currency)}</b></span>
        )}
      </div>
    </div>
  )
}

