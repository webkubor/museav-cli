import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Spin, Tag, Typography, Input } from '@douyinfe/semi-ui'
import { LuSearch, LuPlus, LuX } from 'react-icons/lu'
import { listModels } from '@/services/catalog'
import type { CatalogModelItem } from '@/types'

const { Text } = Typography

const MAX_COMPARE = 3

function formatPrice(val: string | undefined) {
  if (!val) return '—'
  const n = parseFloat(val)
  if (isNaN(n)) return val
  return `$${n.toFixed(4)}`
}

function formatContext(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

interface ModelPickerProps {
  models: CatalogModelItem[]
  selected: CatalogModelItem | null
  onSelect: (m: CatalogModelItem) => void
  onClear: () => void
  search: string
  onSearch: (v: string) => void
}

function ModelPicker({ models, selected, onSelect, onClear, search, onSearch }: ModelPickerProps) {
  const [open, setOpen] = useState(false)

  const filtered = models.filter((m) =>
    (m.display_name + m.model_id + (m.vendor ?? '')).toLowerCase().includes(search.toLowerCase())
  )

  if (selected) {
    return (
      <div style={{
        border: '1px solid var(--semi-color-border)',
        borderRadius: '12px',
        padding: '16px',
        background: 'var(--semi-color-bg-0)',
        minHeight: '120px',
        position: 'relative',
      }}>
        <button
          onClick={onClear}
          style={{
            position: 'absolute', top: '10px', right: '10px',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--semi-color-text-2)', padding: '2px',
            display: 'flex', alignItems: 'center',
          }}
        >
          <LuX size={14} />
        </button>
        {selected.logo_url && (
          <img src={selected.logo_url} alt="" style={{ width: 28, height: 28, borderRadius: '6px', marginBottom: '8px' }} />
        )}
        <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--semi-color-text-0)', marginBottom: '4px' }}>
          {selected.display_name}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--semi-color-text-2)', fontFamily: 'monospace', marginBottom: '6px' }}>
          {selected.model_id}
        </div>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {selected.modalities.map((m) => (
            <Tag key={m} size="small" color="blue">{m}</Tag>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          border: '2px dashed var(--semi-color-border)',
          borderRadius: '12px',
          padding: '24px',
          background: 'transparent',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          color: 'var(--semi-color-text-2)',
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        <LuPlus size={20} />
        <span style={{ fontSize: '13px' }}>选择模型</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          right: 0,
          background: 'var(--semi-color-bg-0)',
          border: '1px solid var(--semi-color-border)',
          borderRadius: '10px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          zIndex: 100,
          maxHeight: '280px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{ padding: '8px' }}>
            <Input
              prefix={<LuSearch size={14} />}
              placeholder="搜索模型..."
              size="small"
              value={search}
              onChange={onSearch}
              autoFocus
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.slice(0, 30).map((m) => (
              <div
                key={m.model_id}
                onClick={() => { onSelect(m); setOpen(false); onSearch('') }}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--semi-color-fill-0)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
              >
                {m.logo_url && <img src={m.logo_url} alt="" style={{ width: 20, height: 20, borderRadius: '4px', flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--semi-color-text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.display_name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--semi-color-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.model_id}
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: 'var(--semi-color-text-2)' }}>
                未找到匹配模型
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const ROWS: Array<{ label: string; key: keyof CatalogModelItem | 'pricing_input' | 'pricing_output' }> = [
  { label: '上下文长度', key: 'context_length' },
  { label: '最大输出', key: 'max_output_tokens' },
  { label: '模态', key: 'modalities' },
  { label: '输入价格 / 1M tokens', key: 'pricing_input' },
  { label: '输出价格 / 1M tokens', key: 'pricing_output' },
  { label: '标签', key: 'tags' },
]

function renderCell(model: CatalogModelItem, key: string) {
  if (key === 'pricing_input') return formatPrice(model.pricing?.input_per_1m)
  if (key === 'pricing_output') return formatPrice(model.pricing?.output_per_1m)
  if (key === 'context_length') return formatContext(model.context_length)
  if (key === 'max_output_tokens') return formatContext(model.max_output_tokens)
  if (key === 'modalities') {
    return (
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {(model.modalities ?? []).map((m) => <Tag key={m} size="small" color="blue">{m}</Tag>)}
      </div>
    )
  }
  if (key === 'tags') {
    return (
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {(model.tags ?? []).slice(0, 4).map((t) => <Tag key={t} size="small">{t}</Tag>)}
      </div>
    )
  }
  const val = (model as unknown as Record<string, unknown>)[key]
  return val != null ? String(val) : '—'
}

export default function ModelsComparePage() {
  const [slots, setSlots] = useState<Array<CatalogModelItem | null>>([null, null, null])
  const [searches, setSearches] = useState(['', '', ''])

  const modelsQuery = useQuery({
    queryKey: ['catalog', 'models', 'all'],
    queryFn: () => listModels({ page_size: 200 }),
  })

  const models = modelsQuery.data?.items ?? []

  const setSlot = (idx: number, m: CatalogModelItem | null) => {
    setSlots((prev) => prev.map((s, i) => (i === idx ? m : s)))
  }

  const setSearch = (idx: number, v: string) => {
    setSearches((prev) => prev.map((s, i) => (i === idx ? v : s)))
  }

  const selectedModels = slots.filter((s): s is CatalogModelItem => s !== null)
  const hasAny = selectedModels.length > 0

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--semi-color-text-0)', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
          模型对比
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', margin: 0 }}>
          最多同时对比 {MAX_COMPARE} 个模型的规格与定价。
        </p>
      </div>

      {modelsQuery.isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
          <Spin size="large" />
        </div>
      ) : modelsQuery.isError ? (
        <div style={{ color: '#ef4444', fontSize: '13px', padding: '24px 0' }}>加载模型列表失败，请稍后重试。</div>
      ) : (
        <div>
          {/* Picker row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '32px' }}>
            {Array.from({ length: MAX_COMPARE }).map((_, idx) => (
              <ModelPicker
                key={idx}
                models={models.filter((m) => !slots.some((s, si) => si !== idx && s?.model_id === m.model_id))}
                selected={slots[idx]}
                onSelect={(m) => setSlot(idx, m)}
                onClear={() => setSlot(idx, null)}
                search={searches[idx]}
                onSearch={(v) => setSearch(idx, v)}
              />
            ))}
          </div>

          {/* Comparison table */}
          {hasAny && (
            <div style={{
              border: '1px solid var(--semi-color-border)',
              borderRadius: '12px',
              overflow: 'hidden',
            }}>
              {/* Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: `180px repeat(${selectedModels.length}, 1fr)`,
                background: 'var(--semi-color-fill-0)',
                borderBottom: '1px solid var(--semi-color-border)',
              }}>
                <div style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--semi-color-text-2)' }}>
                  属性
                </div>
                {selectedModels.map((m) => (
                  <div key={m.model_id} style={{ padding: '12px 16px', borderLeft: '1px solid var(--semi-color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {m.logo_url && <img src={m.logo_url} alt="" style={{ width: 22, height: 22, borderRadius: '4px' }} />}
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--semi-color-text-0)' }}>{m.display_name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--semi-color-text-2)', fontFamily: 'monospace' }}>{m.vendor}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Rows */}
              {ROWS.map((row, rowIdx) => (
                <div
                  key={row.key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `180px repeat(${selectedModels.length}, 1fr)`,
                    borderBottom: rowIdx < ROWS.length - 1 ? '1px solid var(--semi-color-fill-0)' : 'none',
                    background: rowIdx % 2 === 0 ? 'transparent' : 'var(--semi-color-fill-0)',
                  }}
                >
                  <div style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 500, color: 'var(--semi-color-text-1)', display: 'flex', alignItems: 'center' }}>
                    {row.label}
                  </div>
                  {selectedModels.map((m) => (
                    <div key={m.model_id} style={{ padding: '12px 16px', borderLeft: '1px solid var(--semi-color-fill-0)', fontSize: '13px', color: 'var(--semi-color-text-0)', display: 'flex', alignItems: 'center' }}>
                      {renderCell(m, row.key)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {!hasAny && (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <Text style={{ color: 'var(--semi-color-text-2)', fontSize: '13px' }}>
                请在上方选择至少一个模型开始对比
              </Text>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
