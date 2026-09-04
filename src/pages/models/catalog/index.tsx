/**
 * 模型广场（公开页 /models 使用）
 * 布局参考国外官网：左侧筛选 chip 栏 + 右侧吸顶搜索/排序卡 + 竖向宽卡片列表。
 * 数据：GET /api/v1/catalog/models | catalog/model-tags | catalog/model-families（均公开）
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  LuSearch, LuChevronDown, LuCheck, LuSlidersHorizontal, LuLayers, LuZap, LuBuilding2, LuShieldCheck,
  LuChartColumn, LuArrowRight, LuColumns2, LuType, LuImage, LuVideo, LuAudioLines, LuDatabase, LuX,
} from 'react-icons/lu'
import type { IconType } from 'react-icons'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { listModels, listModelTags, listFeatured } from '@/services/catalog'
import { useAuthStore } from '@/store/auth'
import { toLoginWithRedirect } from '@/lib/redirect'
import { trackEvent, trackPageView } from '@/lib/track'
import { resolveModelCategory } from '../model-experience-data'
import { CatalogCard } from './CatalogCard'
import { CatalogFeatured } from './CatalogFeatured'
import { CatalogSidebar } from './CatalogSidebar'
import {
  OUTPUT_MODALITY_CODES,
  parseCatalogFilters,
  matchesCatalogFilters,
  matchesCatalogFiltersExceptOutput,
  outputModalitiesOf,
} from './modelCatalogFilterLogic'
import { ModelsCompareModal } from '../components/ModelsCompareModal'
import { OnboardingGuideFloatingEntry } from '@/features/onboarding/OnboardingGuideEntry'
import { useOnboardingGuide } from '@/features/onboarding/use-onboarding-guide'
import { queryLengthBucket, diffFilterChange, buildFilterSummary } from './catalog-tracking'
import type { CatalogModelItem } from '@/types'
import './catalog.css'

type SortKey = 'default' | 'newest' | 'cheapest'

/** 输出模态分类栏图标（原型 marketplaceOutputModalityOptions 同款隐喻） */
const OUTPUT_TAB_ICON: Record<string, IconType> = {
  all: LuColumns2,
  text: LuType,
  image: LuImage,
  video: LuVideo,
  audio: LuAudioLines,
  embedding: LuDatabase,
  rerank: LuSlidersHorizontal,
}


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

  // 新手指南：本页既是第 1 步的完成证据，也是悬浮入口的宿主
  const { guide: onboardingGuide, reportStep: reportOnboardingStep } = useOnboardingGuide()

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
  const searchInputRef = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const revealedCardsRef = useRef(new WeakSet<Element>())

  const sortLabels: Record<SortKey, string> = {
    default: t('modelsCatalog.sort.default'),
    newest: t('modelsCatalog.sort.newest'),
    cheapest: t('modelsCatalog.sort.cheapest'),
  }

  /** `dim:value` 编码的筛选状态（多选维度会有同前缀多项），解析口径见 parseCatalogFilters */
  const filterState = useMemo(() => parseCatalogFilters(selected), [selected])

  /**
   * 只有搜索与排序仍走服务端（推荐排序的口径是服务端定义的，前端不重算）；
   * 维度筛选改为前端本地执行 —— 多选厂商/协议与输入类型筛选超出了后端单值参数
   * 契约（#872，见 modelCatalogFilterLogic.ts 头注），列表本就一次拉全。
   */
  const listParams = useMemo(() => ({
    page_size: 100,
    q: search.trim() || undefined,
    sort: sort === 'default' ? undefined : sort,
  }), [search, sort])

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
   * 维度筛选本地执行（#872）：组内 OR、组间 AND，排序沿用服务端返回顺序。
   * 拆成「除输出模态外」与「输出模态」两步 —— 输出模态分类栏的计数要描述
   * 「其余条件都生效、仅本维度不设限」的结果集（标准 faceted search），
   * 直接对最终结果集计数会让未选中的分类恒为 0。
   *
   * qa#291 二轮反馈：「热门」排序已删除——原型 App.tsx 只有 推荐排序/最新发布
   * 两个选项，没有热门；服务端热度排序也确实没上线，需求方确认可以直接删掉，
   * 不必等后端就绪再"原地替换"（之前的决策）。
   */
  const modelsBeforeOutput = useMemo(
    () => allModels.filter((m) => matchesCatalogFiltersExceptOutput(m, filterState)),
    [allModels, filterState],
  )
  const visibleModels = useMemo(
    () => modelsBeforeOutput.filter((m) => matchesCatalogFilters(m, filterState)),
    [modelsBeforeOutput, filterState],
  )

  /** 输出模态分类栏计数（#872 需求点 9）：数量为 0 时前端隐藏数字（渲染处判断） */
  const outputCounts = useMemo(() => {
    const counts: Record<string, number> = { all: modelsBeforeOutput.length }
    for (const code of OUTPUT_MODALITY_CODES) {
      counts[code] = modelsBeforeOutput.filter((m) => outputModalitiesOf(m).includes(code)).length
    }
    return counts
  }, [modelsBeforeOutput])

  const outputActive = filterState.outputModality ?? 'all'
  const pickOutputModality = (code: string) =>
    setSelected((prev) => [
      ...prev.filter((k) => !k.startsWith('modality:')),
      ...(code === 'all' ? [] : [`modality:${code}`]),
    ])

  /**
   * 卡片进入视口前的轻量过渡。
   *
   * 不把未进入视口的卡片预先设成 opacity:0 —— 快速滚动跨过 observer 的预加载区时，
   * 那种实现会再次露出整片空白。这里让内容始终正常绘制，只在卡片提前进入 420px
   * 预热区时播放一次短促的 opacity + transform 动画；回调来不及时仍显示完整内容。
   */
  useEffect(() => {
    const grid = gridRef.current
    if (!grid || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || revealedCardsRef.current.has(entry.target)) return
        revealedCardsRef.current.add(entry.target)
        observer.unobserve(entry.target)

        entry.target.classList.add('is-entering-view')
      })
    }, { rootMargin: '420px 0px', threshold: 0.01 })

    grid.querySelectorAll('.mg-mcard').forEach((card) => {
      if (!revealedCardsRef.current.has(card)) observer.observe(card)
    })
    return () => observer.disconnect()
  }, [visibleModels])

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
      catalog_count: allModels.length,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelsQuery.isLoading, modelsQuery.isError])

  /**
   * 新手指南第 1 步「浏览模型广场」：证据是**登录态下**目录真正展示出来这件事，
   * 不是点了入口（规格 §7 表：认证后的页面访问业务事件）。匿名访客不计。
   *
   * ⚠️ 必须独立成一个 effect，不能挂在上面 marketplace_view 里 —— 那个有
   * viewTrackedRef 单次闩锁，而本页是**公开页**，模型列表常常比 GET /tenants 先到；
   * 租户信息没回来时 guide 还没建，store 的 `if (!guides[tenantId]) return` 会把这
   * 一步静默丢掉，闩锁却已经翻了，于是这次访问永远补不回来。用户看到的症状就是
   * 「点了『去浏览』没反应、一直 0/5」。
   *
   * 所以这里等 onboardingGuide 就绪再报，并且不加闩锁：领域层对重复完成同一步是
   * 幂等的（返回原引用），guide 因为其他步骤推进而变化时重跑一次也只是空转。
   */
  useEffect(() => {
    if (!isAuthenticated || !onboardingGuide) return
    if (modelsQuery.isLoading || modelsQuery.isError) return
    reportOnboardingStep('marketplace', 'page_visit', 'marketplace')
  }, [
    isAuthenticated,
    onboardingGuide,
    modelsQuery.isLoading,
    modelsQuery.isError,
    reportOnboardingStep,
  ])

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
        className={`bg-mg-bg-2 fixed bottom-6 right-5 z-[var(--mg-z-sticky)] inline-flex h-11 items-center gap-2 rounded-full border px-6 mg-text-body font-medium shadow-lg backdrop-blur lg:hidden ${
          filtersOpen ? 'border-brand-base text-brand-base' : 'border-mg-border text-mg-text-2'
        }`}
      >
        <LuSlidersHorizontal size={15} />
        {t('modelsCatalog.filtersButton')}
      </button>

      {/* 页面结构（2026-08 视觉改版稿）：标题 / 轮播 两块全宽；搜索排序在下方
          两列布局的右列内、与筛选侧栏顶部平行。轮播保持全宽不被侧栏挤窄。 */}
      <div className="mg-plaza">
          {/* 标题区只有身份信息（标题 + 副标题 + 信任 chips）。
              「模型发现」入口在下面的搜索/排序工具栏最右 —— 2026-09-03 按 PRD 原型
              （.marketplace-discovery-entry）挪回去的，原先放这里且降成中性 outline，
              与原型不一致。它仍是模型发现的**唯一**入口，不进顶栏、不进左侧导航、
              不进模型卡（见 plans/2026-08-24-v1.0.6-model-discovery-ui-flow §2.1 修订段）。 */}
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-mg-text-1 catalog-title text-[34px] font-bold tracking-tight">
                {t('modelsCatalog.page.title')}
              </h1>
              <p className="text-mg-text-3 mt-1.5 mg-text-body">
                {t('modelsCatalog.page.subtitle')}
              </p>
              {/* 信任 chips：协议兼容 / 供应商直连 / SLA。2026-08 视觉改版稿改白底
                  描边 pill，SLA 用 warning 强调色（稿上唯一的暖色点缀）。 */}
              <div className="mg-trust">
                <span><LuZap size={12} />{t('modelsCatalog.trust.protocols')}</span>
                <span><LuBuilding2 size={12} />{t('modelsCatalog.trust.providers')}</span>
                <span className="is-sla"><LuShieldCheck size={12} />{t('modelsCatalog.trust.sla')}</span>
              </div>
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

      </div>

      {/* 两列：筛选栏（卡片）+ 右列（搜索排序 + 卡片网格）。
          2026-08 视觉改版稿：搜索/排序不再全宽独立一行，收进右列与筛选侧栏
          顶部平行对齐（侧栏顶 = 搜索框顶）。 */}
      <div className="mg-plaza-layout">
        {/* 筛选栏不吸顶（需求方 2026-08-26 口径）：往下滚动浏览模型时侧栏随页面滚走，
            左列留空；lg:self-start 防止 grid 列拉伸把卡片撑满整列高度 */}
        <div className={`mg-side-card lg:self-start ${filtersOpen ? 'block' : 'hidden lg:block'}`}>
          <CatalogSidebar
            tags={tags}
            models={allModels}
            selected={selected}
            setSelected={setSelected}
            isZh={isZh}
          />
        </div>

        <div>
          {/* 搜索 + 排序（2026-09-04 控件统一：搜索走 ui/Input 标准组件 size="lg"——
              48px 高度/13px 字号/pill 圆角全部来自 token 档位，替换原先手写的
              .mg-search-input；排序按钮同档高度，与搜索框并排等高） */}
          <div className="models-toolbar">
            <Input
              ref={searchInputRef}
              variant="search"
              size="lg"
              prefix={<LuSearch className="w-4 h-4" />}
              suffix={search ? (
                <button
                  type="button"
                  className="mg-search-clear"
                  title={t('modelsCatalog.search.clear')}
                  aria-label={t('modelsCatalog.search.clear')}
                  onClick={() => { setSearch(''); searchInputRef.current?.focus() }}
                >
                  <LuX size={14} />
                </button>
              ) : undefined}
              placeholder={t('modelsCatalog.search.placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
            />
            <div className="relative" ref={sortRef}>
              <button type="button" onClick={() => setSortOpen((v) => !v)} className="mg-sort-btn">
                {sortLabels[sort]}
                <LuChevronDown size={13} className={sortOpen ? 'rotate-180' : ''} />
              </button>
              {/* 排序下拉表面走全局浮层类 mg-float，与 ui/DropdownMenu 同一档，避免同页两种下拉两种脸 */}
              {sortOpen && (
                <div className="mg-float absolute right-0 top-full z-[var(--mg-z-dropdown)] mt-1.5 min-w-[140px] overflow-hidden rounded-[var(--mg-popover-radius)] py-1">
                  {(['default', 'newest', 'cheapest'] as SortKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleSortChange(key)}
                      className={`hover:bg-mg-fill-1 flex w-full items-center gap-2 px-4 py-2 text-left mg-text-body transition-colors ${
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
            {/* 模型发现入口。位置与形态按 PRD 原型（.marketplace-discovery-entry）：
                与搜索、排序同一行的最右，柱状图标 + 文案 + 右箭头，品牌色强调。
                此前放在页头且降成中性 outline，与原型不一致（2026-09-03 需求方指出）。
                尺寸与同一行的搜索(lg)/排序触发器(lg)同档（2026-09-04 控件统一）：
                此前 size="sm"(32px) 跟在 48px 的搜索框后面，flex 行里高度参差。 */}
            <Button
              variant="brand-outline"
              size="lg"
              onClick={() => {
                // 只记点击，不把「加载成功」伪报成点击（§2.1）
                trackEvent('marketplace_discovery_entry_clicked', { source: 'catalog_toolbar' })
                navigate('/models/discovery')
              }}
            >
              <LuChartColumn size={14} />
              {t('modelsCatalog.discovery.entry')}
              <LuArrowRight size={13} />
            </Button>
          </div>

          {/* 输出模态分类栏（#872 需求点 9）：搜索栏下方，与侧栏各维度组合筛选；
              分类按钮显示当前其余条件下的模型数量，数量为 0 时隐藏数字。 */}
          <div className="mg-output-tabs" role="tablist" aria-label={t('modelsCatalog.outputModality.label')}>
            {(['all', ...OUTPUT_MODALITY_CODES] as const).map((code) => {
              const Icon = OUTPUT_TAB_ICON[code]
              const active = outputActive === code
              const count = outputCounts[code] ?? 0
              return (
                <button
                  key={code}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={active ? 'is-active' : ''}
                  onClick={() => pickOutputModality(code)}
                >
                  <Icon size={14} strokeWidth={1.8} aria-hidden />
                  <span>{code === 'all' ? t('modelsCatalog.outputModality.all') : t(`modelsCatalog.modality.${code}`)}</span>
                  {count > 0 && <i>{count}</i>}
                </button>
              )
            })}
          </div>

          {/* 列表状态 */}
          {modelsQuery.isLoading ? (
            <div className="models-catalog-grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-mg-bg-0 border-mg-border  h-[150px] animate-pulse rounded-md border"/>
              ))}
            </div>
          ) : modelsQuery.isError ? (
            <div className="border-mg-border text-mg-text-3 rounded-md border p-6 text-center mg-text-body">
              {t('modelsCatalog.error.load')}
            </div>
          ) : visibleModels.length === 0 ? (
            <div className="bg-mg-bg-0 border-mg-border flex flex-col items-center justify-center rounded-md border py-20 text-center">
              <LuLayers size={28} className="text-mg-text-4 mb-3" />
              <p className="text-mg-text-3 mg-text-body">{t('modelsCatalog.emptyFiltered')}</p>
              <button type="button" onClick={reset} className="text-mg-text-3 mt-3 mg-text-caption underline-offset-2 hover:underline">
                {t('modelsCatalog.clearFilters')}
              </button>
            </div>
          ) : (
            <div ref={gridRef} className="models-catalog-grid">
              {visibleModels.map((model, index) => (
                <CatalogCard
                  key={model.id}
                  model={model}
                  isZh={isZh}
                  onTry={handleGoPlayground}
                  canCompare={model.compare_enabled === true}
                  onCompare={(e) => { e.stopPropagation(); openCompare(model.id) }}
                  onPickProtocol={(p) =>
                    // 协议已是多选维度（#872）：反查筛选做「加选」，已选中则不重复加
                    setSelected((prev) =>
                      prev.includes(`protocol:${p}`) ? prev : [...prev, `protocol:${p}`],
                    )
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

      {/* 新手指南悬浮入口（规格 §5.1）：只在模型广场出现，与侧栏入口共享同一份租户进度 */}
      <OnboardingGuideFloatingEntry />

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
