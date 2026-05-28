import type { CatalogModelItem } from '@/types'
import { ModalityBadge } from './ModalityBadge'
import { VENDOR_ICON } from './vendor-icons'
import { formatContextLength, formatModelPrice, getFallbackAvatarText } from '@/lib/utils'

interface ModelCardProps {
  model: CatalogModelItem
  onSelect?: (id: string) => void
}

export function ModelCard({ model, onSelect }: ModelCardProps) {
  return (
    <div
      className="card-glow-hover"
      style={{
        background: 'var(--semi-color-bg-0)',
        border: '1px solid var(--semi-color-fill-0)',
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        cursor: onSelect ? 'pointer' : 'default',
      }}
      onClick={() => onSelect?.(model.id)}
    >
      {/* 头部：Logo + 名称 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ width: '28px', height: '28px', borderRadius: '6px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {model.logo_url
            ? <img src={model.logo_url} alt={model.vendor} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : (VENDOR_ICON[model.vendor?.toLowerCase() ?? ''] ?? (
              <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'var(--semi-color-fill-0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: 'var(--semi-color-text-2)' }}>
                {getFallbackAvatarText(model.vendor ?? model.display_name)}
              </div>
            ))
          }
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--semi-color-text-0)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {model.display_name}
          </div>
          {model.vendor && (
            <div style={{ fontSize: '11.5px', color: 'var(--semi-color-text-2)', marginTop: '1px' }}>{model.vendor}</div>
          )}
        </div>
      </div>

      {/* 模态标签 */}
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
        {model.modalities.map((m) => <ModalityBadge key={m} modality={m} />)}
      </div>

      {/* 参数行 */}
      <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--semi-color-text-1)' }}>
        <span>上下文 <b style={{ color: 'var(--semi-color-text-0)' }}>{formatContextLength(model.context_length)}</b></span>
        {model.pricing?.input_per_1m && (
          <span>输入 <b style={{ color: 'var(--semi-color-text-0)' }}>{formatModelPrice(model.pricing.input_per_1m, model.pricing.currency)}</b></span>
        )}
        {model.pricing?.output_per_1m && (
          <span>输出 <b style={{ color: 'var(--semi-color-text-0)' }}>{formatModelPrice(model.pricing.output_per_1m, model.pricing.currency)}</b></span>
        )}
      </div>
    </div>
  )
}

