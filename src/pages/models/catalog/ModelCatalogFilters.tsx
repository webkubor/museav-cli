/**
 * 模型目录高级筛选组件
 * 路由：/models/catalog
 * API：无直接请求，消费模型目录页已获取的模型与标签数据
 */

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuSearch, LuSlidersHorizontal, LuX } from 'react-icons/lu'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import type { CatalogModelItem, CatalogModelTag } from '@/types'
import {
  CONTEXT_FILTERS,
  DEFAULT_ADVANCED_FILTERS,
  type AdvancedFilterState,
} from './modelCatalogFilterLogic'
import './catalog-filters.css'

interface FilterOption {
  code: string
  label: string
  count?: number
}

interface ModalityFilterOption {
  code: string
  nameZh: string
  nameEn: string
}

type AdvancedFilterKey = keyof AdvancedFilterState

interface ModelCatalogFiltersProps {
  search: string
  onSearchChange: (value: string) => void
  category: string
  onCategoryChange: (value: string) => void
  advancedFilters: AdvancedFilterState
  onAdvancedFiltersChange: (filters: AdvancedFilterState) => void
  allModels: CatalogModelItem[]
  apiTags: CatalogModelTag[]
  modalityFilters: ModalityFilterOption[]
  isZh: boolean
}

/** 渲染模型目录搜索、快捷分类与高级筛选面板。 */
export function ModelCatalogFilters({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  advancedFilters,
  onAdvancedFiltersChange,
  allModels,
  apiTags,
  modalityFilters,
  isZh,
}: ModelCatalogFiltersProps) {
  const { t } = useTranslation()
  const [filtersOpen, setFiltersOpen] = useState(false)

  const quickCategoryOptions = useMemo<FilterOption[]>(
    () => [
      { code: 'all', label: t('modelsCatalog.filter.all') },
      ...apiTags.slice(0, 8).map((tag) => ({ code: tag.code, label: isZh ? tag.name_zh : tag.name_en })),
      ...modalityFilters.map((item) => ({ code: item.code, label: isZh ? item.nameZh : item.nameEn })),
    ],
    [apiTags, modalityFilters, isZh, t],
  )

  const languageOptions = useMemo<FilterOption[]>(
    () => [
      { code: 'all', label: t('modelsCatalog.filters.all') },
      { code: 'multilingual', label: t('modelsCatalog.filters.languageMultilingual') },
      { code: 'en', label: t('modelsCatalog.filters.languageEnglish') },
      { code: 'zh', label: t('modelsCatalog.filters.languageChinese') },
    ],
    [t],
  )

  const contextOptions = useMemo<FilterOption[]>(
    () => [
      { code: 'all', label: t('modelsCatalog.filters.all') },
      ...CONTEXT_FILTERS.map((item) => ({
        code: item.code,
        label: item.code === '1m' ? '1M+' : `${item.code}+`,
      })),
    ],
    [t],
  )

  const providerOptions = useMemo<FilterOption[]>(() => {
    const counts = new Map<string, number>()
    allModels.forEach((model) => {
      if (!model.vendor) return
      counts.set(model.vendor, (counts.get(model.vendor) ?? 0) + 1)
    })

    return [
      { code: 'all', label: t('modelsCatalog.filters.all') },
      ...Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 18)
        .map(([code, count]) => ({ code, label: code, count })),
    ]
  }, [allModels, t])

  const scenarioOptions = useMemo<FilterOption[]>(() => {
    const tagNameMap = new Map(
      apiTags.map((tag) => [tag.code.toLowerCase(), isZh ? tag.name_zh : tag.name_en]),
    )
    const counts = new Map<string, number>()
    allModels.forEach((model) => {
      model.tags?.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1))
    })

    return [
      { code: 'all', label: t('modelsCatalog.filters.all') },
      ...Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 24)
        .map(([code, count]) => ({ code, label: tagNameMap.get(code.toLowerCase()) ?? code, count })),
    ]
  }, [allModels, apiTags, isZh, t])

  const activeFilterCount = useMemo(
    () => [
      advancedFilters.language !== 'all',
      advancedFilters.context !== 'all',
      advancedFilters.provider !== 'all',
      advancedFilters.scenario !== 'all',
    ].filter(Boolean).length,
    [advancedFilters],
  )

  const handleAdvancedFilterChange = (key: AdvancedFilterKey, value: string) => {
    onAdvancedFiltersChange({ ...advancedFilters, [key]: value })
  }

  const handleResetFilters = () => {
    onAdvancedFiltersChange({ ...DEFAULT_ADVANCED_FILTERS })
  }

  return (
    <section className="models-catalog-toolbar" aria-label={t('modelsCatalog.filters.label')}>
      <Input
        variant="search"
        prefix={<LuSearch size={16} className="text-mg-text-2/80" />}
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={t('modelsCatalog.placeholder.search')}
        className="models-catalog-search"
      />
      <div className="models-catalog-filter-row">
        <button
          type="button"
          className={cn('models-catalog-filter-toggle', filtersOpen && 'is-active')}
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
        >
          <LuSlidersHorizontal aria-hidden />
          {t('modelsCatalog.filters.moreLabel')}
          {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
        </button>
        {quickCategoryOptions.map((option) => (
          <button
            key={option.code}
            type="button"
            onClick={() => onCategoryChange(option.code)}
            className={cn('models-catalog-filter-chip', category === option.code && 'is-active')}
          >
            {option.label}
          </button>
        ))}
      </div>
      {filtersOpen && (
        <div className="models-catalog-advanced-filters">
          <AdvancedFilterRow
            label={t('modelsCatalog.filters.language')}
            options={languageOptions}
            value={advancedFilters.language}
            onChange={(value) => handleAdvancedFilterChange('language', value)}
          />
          <AdvancedFilterRow
            label={t('modelsCatalog.filters.context')}
            options={contextOptions}
            value={advancedFilters.context}
            onChange={(value) => handleAdvancedFilterChange('context', value)}
          />
          <AdvancedFilterRow
            label={t('modelsCatalog.filters.provider')}
            options={providerOptions}
            value={advancedFilters.provider}
            onChange={(value) => handleAdvancedFilterChange('provider', value)}
          />
          <AdvancedFilterRow
            label={t('modelsCatalog.filters.scenario')}
            options={scenarioOptions}
            value={advancedFilters.scenario}
            onChange={(value) => handleAdvancedFilterChange('scenario', value)}
          />
          <button
            type="button"
            className="models-catalog-filter-reset"
            onClick={handleResetFilters}
            disabled={activeFilterCount === 0}
          >
            <LuX aria-hidden />
            {t('modelsCatalog.filters.reset')}
          </button>
        </div>
      )}
    </section>
  )
}

interface AdvancedFilterRowProps {
  label: string
  options: FilterOption[]
  value: string
  onChange: (value: string) => void
}

function AdvancedFilterRow({ label, options, value, onChange }: AdvancedFilterRowProps) {
  return (
    <div className="models-catalog-advanced-row">
      <div className="models-catalog-advanced-label">{label}</div>
      <div className="models-catalog-advanced-options">
        {options.map((option) => (
          <button
            key={option.code}
            type="button"
            onClick={() => onChange(option.code)}
            className={cn('models-catalog-filter-chip', value === option.code && 'is-active')}
            title={option.count != null ? `${option.label} (${option.count})` : option.label}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
