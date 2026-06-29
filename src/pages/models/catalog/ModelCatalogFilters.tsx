/**
 * 模型目录高级筛选组件
 * 路由：/models/catalog
 * API：无直接请求，消费模型目录页已获取的模型与标签数据
 */

import { useMemo, useState, type ReactNode } from 'react'
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
  /** 选项前的图标（如模型系列的品牌 logo），仅部分筛选维度用 */
  icon?: ReactNode
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
  /** 模型组（family）筛选：选项来自 /catalog/model-families，服务端精确筛选 */
  familyOptions: FilterOption[]
  family: string
  onFamilyChange: (value: string) => void
  allModels: CatalogModelItem[]
  apiTags: CatalogModelTag[]
  modalityFilters: ModalityFilterOption[]
  isZh: boolean
  sort: string
  onSortChange: (value: string) => void
}

/** 渲染模型目录搜索、快捷分类与高级筛选面板。 */
export function ModelCatalogFilters({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  advancedFilters,
  onAdvancedFiltersChange,
  familyOptions,
  family,
  onFamilyChange,
  allModels,
  apiTags,
  modalityFilters,
  isZh,
  sort,
  onSortChange,
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

  const sortOptions = useMemo<FilterOption[]>(
    () => [
      { code: 'popular', label: t('modelsCatalog.filters.sort.popular') },
      { code: 'newest', label: t('modelsCatalog.filters.sort.newest') },
      { code: 'cheapest', label: t('modelsCatalog.filters.sort.cheapest') },
    ],
    [t],
  )

  const activeFilterCount = useMemo(
    () => [
      advancedFilters.language !== 'all',
      advancedFilters.context !== 'all',
      family !== 'all',
      advancedFilters.scenario !== 'all',
      sort !== 'popular',
    ].filter(Boolean).length,
    [advancedFilters, family, sort],
  )

  const handleAdvancedFilterChange = (key: AdvancedFilterKey, value: string) => {
    onAdvancedFiltersChange({ ...advancedFilters, [key]: value })
  }

  const handleResetFilters = () => {
    onAdvancedFiltersChange({ ...DEFAULT_ADVANCED_FILTERS })
    onFamilyChange('all')
    onSortChange('popular')
  }

  return (
    <section className="models-catalog-toolbar" aria-label={t('modelsCatalog.filters.label')}>
      <Input
        variant="search"
        prefix={<LuSearch size={16} className="text-mg-text-3/80" />}
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
            label={t('modelsCatalog.filters.family')}
            options={familyOptions}
            value={family}
            onChange={onFamilyChange}
          />
          <AdvancedFilterRow
            label={t('modelsCatalog.filters.scenario')}
            options={scenarioOptions}
            value={advancedFilters.scenario}
            onChange={(value) => handleAdvancedFilterChange('scenario', value)}
          />
          <AdvancedFilterRow
            label={t('modelsCatalog.filters.sort.label')}
            options={sortOptions}
            value={sort}
            onChange={onSortChange}
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
            {option.icon && (
              <span className="models-catalog-filter-chip-icon" aria-hidden>{option.icon}</span>
            )}
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
