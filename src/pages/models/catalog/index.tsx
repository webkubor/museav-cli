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
import { listModels, listModelTags, listModelFamilies, listModelFacets } from '@/services/catalog'
import { useAuthStore } from '@/store/auth'
import { toLoginWithRedirect } from '@/lib/redirect'
import type { CatalogModelItem } from '@/types'
import { CatalogCard } from './CatalogCard'
import { CatalogHero } from './CatalogHero'
import { CatalogSidebar } from './CatalogSidebar'
import { ModelsCompareModal } from '../components/ModelsCompareModal'
import './catalog.css'

type SortKey = 'default' | 'popular' | 'newest' | 'cheapest'
// 上下文阈值改由服务端 facets 下发，前端不再硬编码（原 CTX_THRESHOLDS 已删除）。

function isComparableModel(model: CatalogModelItem) {
  return !(model.modalities ?? []).some((m) => m === 'image' || m === 'audio' || m === 'video')
}

export default function ModelsCatalogPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const isZh = i18n.language.startsWith('zh')
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [sort, setSort] = useState<SortKey>('default')
  const [sortOpen, setSortOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [isCompareOpen, setIsCompareOpen] = useState(false)
  const [compareInitialIds, setCompareInitialIds] = useState<string[]>([])
  const sortRef = useRef<HTMLDivElement>(null)

  const sortLabels: Record<SortKey, string> = {
    default: t('modelsCatalog.sort.default'),
    popular: t('modelsCatalog.sort.popular'),
    newest: t('modelsCatalog.sort.newest'),
    cheapest: t('modelsCatalog.sort.cheapest'),
  }

  const selectedFamily = selected.find((k) => k.startsWith('family:'))?.split(':')[1]
  const selectedTags = selected.filter((k) => k.startsWith('tag:')).map((k) => k.split(':')[1])
  const selectedCtx = selected.find((k) => k.startsWith('ctx:'))?.split(':')[1]
  const selectedPrice = selected.find((k) => k.startsWith('price:'))?.split(':')[1]

  const selectedProtocol = selected.find((k) => k.startsWith('protocol:'))?.split(':')[1] as
    | 'openai' | 'anthropic' | 'other' | undefined
  const promoOnly = selected.includes('promo:1')

  /**
   * 筛选交给服务端。此前是 page_size:100 一次拉全量再本地 filter —— 随模型数
   * 增长必然退化，且计数无法反映真实结果集。
   * 上下文阈值不再由前端硬编码：把用户选中的桶原样作为 context_min 传下去，
   * 桶的取值来自 facets 接口（服务端定义）。
   */
  const listParams = useMemo(() => ({
    page_size: 100,
    family: selectedFamily || undefined,
    q: search.trim() || undefined,
    protocol: selectedProtocol,
    capability_tag: selectedTags.length ? selectedTags : undefined,
    context_min: selectedCtx ? Number(selectedCtx) : undefined,
    price: (selectedPrice as 'free' | 'paid' | undefined) || undefined,
    promo: promoOnly || undefined,
    sort: sort === 'default' ? undefined : sort,
  }), [selectedFamily, search, selectedProtocol, selectedTags, selectedCtx, selectedPrice, promoOnly, sort])

  const modelsQuery = useQuery({
    queryKey: ['catalog-models', listParams],
    queryFn: () => listModels(listParams),
    staleTime: 5 * 60_000,
  })

  /**
   * 侧栏计数。与列表并发发起、共用同一份 listParams —— 两者若发送不同筛选，
   * 计数描述的就是与旁边列表不同的结果集。
   */
  const facetsQuery = useQuery({
    queryKey: ['catalog-model-facets', listParams],
    queryFn: () => listModelFacets(listParams),
    staleTime: 5 * 60_000,
  })
  const facets = facetsQuery.data
  const tagsQuery = useQuery({ queryKey: ['catalog-model-tags'], queryFn: () => listModelTags(true), staleTime: 5 * 60_000 })
  const familiesQuery = useQuery({ queryKey: ['catalog-model-families'], queryFn: () => listModelFamilies(true), staleTime: 5 * 60_000 })

  /**
   * 过滤后端测试数据。
   *
   * ⚠️ 这行**暂时还不能删**。方向是由后端 hidden 兜住（前端不该维护这类名单），
   * 但截至改造时 test 库里 189 个可见模型中有 147 个是 pytest-* 测试模型且
   * hidden=false —— 真实目录只有 42 个。删掉这行会让它们直接出现在公开广场。
   * 待 db/schema/upgrades/2026-07-25_marketplace_data_backfill.sql 的第 (1) 段
   * 在各环境执行、把测试模型标 hidden 之后，再删这行以及下面 isComparableModel
   * 之外的本地兜底。
   */
  const allModels = useMemo(
    () => (modelsQuery.data?.items ?? []).filter((m) => !/^pytest/i.test(m.model_id)),
    [modelsQuery.data?.items],
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

  /**
   * 搜索、能力标签、上下文、价格、协议、折扣与 recommended/newest/cheapest 排序
   * 全部由服务端执行（见 listParams），这里不再重复过滤 —— 重复过滤会让侧栏计数
   * 与实际列表对不上。
   *
   * 只有 popular 仍是本地排序：服务端热度排序（平台级调用量物化表）尚未上线，
   * 按既定决策该选项保持现状、不隐藏，待后端就绪后原地替换。
   */
  const visibleModels = useMemo(() => {
    if (sort !== 'popular') return allModels
    return [...allModels].sort(
      (a, b) =>
        (b.providers_count ?? 0) + (b.tags?.length ?? 0) -
        ((a.providers_count ?? 0) + (a.tags?.length ?? 0)),
    )
  }, [allModels, sort])

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
        {t('modelsCatalog.filtersButton')}
      </button>

      {/* 主体：左 sidebar + 右内容 */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[260px_1fr] lg:items-start">
        <div className={`models-sticky ${filtersOpen ? 'block rounded-lg border p-4 lg:border-0 lg:p-0' : 'hidden lg:block'}`} style={filtersOpen ? { background: 'var(--mg-bg-0)', borderColor: 'var(--mg-border)' } : undefined}>
          <CatalogSidebar families={families} tags={tags} selected={selected} setSelected={setSelected} isZh={isZh} facets={facets} />
        </div>

        <div>
          {/* 标题 */}
          <div className="mb-6">
            <h1 className="catalog-title text-[34px] font-bold tracking-tight" style={{ color: 'var(--mg-text-1)' }}>
              {t('modelsCatalog.page.title')}
            </h1>
            <p className="mt-1.5 text-[14px]" style={{ color: 'var(--mg-text-3)' }}>
              {t('modelsCatalog.page.subtitle')}
            </p>
          </div>

          {/* 顶部数据卡 + 热门模型 */}
          {!modelsQuery.isLoading && !modelsQuery.isError && allModels.length > 0 && (
            <div className="mb-6">
              <CatalogHero models={allModels} onPickHot={setSearch} />
            </div>
          )}

          {/* 搜索 + 排序（吸顶） */}
          <div className="models-toolbar">
            <div className="catalog-search-wrap relative flex-1">
              <LuSearch size={16} className="catalog-search-icon absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={t('modelsCatalog.search.placeholder')}
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
            <p className="mg-count">{t('modelsCatalog.count', { n: visibleModels.length })}</p>
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
              <p className="text-[13px]" style={{ color: 'var(--mg-text-3)' }}>{t('modelsCatalog.emptyFiltered')}</p>
              <button type="button" onClick={reset} className="mt-3 text-[12px] underline-offset-2 hover:underline" style={{ color: 'var(--mg-text-3)' }}>
                {t('modelsCatalog.clearFilters')}
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
