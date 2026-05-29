import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { LuSearch, LuPlus, LuX } from 'react-icons/lu'
import { listModels } from '@/services/catalog'
import type { CatalogModelItem } from '@/types'
import { cn } from '@/lib/utils'

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
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const filtered = models.filter((m) =>
    (m.display_name + m.model_id + (m.vendor ?? '')).toLowerCase().includes(search.toLowerCase())
  )

  if (selected) {
    return (
      <div className="border border-[var(--mg-border)] rounded-xl p-4 bg-card-bg min-h-[120px] relative">
        <button
          onClick={onClear}
          className="absolute top-2.5 right-2.5 bg-none border-none cursor-pointer text-[var(--mg-text-2)] hover:text-[var(--mg-text-1)] p-0.5 flex items-center transition-colors"
        >
          <LuX size={14} />
        </button>
        {selected.logo_url && (
          <img src={selected.logo_url} alt="" className="w-7 h-7 rounded-md mb-2 object-contain" />
        )}
        <div className="font-semibold text-sm text-[var(--mg-text-0)] mb-1">
          {selected.display_name}
        </div>
        <div className="text-[11px] text-[var(--mg-text-2)] font-mono mb-1.5 truncate">
          {selected.model_id}
        </div>
        <div className="flex gap-1 flex-wrap">
          {selected.modalities.map((m) => (
            <Badge key={m} variant="info" className="py-0.5 px-2">{m}</Badge>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full border-2 border-dashed border-[var(--mg-border)] rounded-xl p-6 bg-transparent cursor-pointer flex flex-col items-center gap-2 text-[var(--mg-text-2)] hover:border-[var(--brand-base)] hover:text-[var(--brand-base)] hover:bg-[var(--mg-fill-0)]/50 transition-all duration-150"
      >
        <LuPlus size={20} />
        <span className="text-[13px]">{t('modelsCompare.button.select')}</span>
      </button>

      {open && (
        <div className="absolute top-[calc(100%+6px)] left-0 right-0 bg-card-bg border border-[var(--mg-border)] rounded-lg shadow-lg z-50 max-h-[280px] overflow-hidden flex flex-col animate-[fadeIn_0.15s_ease-out]">
          <div className="p-2 border-b border-[var(--mg-border)] bg-[var(--mg-fill-0)]">
            <div className="relative w-full">
              <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mg-text-2)] w-3.5 h-3.5" />
              <Input
                placeholder={t('modelsCompare.placeholder.search')}
                className="pl-8.5 pr-3 h-8 text-xs rounded-md"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1 py-1">
            {filtered.slice(0, 30).map((m) => (
              <div
                key={m.model_id}
                onClick={() => { onSelect(m); setOpen(false); onSearch('') }}
                className="px-3 py-2 cursor-pointer flex items-center gap-2 hover:bg-[var(--mg-fill-0)] transition-colors"
              >
                {m.logo_url && <img src={m.logo_url} alt="" className="w-5 h-5 rounded object-contain flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[var(--mg-text-0)] truncate">
                    {m.display_name}
                  </div>
                  <div className="text-[11px] text-[var(--mg-text-2)] truncate font-mono">
                    {m.model_id}
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="p-4 text-center text-[13px] text-[var(--mg-text-2)]">
                {t('modelsCompare.empty.noMatch')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function renderCell(model: CatalogModelItem, key: string) {
  if (key === 'pricing_input') return formatPrice(model.pricing?.input_per_1m)
  if (key === 'pricing_output') return formatPrice(model.pricing?.output_per_1m)
  if (key === 'context_length') return formatContext(model.context_length)
  if (key === 'max_output_tokens') return formatContext(model.max_output_tokens)
  if (key === 'modalities') {
    return (
      <div className="flex gap-1 flex-wrap">
        {(model.modalities ?? []).map((m) => <Badge key={m} variant="info" className="py-0.5 px-2">{m}</Badge>)}
      </div>
    )
  }
  if (key === 'tags') {
    return (
      <div className="flex gap-1 flex-wrap">
        {(model.tags ?? []).slice(0, 4).map((t) => <Badge key={t} variant="secondary" className="py-0.5 px-2">{t}</Badge>)}
      </div>
    )
  }
  const val = (model as unknown as Record<string, unknown>)[key]
  return val != null ? String(val) : '—'
}

const Spinner = () => (
  <svg className="animate-spin text-current h-6 w-6 text-[var(--brand-base)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
)

export default function ModelsComparePage() {
  const { t } = useTranslation()
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

  const ROWS: Array<{ labelKey: string; key: keyof CatalogModelItem | 'pricing_input' | 'pricing_output' }> = [
    { labelKey: 'modelsCompare.row.contextLength', key: 'context_length' },
    { labelKey: 'modelsCompare.row.maxOutput', key: 'max_output_tokens' },
    { labelKey: 'modelsCompare.row.modalities', key: 'modalities' },
    { labelKey: 'modelsCompare.row.inputPrice', key: 'pricing_input' },
    { labelKey: 'modelsCompare.row.outputPrice', key: 'pricing_output' },
    { labelKey: 'modelsCompare.row.tags', key: 'tags' },
  ]

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-[var(--mg-text-0)] m-0 mb-1.5 tracking-tight">
          {t('modelsCompare.title')}
        </h1>
        <p className="text-[13px] text-[var(--mg-text-1)] m-0">
          {t('modelsCompare.desc', { max: MAX_COMPARE })}
        </p>
      </div>

      {modelsQuery.isLoading ? (
        <div className="flex justify-center items-center h-[200px]">
          <Spinner />
        </div>
      ) : modelsQuery.isError ? (
        <div className="text-[var(--mg-danger)] text-[13px] py-6">{t('modelsCompare.error.load')}</div>
      ) : (
        <div>
          {/* Picker row */}
          <div className="grid grid-cols-3 gap-4 mb-8">
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
            <div className="border border-[var(--mg-border)] rounded-xl overflow-hidden shadow-sm bg-card-bg">
              {/* Header */}
              <div
                className="grid items-center border-b border-[var(--mg-border)] bg-[var(--mg-fill-0)]"
                style={{
                  gridTemplateColumns: `180px repeat(${selectedModels.length}, 1fr)`,
                }}
              >
                <div className="p-3.5 px-4 text-xs font-semibold text-[var(--mg-text-2)]">
                  {t('modelsCompare.table.attr')}
                </div>
                {selectedModels.map((m) => (
                  <div key={m.model_id} className="p-3.5 px-4 border-l border-[var(--mg-border)]">
                    <div className="flex items-center gap-2">
                      {m.logo_url && <img src={m.logo_url} alt="" className="w-5.5 h-5.5 rounded object-contain" />}
                      <div className="min-w-0">
                        <div className="font-bold text-[13px] text-[var(--mg-text-0)] truncate">{m.display_name}</div>
                        <div className="text-[10px] text-[var(--mg-text-2)] font-mono truncate">{m.vendor}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Rows */}
              {ROWS.map((row, rowIdx) => (
                <div
                  key={row.key}
                  className={cn(
                    "grid items-center border-b border-[var(--mg-border)]",
                    rowIdx === ROWS.length - 1 && "border-none",
                    rowIdx % 2 === 0 ? "bg-transparent" : "bg-[var(--mg-fill-0)]/50"
                  )}
                  style={{
                    gridTemplateColumns: `180px repeat(${selectedModels.length}, 1fr)`,
                  }}
                >
                  <div className="p-3.5 px-4 text-xs font-semibold text-[var(--mg-text-1)]">
                    {t(row.labelKey)}
                  </div>
                  {selectedModels.map((m) => (
                    <div key={m.model_id} className="p-3.5 px-4 border-l border-[var(--mg-border)] text-[13px] text-[var(--mg-text-0)] flex items-center">
                      {renderCell(m, row.key)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {!hasAny && (
            <div className="text-center py-12">
              <span className="text-[var(--mg-text-2)] text-[13px]">
                {t('modelsCompare.empty.hint')}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
