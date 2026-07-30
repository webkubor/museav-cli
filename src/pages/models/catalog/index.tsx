/**
 * 模型广场（公开页 /models 使用）
 * 布局参考国外官网：左侧筛选 chip 栏 + 右侧吸顶搜索/排序卡 + 竖向宽卡片列表。
 * 数据：GET /api/v1/catalog/models | catalog/model-tags | catalog/model-families（均公开）
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { LuSearch, LuChevronDown, LuCheck, LuSlidersHorizontal, LuLayers, LuZap, LuBuilding2, LuShieldCheck } from 'react-icons/lu'
import { listModels, listModelTags, listModelFacets, listFeatured } from '@/services/catalog'
import { useAuthStore } from '@/store/auth'
import { toLoginWithRedirect } from '@/lib/redirect'
import { trackEvent, trackPageView } from '@/lib/track'
import { resolveModelCategory } from '../model-experience-data'
import { CatalogCard } from './CatalogCard'
import { CatalogFeatured } from './CatalogFeatured'
import { CatalogSidebar } from './CatalogSidebar'
import { ModelsCompareModal } from '../components/ModelsCompareModal'
import { queryLengthBucket, diffFilterChange, buildFilterSummary } from './catalog-tracking'
import type { CatalogModelItem } from '@/types'
import './catalog.css'

type SortKey = 'default' | 'newest' | 'cheapest'
// 上下文阈值改由服务端 facets 下发，前端不再硬编码（原 CTX_THRESHOLDS 已删除）。

export default function ModelsCatalogPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const isZh = i18n.language.startsWith('zh')
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  // qa#292：筛选条件同步进 URL query，详情页「返回模型广场」带着这段 query 回来
  // 才能还原筛选；否则组件重新挂载时 useState 只会回到初始空值。
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '')
  const [selected, setSelected] = useState<string[]>(() => searchParams.get('f')?.split(',').filter(Boolean) ?? [])
  const [sort, setSort] = useState<SortKey>(() => (searchParams.get('sort') as SortKey) || 'default')

  useEffect(() => {
    const next = new URLSearchParams()
    if (search.trim()) next.set('q', search.trim())
    if (selected.length) next.set('f', selected.join(','))
    if (sort !== 'default') next.set('sort', sort)
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, selected, sort])
  const [sortOpen, setSortOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [isCompareOpen, setIsCompareOpen] = useState(false)
  const [compareInitialIds, setCompareInitialIds] = useState<string[]>([])
  const [compareCurrentModelId, setCompareCurrentModelId] = useState<string | undefined>(undefined)
  const sortRef = useRef<HTMLDivElement>(null)

  const sortLabels: Record<SortKey, string> = {
    default: t('modelsCatalog.sort.default'),
    newest: t('modelsCatalog.sort.newest'),
    cheapest: t('modelsCatalog.sort.cheapest'),
  }

  // 原型的第一组筛选是「模型厂商」(vendor)，不是模型系列(family)。
  const selectedVendor = selected.find((k) => k.startsWith('vendor:'))?.split(':')[1]
  const selectedModality = selected.find((k) => k.startsWith('modality:'))?.split(':')[1] as
    | 'text' | 'image' | 'audio' | 'video' | 'embedding' | undefined
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
    provider: selectedVendor || undefined,
    modality: selectedModality || undefined,
    q: search.trim() || undefined,
    protocol: selectedProtocol,
    capability_tag: selectedTags.length ? selectedTags : undefined,
    context_min: selectedCtx ? Number(selectedCtx) : undefined,
    price: (selectedPrice as 'free' | 'paid' | undefined) || undefined,
    promo: promoOnly || undefined,
    sort: sort === 'default' ? undefined : sort,
  }), [selectedVendor, selectedModality, search, selectedProtocol, selectedTags, selectedCtx, selectedPrice, promoOnly, sort])

  const modelsQuery = useQuery({
    queryKey: ['catalog-models', listParams],
    queryFn: () => listModels(listParams),
    staleTime: 5 * 60_000,
    // qa#284：排序/搜索/筛选变化时 listParams 变了 queryKey，若不保留旧数据会先
    // 整页切回 loading 骨架屏再切回列表，视觉上就是"闪一下"。切筛选时结果集
    // 不会突变，保留旧数据直到新数据到位更符合直觉。
    placeholderData: keepPreviousData,
  })

  /**
   * 侧栏计数。与列表并发发起、共用同一份 listParams —— 两者若发送不同筛选，
   * 计数描述的就是与旁边列表不同的结果集。
   */
  const facetsQuery = useQuery({
    queryKey: ['catalog-model-facets', listParams],
    queryFn: () => listModelFacets(listParams),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  })
  const facets = facetsQuery.data

  /**
   * 精选轮播。不随筛选变化（它是运营发布的固定推荐位），所以 queryKey 不带
   * listParams；0 项时组件自身不渲染。
   */
  const featuredQuery = useQuery({
    queryKey: ['catalog-featured'],
    queryFn: () => listFeatured(),
    staleTime: 5 * 60_000,
  })
  const tagsQuery = useQuery({ queryKey: ['catalog-model-tags'], queryFn: () => listModelTags(true), staleTime: 5 * 60_000 })

  /**
   * 过滤后端测试数据。
   *
   * ⚠️ 这行**暂时还不能删**。方向是由后端 hidden 兜住（前端不该维护这类名单），
   * 但截至改造时 test 库里 189 个可见模型中有 147 个是 pytest-* 测试模型且
   * hidden=false —— 真实目录只有 42 个。删掉这行会让它们直接出现在公开广场。
   * 待 db/schema/upgrades/2026-07-25_marketplace_data_backfill.sql 的第 (1) 段
   * 在各环境执行、把测试模型标 hidden 之后，再删这行本地兜底。
   */
  const allModels = useMemo(
    () => (modelsQuery.data?.items ?? []).filter((m) => !/^pytest/i.test(m.model_id)),
    [modelsQuery.data?.items],
  )
  const tags = useMemo(() => (tagsQuery.data?.items ?? []).filter((tg) => tg.enabled !== false), [tagsQuery.data?.items])

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
   * qa#291 二轮反馈：「热门」排序已删除——原型 App.tsx 只有 推荐排序/最新发布
   * 两个选项，没有热门；服务端热度排序也确实没上线，需求方确认可以直接删掉，
   * 不必等后端就绪再"原地替换"（之前的决策）。
   */
  const visibleModels = allModels

  // ── 埋点（PRD §10.2，qa#550）──────────────────────────────────────────────
  // visibleModelsRef：始终指向最新一次渲染的结果集，供下面的防抖/延迟回调在
  // 触发时刻读取「结果最终落定后」的 result_count，而不是回调排定那一刻的旧值。
  const visibleModelsRef = useRef(visibleModels)
  useEffect(() => { visibleModelsRef.current = visibleModels }, [visibleModels])

  // marketplace_view：目录首次有效展示（模型列表到位）后上报一次。
  const viewTrackedRef = useRef(false)
  useEffect(() => {
    if (viewTrackedRef.current || modelsQuery.isLoading || modelsQuery.isError) return
    viewTrackedRef.current = true
    trackPageView('marketplace_catalog')
    trackEvent('marketplace_view', {
      auth_state: isAuthenticated ? 'authenticated' : 'anonymous',
      entry_source: (location.state as { entrySource?: string } | null)?.entrySource ?? 'direct',
      catalog_count: facets?.total ?? allModels.length,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelsQuery.isLoading, modelsQuery.isError])

  /** marketplace_empty_shown：只在「从有结果变为无结果」时报一次，避免同一空态重复上报 */
  const wasEmptyRef = useRef(false)
  const reportEmptyIfNeeded = () => {
    if (visibleModelsRef.current.length === 0) {
      if (!wasEmptyRef.current) {
        wasEmptyRef.current = true
        trackEvent('marketplace_empty_shown', { filter_summary: buildFilterSummary(selected) })
      }
    } else {
      wasEmptyRef.current = false
    }
  }

  // marketplace_search：搜索防抖后上报（500ms 内无新输入才算「确认」）。
  const searchTimerRef = useRef<number | undefined>(undefined)
  useEffect(() => {
    window.clearTimeout(searchTimerRef.current)
    if (!search.trim()) return
    searchTimerRef.current = window.setTimeout(() => {
      trackEvent('marketplace_search', {
        query_length_bucket: queryLengthBucket(search),
        result_count: visibleModelsRef.current.length,
      })
      reportEmptyIfNeeded()
    }, 500)
    return () => window.clearTimeout(searchTimerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  // marketplace_filter_changed：任一筛选 chip 变化时上报一次（diff 出维度/值/动作）。
  // 小延迟等结果集落定后再读 result_count，写法与上面搜索防抖一致。
  const prevSelectedRef = useRef(selected)
  const filterTimerRef = useRef<number | undefined>(undefined)
  useEffect(() => {
    const prev = prevSelectedRef.current
    prevSelectedRef.current = selected
    if (prev === selected) return
    const change = diffFilterChange(prev, selected)
    if (!change) return
    window.clearTimeout(filterTimerRef.current)
    filterTimerRef.current = window.setTimeout(() => {
      trackEvent('marketplace_filter_changed', { ...change, result_count: visibleModelsRef.current.length })
      reportEmptyIfNeeded()
    }, 400)
    return () => window.clearTimeout(filterTimerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const reset = () => {
    trackEvent('marketplace_filters_cleared', { active_filter_count_before: selected.length })
    setSelected([]); setSearch(''); setSort('default')
  }

  const handleSortChange = (next: SortKey) => {
    if (next !== sort) trackEvent('marketplace_sort_changed', { from_sort: sort, to_sort: next })
    setSort(next)
    setSortOpen(false)
  }

  const handleGoPlayground = (modelId: string, e?: React.MouseEvent, source: 'card' | 'featured' = 'card') => {
    e?.stopPropagation()
    const model = allModels.find((m) => m.model_id === modelId)
    trackEvent('marketplace_try_clicked', {
      auth_state: isAuthenticated ? 'authenticated' : 'anonymous',
      // 模型广场不接收余额态（PRD §11「余额边界」），experience_status 只记录本次
      // 点击的实际去向：直达体验页，还是先过登录门。
      experience_status: isAuthenticated ? 'enter_playground' : 'redirect_login',
      experience_type: 'try',
      source,
    })
    if (!isAuthenticated) {
      navigate(toLoginWithRedirect(undefined, {
        model_id: modelId,
        model_category: model ? resolveModelCategory(model) : undefined,
        experience_type: 'try',
        detail_source: 'catalog',
      }))
      return
    }
    navigate('/models/playground', { state: { selectedModelId: modelId } })
  }
  const openCompare = (modelId: string) => {
    setCompareCurrentModelId(modelId)
    setCompareInitialIds([modelId])
    setIsCompareOpen(true)
  }

  return (
    <div className="models-catalog-page">
      {/* 移动端筛选按钮 */}
      <button
        type="button"
        onClick={() => { const n = !filtersOpen; if (n) window.scrollTo(0, 0); setFiltersOpen(n) }}
        aria-expanded={filtersOpen}
        className={`bg-mg-bg-0 fixed bottom-6 right-5 z-40 inline-flex h-11 items-center gap-2 rounded-full border px-6 text-[14px] font-medium shadow-lg backdrop-blur lg:hidden ${
          filtersOpen ? 'border-brand-base text-brand-base' : 'border-mg-border text-mg-text-2'
        }`}
      >
        <LuSlidersHorizontal size={15} />
        {t('modelsCatalog.filtersButton')}
      </button>

      {/* 原型的页面结构：标题 / 轮播 / 搜索排序 三块**全宽**，只有最后的
          「筛选栏 + 卡片网格」才是两列。此前把全部内容塞进右列，导致轮播被侧栏
          挤窄（1244 vs 原型 1426）、标题也不与页面左边缘对齐。 */}
      <div className="mg-plaza">
          {/* 标题 */}
          <div className="mb-6">
            <h1 className="text-mg-text-1 catalog-title text-[34px] font-bold tracking-tight">
              {t('modelsCatalog.page.title')}
            </h1>
            <p className="text-mg-text-3 mt-1.5 text-[14px]">
              {t('modelsCatalog.page.subtitle')}
            </p>
            {/* 信任 chips（原型口径）：协议兼容 / 供应商直连 / SLA。取代原先三张数据卡。 */}
            <div className="mg-trust">
              <span><LuZap size={12} />{isZh ? 'OpenAI / Anthropic 兼容协议' : 'OpenAI / Anthropic compatible'}</span>
              <span><LuBuilding2 size={12} />{isZh ? '官方供应商直连' : 'Direct official providers'}</span>
              <span><LuShieldCheck size={12} />{isZh ? '99.95% SLA 稳定保障' : '99.95% SLA'}</span>
            </div>
          </div>

          {/* 精选轮播。原型顶部只有「标题 + 副标题 + 信任 chips + 轮播」，没有数据卡
              （已接入模型 / 官方供应商 / API 可用率）也没有热门模型横排 —— 按需求方
              要求与原型对齐，二者已移除（CatalogHero 组件同时删除）。 */}
          {!modelsQuery.isLoading && !modelsQuery.isError && (
            <CatalogFeatured
              slides={featuredQuery.data?.items ?? []}
              isZh={isZh}
              onTry={(id, e) => handleGoPlayground(id, e, 'featured')}
            />
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
                <div className="bg-mg-bg-2 border-mg-border absolute right-0 top-full z-20 mt-1.5 min-w-[140px] overflow-hidden rounded-md border py-1 shadow-lg">
                  {(['default', 'newest', 'cheapest'] as SortKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleSortChange(key)}
                      className={`hover:bg-mg-fill-1 flex w-full items-center gap-2 px-4 py-2 text-left text-[12.5px] transition-colors ${
                        sort === key ? 'text-brand-base' : 'text-mg-text-2'
                      }`}
                    >
                      {sort === key ? <LuCheck size={11} /> : <span className="w-[11px]" />}
                      {sortLabels[key]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
      </div>

      {/* 两列：筛选栏（卡片）+ 卡片网格 */}
      <div className="mg-plaza-layout">
        <div className={`models-sticky mg-side-card ${filtersOpen ? 'block' : 'hidden lg:block'}`}>
          <CatalogSidebar tags={tags} selected={selected} setSelected={setSelected} isZh={isZh} facets={facets} />
        </div>

        <div>
          {!modelsQuery.isLoading && !modelsQuery.isError && (
            <p className="mg-count">{t('modelsCatalog.count', { n: visibleModels.length })}</p>
          )}

          {/* 列表状态 */}
          {modelsQuery.isLoading ? (
            <div className="models-catalog-grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-mg-bg-0 border-mg-border  h-[150px] animate-pulse rounded-md border"/>
              ))}
            </div>
          ) : modelsQuery.isError ? (
            <div className="border-mg-border text-mg-text-3 rounded-md border p-6 text-center text-[13px]">
              {t('modelsCatalog.error.load')}
            </div>
          ) : visibleModels.length === 0 ? (
            <div className="bg-mg-bg-0 border-mg-border flex flex-col items-center justify-center rounded-md border py-20 text-center">
              <LuLayers size={28} className="text-mg-text-4 mb-3" />
              <p className="text-mg-text-3 text-[13px]">{t('modelsCatalog.emptyFiltered')}</p>
              <button type="button" onClick={reset} className="text-mg-text-3 mt-3 text-[12px] underline-offset-2 hover:underline">
                {t('modelsCatalog.clearFilters')}
              </button>
            </div>
          ) : (
            <div className="models-catalog-grid">
              {visibleModels.map((model, index) => (
                <CatalogCard
                  key={model.id}
                  model={model}
                  isZh={isZh}
                  onTry={handleGoPlayground}
                  canCompare={model.compare_enabled === true}
                  onCompare={(e) => { e.stopPropagation(); openCompare(model.id) }}
                  onPickProtocol={(p) =>
                    setSelected((prev) => [...prev.filter((k) => !k.startsWith('protocol:')), `protocol:${p}`])
                  }
                  onPickCapability={(tag) =>
                    setSelected((prev) =>
                      prev.includes(`tag:${tag}`) ? prev : [...prev, `tag:${tag}`],
                    )
                  }
                  listPosition={index}
                  onCardOpened={(m, pos) => trackEvent('marketplace_card_opened', { model_id: m.model_id, list_position: pos })}
                  onModelIdCopied={(m) => trackEvent('marketplace_model_id_copied', { model_id: m.model_id, source: 'card' })}
                  onApiRequest={(m: CatalogModelItem) => trackEvent('marketplace_api_request_clicked', { model_id: m.model_id })}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <ModelsCompareModal
        isOpen={isCompareOpen}
        onClose={() => setIsCompareOpen(false)}
        allModels={allModels}
        initialSelectedIds={compareInitialIds}
        currentModelId={compareCurrentModelId}
        onConfirmCompare={(ids) => {
          if (ids.length === 0) return
          if (!isAuthenticated) {
            navigate(toLoginWithRedirect(undefined, {
              compare_with: ids,
              experience_type: 'compare',
              detail_source: 'catalog',
            }))
            return
          }
          navigate('/models/compare', { state: { selectedIds: ids } })
        }}
      />
    </div>
  )
}
