/**
 * 模型广场（公开页 /models 使用）
 * 布局参考国外官网：左侧筛选 chip 栏 + 右侧吸顶搜索/排序卡 + 竖向宽卡片列表。
 * 数据：GET /api/v1/catalog/models | catalog/model-tags | catalog/model-families（均公开）
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { LuSearch, LuChevronDown, LuCheck, LuSlidersHorizontal, LuLayers } from 'react-icons/lu'
import { listModels, listModelTags, listModelFamilies } from '@/services/catalog'
import { useAuthStore } from '@/store/auth'
import { toLoginWithRedirect } from '@/lib/redirect'
import { useMarket } from '@/hooks/useMarket'
import type { CatalogModelItem } from '@/types'
import { GLOBAL_FALLBACK_MODELS } from './global-fallback-models'
import { CatalogCard } from './CatalogCard'
import { CatalogHero } from './CatalogHero'
import { CatalogSidebar } from './CatalogSidebar'
import { ModelsCompareModal } from '../components/ModelsCompareModal'
import './catalog.css'

type SortKey = 'default' | 'popular' | 'newest' | 'cheapest'
const CTX_THRESHOLDS: Record<string, number> = {
  '8k': 8000, '32k': 32000, '128k': 128000, '256k': 256000, '1m': 1000000,
}

function isComparableModel(model: CatalogModelItem) {
  return !(model.modalities ?? []).some((m) => m === 'image' || m === 'audio' || m === 'video')
}

export default function ModelsCatalogPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const isZh = i18n.language.startsWith('zh')
  // 海外(global)catalog 接口暂未到位 → 不请求后端，用静态兜底清单展示主流国际模型。
  // 接口就绪后删掉本 isGlobal 分支即可回到后端数据。
  // 业务判断走 platform-config 驱动的 store（useMarket），而非域名——test 单域名可切两端验收（#466）
  const isGlobal = useMarket() === 'global'
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [sort, setSort] = useState<SortKey>('default')
  const [sortOpen, setSortOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [isCompareOpen, setIsCompareOpen] = useState(false)
  const [compareInitialIds, setCompareInitialIds] = useState<string[]>([])
  const sortRef = useRef<HTMLDivElement>(null)

  const sortLabels: Record<SortKey, string> = isZh
    ? { default: '推荐排序', popular: '热门', newest: '最新', cheapest: '最便宜' }
    : { default: 'Recommended', popular: 'Popular', newest: 'Newest', cheapest: 'Cheapest' }

  const selectedFamily = selected.find((k) => k.startsWith('family:'))?.split(':')[1]
  const selectedTags = selected.filter((k) => k.startsWith('tag:')).map((k) => k.split(':')[1])
  const selectedCtx = selected.find((k) => k.startsWith('ctx:'))?.split(':')[1]
  const selectedPrice = selected.find((k) => k.startsWith('price:'))?.split(':')[1]

  const modelsQuery = useQuery({
    queryKey: ['catalog-models', { family: selectedFamily }],
    queryFn: () => listModels({ page_size: 100, family: selectedFamily || undefined }),
    staleTime: 5 * 60_000,
    enabled: !isGlobal, // 海外不请求后端，走静态兜底
  })
  const tagsQuery = useQuery({ queryKey: ['catalog-model-tags'], queryFn: () => listModelTags(true), staleTime: 5 * 60_000, enabled: !isGlobal })
  const familiesQuery = useQuery({ queryKey: ['catalog-model-families'], queryFn: () => listModelFamilies(true), staleTime: 5 * 60_000, enabled: !isGlobal })

  // 过滤后端测试数据（pytest-* 不该出现在公开广场）
  const allModels = useMemo(
    () => isGlobal
      ? GLOBAL_FALLBACK_MODELS
      : (modelsQuery.data?.items ?? []).filter((m) => !/^pytest/i.test(m.model_id)),
    [isGlobal, modelsQuery.data?.items],
  )
  const families = useMemo(
    () => (familiesQuery.data?.items ?? []).filter((f) => f.enabled).sort((a, b) => a.sort_order - b.sort_order),
    [familiesQuery.data?.items],
  )
  const tags = useMemo(() => (tagsQuery.data?.items ?? []).filter((tg) => tg.enabled !== false), [tagsQuery.data?.items])
  const comparableModels = useMemo(() => allModels.filter(isComparableModel), [allModels])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const visibleModels = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = allModels.filter((m) => {
      if (q && !(
        m.display_name.toLowerCase().includes(q) ||
        m.model_id.toLowerCase().includes(q) ||
        (m.provider ?? '').toLowerCase().includes(q)
      )) return false
      if (selectedTags.length && !selectedTags.every((tag) => m.tags?.includes(tag))) return false
      if (selectedCtx && CTX_THRESHOLDS[selectedCtx] && (m.context_length ?? 0) < CTX_THRESHOLDS[selectedCtx]) return false
      if (selectedPrice) {
        const free = Number(m.pricing?.input_per_1m ?? 0) === 0 && Number(m.pricing?.output_per_1m ?? 0) === 0
        if (selectedPrice === 'free' && !free) return false
        if (selectedPrice === 'paid' && free) return false
      }
      return true
    })
    switch (sort) {
      case 'cheapest':
        list = [...list].sort((a, b) => Number(a.pricing?.input_per_1m ?? 0) - Number(b.pricing?.input_per_1m ?? 0))
        break
      case 'newest':
        list = [...list].sort((a, b) => (b.released_at ?? '').localeCompare(a.released_at ?? ''))
        break
      case 'popular':
        list = [...list].sort((a, b) => (b.providers_count ?? 0) + (b.tags?.length ?? 0) - ((a.providers_count ?? 0) + (a.tags?.length ?? 0)))
        break
    }
    return list
  }, [allModels, search, selectedTags, selectedCtx, selectedPrice, sort])

  const reset = () => { setSelected([]); setSearch(''); setSort('default') }

  const handleGoPlayground = (modelId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!isAuthenticated) { navigate(toLoginWithRedirect()); return }
    navigate('/models/playground', { state: { selectedModelId: modelId } })
  }
  const openCompare = (initialIds: string[] = []) => { setCompareInitialIds(initialIds); setIsCompareOpen(true) }

  return (
    <div className="models-catalog-page">
      {/* 移动端筛选按钮 */}
      <button
        type="button"
        onClick={() => { const n = !filtersOpen; if (n) window.scrollTo(0, 0); setFiltersOpen(n) }}
        aria-expanded={filtersOpen}
        className="fixed bottom-6 right-5 z-40 inline-flex h-11 items-center gap-2 rounded-full border px-6 text-[14px] font-medium shadow-lg backdrop-blur lg:hidden"
        style={{ background: 'var(--mg-bg-0)', borderColor: filtersOpen ? 'var(--brand-base)' : 'var(--mg-border)', color: filtersOpen ? 'var(--brand-base)' : 'var(--mg-text-2)' }}
      >
        <LuSlidersHorizontal size={15} />
        {isZh ? '筛选' : 'Filters'}
      </button>

      {/* 主体：左 sidebar + 右内容 */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[260px_1fr] lg:items-start">
        <div className={`models-sticky ${filtersOpen ? 'block rounded-lg border p-4 lg:border-0 lg:p-0' : 'hidden lg:block'}`} style={filtersOpen ? { background: 'var(--mg-bg-0)', borderColor: 'var(--mg-border)' } : undefined}>
          <CatalogSidebar families={families} tags={tags} selected={selected} setSelected={setSelected} isZh={isZh} />
        </div>

        <div>
          {/* 标题 */}
          <div className="mb-6">
            <h1 className="catalog-title text-[34px] font-bold tracking-tight" style={{ color: 'var(--mg-text-1)' }}>
              {isZh ? '模型广场' : 'Models'}
            </h1>
            <p className="mt-1.5 text-[14px]" style={{ color: 'var(--mg-text-3)' }}>
              {isZh ? '一个 API，接入主流大模型' : 'One API, access leading models'}
            </p>
          </div>

          {/* 顶部数据卡 + 热门模型 */}
          {!modelsQuery.isLoading && !modelsQuery.isError && allModels.length > 0 && (
            <div className="mb-6">
              <CatalogHero models={allModels} isZh={isZh} onPickHot={setSearch} />
            </div>
          )}

          {/* 搜索 + 排序（吸顶） */}
          <div className="models-toolbar">
            <div className="catalog-search-wrap relative flex-1">
              <LuSearch size={16} className="catalog-search-icon absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={isZh ? '搜索模型名、API ID、供应商或描述关键词…' : 'Search model, API ID, provider or keyword…'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="mg-search-input"
              />
            </div>
            <div className="relative" ref={sortRef}>
              <button type="button" onClick={() => setSortOpen((v) => !v)} className="mg-sort-btn">
                {sortLabels[sort]}
                <LuChevronDown size={13} className={sortOpen ? 'rotate-180' : ''} />
              </button>
              {sortOpen && (
                <div className="absolute right-0 top-full z-20 mt-1.5 min-w-[140px] overflow-hidden rounded-md border py-1 shadow-lg" style={{ background: 'var(--mg-bg-2)', borderColor: 'var(--mg-border)' }}>
                  {(['default', 'popular', 'newest', 'cheapest'] as SortKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => { setSort(key); setSortOpen(false) }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-[12.5px] transition-colors hover:bg-[color:var(--mg-fill-1)]"
                      style={sort === key ? { color: 'var(--brand-base)' } : { color: 'var(--mg-text-2)' }}
                    >
                      {sort === key ? <LuCheck size={11} /> : <span className="w-[11px]" />}
                      {sortLabels[key]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {!modelsQuery.isLoading && !modelsQuery.isError && (
            <p className="mg-count">{isZh ? `共 ${visibleModels.length} 个模型` : `${visibleModels.length} models`}</p>
          )}

          {/* 列表状态 */}
          {modelsQuery.isLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-[150px] animate-pulse rounded-md border" style={{ background: 'var(--mg-bg-0)', borderColor: 'var(--mg-border)' }} />
              ))}
            </div>
          ) : modelsQuery.isError ? (
            <div className="rounded-md border p-6 text-center text-[13px]" style={{ borderColor: 'var(--mg-border)', color: 'var(--mg-text-3)' }}>
              {t('modelsCatalog.error.load')}
            </div>
          ) : visibleModels.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-md border py-20 text-center" style={{ background: 'var(--mg-bg-0)', borderColor: 'var(--mg-border)' }}>
              <LuLayers size={28} className="mb-3" style={{ color: 'var(--mg-text-4)' }} />
              <p className="text-[13px]" style={{ color: 'var(--mg-text-3)' }}>{isZh ? '没有符合筛选条件的模型' : 'No models match your filters'}</p>
              <button type="button" onClick={reset} className="mt-3 text-[12px] underline-offset-2 hover:underline" style={{ color: 'var(--mg-text-3)' }}>
                {isZh ? '清除所有筛选' : 'Clear all filters'}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleModels.map((model) => (
                <CatalogCard
                  key={model.id}
                  model={model}
                  isZh={isZh}
                  onTry={handleGoPlayground}
                  canCompare={isComparableModel(model)}
                  onCompare={(e) => { e.stopPropagation(); openCompare([model.id]) }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <ModelsCompareModal
        isOpen={isCompareOpen}
        onClose={() => setIsCompareOpen(false)}
        allModels={comparableModels}
        initialSelectedIds={compareInitialIds}
        onConfirmCompare={(ids) => {
          if (ids.length === 0) return
          if (!isAuthenticated) { navigate(toLoginWithRedirect()); return }
          navigate('/models/compare', { state: { selectedIds: ids } })
        }}
      />
    </div>
  )
}
