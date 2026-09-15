/**
 * 模型详情页（公开，/models/:modelId）
 * 数据：GET /api/v1/catalog/models/:id（公开）
 * 推理供应商区块已按 PRD 删除，对应公开 API 也已下线，故不再拉取。
 * 复用 features/models 的 ModelDetailPanel；匿名可看，「去体验」需登录。
 */
import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { LuArrowLeft, LuExternalLink } from 'react-icons/lu'
import { getModel, listModels, listRelatedModels } from '@/services/catalog'
import { useAuthStore } from '@/store/auth'
import { useLangStore } from '@/store/use-brand-store'
import { getMarketConfig, isTestOrDev } from '@/config/market'
import { appendCrossSiteParams } from '@/lib/cross-site-link'
import { toLoginWithRedirect } from '@/lib/redirect'
import { isNotFoundError } from '@/lib/request-error-message'
import { crossSiteModelUrl } from './cross-site-model-url'
import { modelDetailPath } from '../model-detail-path'
import { trackEvent, trackPageView } from '@/lib/track'
import { Button } from '@/components/ui/Button'
import { formatContextLength, prettyModelName } from '@/lib/utils'
import { ModelDetailPanel } from '@/features/models/components/ModelDetailPanel'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { relatedPriceView } from '@/features/models/related-price'
import { resolveModelCategory, hasPlaygroundExperience } from '../model-experience-data'
import { mapApiProtocols } from '../api-code-samples'
import { ModelsCompareModal } from '../components/ModelsCompareModal'
import { ApiAccessPanel } from './ApiAccessPanel'
import { BenchmarkSection } from './BenchmarkSection'
import '../catalog/catalog.css'

/** 进入详情页时携带的导航上下文：来源 + 是否需要直接定位到 API 接入区 */
interface DetailNavState {
  source?: 'catalog_list' | 'catalog_featured' | 'related' | 'discovery' | string
  scrollTo?: 'api-access'
  /** qa#292：从广场带过来的筛选 query（含 `?`），返回时原样带回去还原筛选 */
  fromSearch?: string
  /** v1.0.6 §2.2：从模型发现页带过来的分析筛选 query，返回时原样带回 */
  fromDiscoverySearch?: string
  /** v1.0.6 §2.2：离开发现页时的滚动位置，返回后恢复现场 */
  fromDiscoveryScrollY?: number
}

export default function ModelDetailPage() {
  const { modelId = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { t, i18n } = useTranslation()
  const isZh = i18n.language.startsWith('zh')
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const market = useLangStore((s) => s.market)
  const docsUrl = appendCrossSiteParams(getMarketConfig(market).docsUrl)

  // 40401 时的跨站兜底，判断口径见 cross-site-model-url.ts
  const crossSiteUrl = crossSiteModelUrl(modelId, market, isTestOrDev(), (m) => getMarketConfig(m).consoleUrl)

  const navState = (location.state as DetailNavState | null) ?? null
  const detailSource = navState?.source ?? 'direct'

  /**
   * v1.0.6 §2.2：来源是模型发现页时，返回目标改成发现页并带回它的分析筛选；
   * 其余来源维持原有「返回模型广场」行为。发现页的筛选**不**带回广场，两者
   * 是不同维度的筛选，混带会让广场出现莫名其妙的选中态。
   */
  const fromDiscovery = detailSource === 'discovery'
  const backToSource = () => {
    if (fromDiscovery) {
      navigate(`/models/discovery${navState?.fromDiscoverySearch ?? ''}`, {
        state: { restoreScrollY: navState?.fromDiscoveryScrollY },
      })
      return
    }
    navigate(`/models${navState?.fromSearch ?? ''}`)
  }

  const apiSectionRef = useRef<HTMLDivElement>(null)
  const viewTrackedRef = useRef(false)
  const [isCompareOpen, setIsCompareOpen] = useState(false)

  const detailQuery = useQuery({
    queryKey: ['catalog-model-detail', modelId],
    queryFn: () => getModel(modelId),
    enabled: !!modelId,
    staleTime: 5 * 60_000,
    // 页面下方已按「模型不存在 / 加载失败」两种情况渲染错误态，不需要全局 toast 再说一遍。
    // 尤其 40401 被错误层归一成「服务暂不可用」，套在「这个模型不存在」上会让用户以为系统故障（qa#595）。
    meta: { silentError: true },
  })
  /**
   * 相关模型。运营配置优先，未配置时后端回退「同厂商优先、再按输入价接近度」。
   * curated 只是来源标识，两种情况渲染完全一致 —— 用户不该看出区别。
   */
  const relatedQuery = useQuery({
    queryKey: ['catalog-model-related', modelId],
    queryFn: () => listRelatedModels(modelId),
    enabled: !!modelId,
    staleTime: 5 * 60_000,
  })
  const related = relatedQuery.data?.items ?? []
  const detail = detailQuery.data

  /**
   * 对比候选池。只在弹窗真的打开后才拉 —— 详情页首屏不需要全量目录，
   * 那是一条 page_size:100 的请求，不该为一个未点开的入口付代价。
   * pytest-* 过滤与广场列表页同一处理（test 库里测试模型仍 hidden=false）。
   */
  const compareCandidatesQuery = useQuery({
    queryKey: ['catalog-models', 'compare-candidates'],
    queryFn: () => listModels({ page_size: 100 }),
    enabled: isCompareOpen,
    staleTime: 5 * 60_000,
  })
  const compareCandidates = (compareCandidatesQuery.data?.items ?? [])
    .filter((m) => !/^pytest/i.test(m.model_id))

  const openCompare = () => {
    trackEvent('marketplace_compare_clicked', { model_id: detail?.model_id ?? modelId, source: 'detail' })
    setIsCompareOpen(true)
  }

  // marketplace_detail_view（PRD §10.2）：详情数据到位才算「有效展示」，只上报一次。
  // intent 目前只有 browse/api 两类：从卡片「API请求」跳转（携带 scrollTo=api-access）
  // 记为 api，其余（列表卡片/轮播/相关模型/直接访问）记为 browse。
  useEffect(() => {
    if (viewTrackedRef.current || !detail) return
    viewTrackedRef.current = true
    // 注意：trackPageView(key) 内部会自动生成 event_name = `${key}_view`，如果这里传
    // 'marketplace_detail' 会与下面 PRD 明确要求的 marketplace_detail_view 撞名、两种
    // 不同 payload 形状混在同一个 event_name 下。用 'marketplace_model_detail' 错开。
    trackPageView('marketplace_model_detail', { model_id: detail.model_id })
    trackEvent('marketplace_detail_view', {
      intent: navState?.scrollTo === 'api-access' ? 'api' : 'browse',
      source: detailSource,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail])

  /**
   * 卡片「API请求」进入时自动滚动到 API 接入区，不打开新弹窗（PRD §8.3）。
   *
   * ⚠️ 已知未修复：实测（本次改造前的 test 代码同样如此）落地后 scrollY 恒为 0 ——
   * scrollIntoView 确实被调用，但那一刻页面还没撑开（scrollHeight 898 / 视口 620），
   * 算出的目标到不了 API 区。rAF 延后一帧、瞬时滚动、依赖 related.length 重试都试过，
   * 均未生效，需要单独排查（与本次「详情页对齐原型」无关，故不在本次改动里带）。
   */
  useEffect(() => {
    if (navState?.scrollTo === 'api-access' && detail && apiSectionRef.current) {
      apiSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail])

  const goTry = () => {
    trackEvent('marketplace_try_clicked', {
      auth_state: isAuthenticated ? 'authenticated' : 'anonymous',
      // experience_status 记录本次点击的实际去向（PRD 未给出更细的余额态口径 —— 模型
      // 广场本就不接收 spendable_balance，见 §11「余额边界」），非登录即直达体验页。
      experience_status: isAuthenticated ? 'enter_playground' : 'redirect_login',
      experience_type: 'try',
      source: 'detail',
    })
    if (!isAuthenticated) {
      navigate(toLoginWithRedirect(undefined, {
        model_id: detail?.model_id,
        model_category: detail ? resolveModelCategory(detail) : undefined,
        experience_type: 'try',
        detail_source: 'detail',
      }))
      return
    }
    navigate('/models/playground', { state: { selectedModelId: detail?.model_id } })
  }

  const handleGetKey = () => {
    trackEvent('marketplace_get_key_clicked', {
      model_id: detail?.model_id ?? modelId,
      auth_state: isAuthenticated ? 'authenticated' : 'anonymous',
    })
    if (!isAuthenticated) {
      // 登录后直接进入 API Keys（PRD §8.1「获取 API Key」行：游客→登录后进入 API Keys）
      navigate(toLoginWithRedirect('/api-keys', { detail_source: 'detail' }))
      return
    }
    navigate('/api-keys')
  }

  const handleDocsClick = () => {
    trackEvent('marketplace_docs_clicked', { model_id: detail?.model_id ?? modelId })
  }

  /**
   * 页面宽度与分区块都对齐现状广场列表页 + 原型：列表页 `.models-catalog-page`
   * 没有 max-width（跟随外层 layout），详情页此前独自锁 1080px 居中，从列表点进来
   * 内容区会突然收窄；原型也是 hero / 规格 / API / 相关模型 四块独立卡，而不是
   * 一张大卡里拿分隔线切段。
   */
  return (
    <div className="models-catalog-page">
      <button
        type="button"
        onClick={backToSource}
        className="inline-flex w-fit items-center gap-1 text-[13px] text-mg-text-3 transition-colors hover:text-brand-base"
      >
        {/* 原型是 "← 返回模型广场"，← 是箭头不是尖括号，图标要用 LuArrowLeft 不是 LuChevronLeft */}
        <LuArrowLeft size={15} />
        {fromDiscovery
          ? t('modelsCatalog.discovery.backToDiscovery')
          : t('modelsCatalog.detail.backToCatalog')}
      </button>

      {detailQuery.isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-mg-bg-0 border-mg-border  h-[120px] animate-pulse rounded-md border"/>
          ))}
        </div>
      ) : detailQuery.isError || !detail ? (
        <div className="border-mg-border text-mg-text-3 rounded-md border p-8 text-center text-[13px]">
          {/* 资源确实不存在（40401/404）才说「模型不存在」；网络/服务故障是另一回事，
              说成「不存在」会误导用户以为模型已下架（qa#595） */}
          {detailQuery.isError && !isNotFoundError(detailQuery.error) ? (
            t('modelsCatalog.detail.loadFailed')
          ) : (
            <>
              <p>{t('modelsCatalog.detail.notFound')}</p>
              <p className="mt-1">{t('modelsCatalog.detail.notFoundHint')}</p>
              {crossSiteUrl && (
                <Button className="mt-4" variant="outline" size="sm" asChild>
                  <a href={crossSiteUrl} rel="noopener noreferrer" target="_blank">
                    {t('modelsCatalog.detail.notFoundCrossSite')}
                    <LuExternalLink size={13} />
                  </a>
                </Button>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          {/* Hero 操作区（PRD §7.6 / 原型 App.tsx:5073-5097）：去体验 + 模型对比 +
              查看API接入手册，挂在 Hero 右侧而不是规格区下面 —— 原型把主 CTA 与
              模型身份同屏对齐，滚动前就能点。
              AC-13「暂未开放」：没配置任何可体验任务时禁用并把文案换成「暂未开放」
              （原型 App.tsx:5074-5082 逐字对齐，不只是禁用，按钮文字本身也要变）。 */}
          <ModelDetailPanel
            detail={detail}
            onModelIdCopied={() => trackEvent('marketplace_model_id_copied', { model_id: detail.model_id, source: 'detail' })}
            actions={
              <>
                <Button
                  variant="brand"
                  disabled={!hasPlaygroundExperience(detail)}
                  title={!hasPlaygroundExperience(detail) ? t('modelsCatalog.button.comingSoonHint') : undefined}
                  onClick={goTry}
                >
                  {/* 原型 App.tsx:5073-5079「去体验」「模型对比」都是纯文本按钮，没有图标 */}
                  {hasPlaygroundExperience(detail) ? t('modelsCatalog.button.try') : t('modelsCatalog.button.comingSoon')}
                </Button>
                {detail.compare_enabled === true && (
                  <Button variant="outline" onClick={openCompare}>
                    {t('modelsCatalog.button.compare')}
                  </Button>
                )}
                <a
                  href={docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleDocsClick}
                  className="inline-flex items-center gap-1 text-[13px] text-mg-text-3 transition-colors hover:text-brand-base"
                >
                  {t('modelsCatalog.detail.viewApiGuide')}
                  <LuExternalLink size={13} />
                </a>
              </>
            }
          />

          {/* API 接入区（PRD §7.6）：标题右侧只保留「获取API Key」；代码 Tab 按协议过滤 */}
          <div className="mg-tile mg-detail-card">
            <ApiAccessPanel
              ref={apiSectionRef}
              modelId={detail.model_id}
              protocols={mapApiProtocols(detail.protocols)}
              isZh={isZh}
              onGetKeyClick={handleGetKey}
              onTabChange={(codeTab, protocol) => trackEvent('marketplace_api_tab_changed', { code_tab: codeTab, protocol })}
              onCodeCopied={(codeTab) => trackEvent('marketplace_api_code_copied', { model_id: detail.model_id, code_tab: codeTab })}
            />
          </div>

          {/* v1.0.6 §2.3 区块顺序：Hero/规格 → API 接入 → Benchmark → 相关模型。
              「平台运行表现」原本夹在 API 接入与 Benchmark 之间，产品侧决定不再对外
              暴露平台侧真实调用统计，已整块下线（shared/modelgo_prd#1035）。
              Benchmark 是独立 .mg-tile.mg-detail-card，区块间距由外层 flex gap 统一给，
              删掉上一块不会留空洞。 */}
          <BenchmarkSection modelId={detail.model_id} />

          {related.length > 0 && (
            <section className="mg-tile mg-detail-card">
              <h3 className="text-mg-text-1 mb-3 text-[14px] font-semibold">
                {t('modelsCatalog.detail.relatedModels')}
              </h3>
              {/* 卡片信息照原型 App.tsx:5205-5222：厂商图标 + 名称 / 「厂商 · 1M 上下文」/
                  「¥x / ¥y 每M」。上下文走 formatContextLength（原本裸 /1000 会把
                  1048576 显示成 1049K），名称走 prettyModelName（原本直接吐
                  `anthropic/claude-sonnet-4.6` 这类原始 ID）。 */}
              <div className="mg-related-grid">
                {related.map((item) => {
                  // 价格与是否显示上下文按 relatedPriceView 统一给（shared/modelgo_prd#861）：
                  // 媒体模型主价格 = price_tiers 最高档（#853 口径）且不显示「NNNK 上下文」，
                  // 文本模型维持「¥输入 / ¥输出 每M」。取值链复用卡片的 mediaPrimaryPrice。
                  const price = relatedPriceView(item, isZh)
                  return (
                  <button
                    key={item.id}
                    type="button"
                    className="mg-tile mg-tile-hover mg-related-card"
                    onClick={() => navigate(modelDetailPath(item), { state: { source: 'related' } })}
                  >
                    <span className="mg-related-head">
                      <ModelIcon
                        model={{ logo_url: item.logo_url, vendor: item.vendor, display_name: item.name }}
                        variant="inline"
                        rounded="rounded-full"
                        className="mg-related-avatar"
                      />
                      <span className="mg-related-name">{prettyModelName(item.name, item.model_id, item.vendor)}</span>
                    </span>
                    <span className="mg-related-meta">
                      {item.vendor}
                      {price.showContext
                        && ` · ${formatContextLength(item.context_length)} ${t('modelsCatalog.labels.context')}`}
                    </span>
                    <span className="mg-related-price">
                      {/* 未配价（零价且无限免标记）显示「—」而非「$0 / 0 每M」——§9.1，
                          与详情面板/广场卡片同口径（qa#624）。
                          媒体/按张模型单值主价格（¥77/M、¥0.22/张），划线原价只在原价确高于
                          现价时跟在右侧（同卡片守卫）；文本模型两个数各带货币符号
                          （原型 App.tsx:5996「¥输入 / ¥输出 每M」；prd#853 QA 复验指出）；
                          输出价为 0 的脏数据只展示输入价、不带单位。 */}
                      {price.kind === 'free'
                        ? t('modelsCatalog.detail.limitedFree')
                        : price.kind === 'primary'
                          ? (
                            <>
                              {price.text}
                              {price.strike && <s className="mg-metric-strike">{price.strike}</s>}
                            </>
                          )
                          : price.kind === 'pair'
                            ? t('modelsCatalog.detail.relatedPrice', { input: price.input, output: price.output })
                            : price.kind === 'single'
                              ? price.text
                              : '—'}
                    </span>
                  </button>
                  )
                })}
              </div>
            </section>
          )}
        </>
      )}

      {/* 模型对比（原型 App.tsx:5083-5087：仅对比开关打开的模型给入口）。
          以当前模型为基准，候选资格由弹窗按一级类别 + 共同体验类型判定。 */}
      <ModelsCompareModal
        isOpen={isCompareOpen}
        onClose={() => setIsCompareOpen(false)}
        allModels={compareCandidates}
        initialSelectedIds={detail ? [detail.id] : []}
        currentModelId={detail?.id}
        onConfirmCompare={(ids) => {
          if (ids.length === 0) return
          if (!isAuthenticated) {
            navigate(toLoginWithRedirect(undefined, {
              compare_with: ids,
              experience_type: 'compare',
              detail_source: 'detail',
            }))
            return
          }
          navigate('/models/compare', { state: { selectedIds: ids } })
        }}
      />
    </div>
  )
}
