/**
 * 模型详情页（公开，/models/:modelId）
 * 数据：GET /api/v1/catalog/models/:id（公开）
 * 推理供应商区块已按 PRD 删除，对应公开 API 也已下线，故不再拉取。
 * 复用 features/models 的 ModelDetailPanel；匿名可看，「去体验」需登录。
 */
import { useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { LuChevronLeft, LuChevronRight, LuExternalLink } from 'react-icons/lu'
import { getModel, listRelatedModels } from '@/services/catalog'
import { useAuthStore } from '@/store/auth'
import { useLangStore } from '@/store/use-brand-store'
import { getMarketConfig } from '@/config/market'
import { appendThemeParam } from '@/lib/theme'
import { toLoginWithRedirect } from '@/lib/redirect'
import { trackEvent, trackPageView } from '@/lib/track'
import { Button } from '@/components/ui/Button'
import { trimPriceZeros } from '@/lib/utils'
import { ModelDetailPanel } from '@/features/models/components/ModelDetailPanel'
import { resolveModelCategory, hasPlaygroundExperience } from '../model-experience-data'
import { mapApiProtocols } from '../api-code-samples'
import { ApiAccessPanel } from './ApiAccessPanel'
import '../catalog/catalog.css'

/** 进入详情页时携带的导航上下文：来源 + 是否需要直接定位到 API 接入区 */
interface DetailNavState {
  source?: 'catalog_list' | 'catalog_featured' | 'related' | string
  scrollTo?: 'api-access'
}

export default function ModelDetailPage() {
  const { modelId = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { t, i18n } = useTranslation()
  const isZh = i18n.language.startsWith('zh')
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const market = useLangStore((s) => s.market)
  const docsUrl = appendThemeParam(getMarketConfig(market).docsUrl)

  const navState = (location.state as DetailNavState | null) ?? null
  const detailSource = navState?.source ?? 'direct'

  const apiSectionRef = useRef<HTMLDivElement>(null)
  const viewTrackedRef = useRef(false)

  const detailQuery = useQuery({
    queryKey: ['catalog-model-detail', modelId],
    queryFn: () => getModel(modelId),
    enabled: !!modelId,
    staleTime: 5 * 60_000,
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

  // 卡片「API请求」进入时自动滚动到 API 接入区，不打开新弹窗（PRD §8.3）
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

  return (
    <div className="models-catalog-page mx-auto w-full max-w-[1080px]">
      <button
        type="button"
        onClick={() => navigate('/models')}
        className="inline-flex w-fit items-center gap-1 text-[13px] text-mg-text-3 transition-colors hover:text-brand-base"
      >
        <LuChevronLeft size={15} />
        {isZh ? '返回模型广场' : 'Back to models'}
      </button>

      {detailQuery.isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-mg-bg-0 border-mg-border  h-[120px] animate-pulse rounded-md border"/>
          ))}
        </div>
      ) : detailQuery.isError || !detail ? (
        <div className="border-mg-border text-mg-text-3 rounded-md border p-8 text-center text-[13px]">
          {isZh ? '模型不存在或加载失败' : 'Model not found or failed to load'}
        </div>
      ) : (
        <div className="bg-mg-bg-0 border-mg-border rounded-lg border p-6">
          <ModelDetailPanel
            detail={detail}
            onModelIdCopied={() => trackEvent('marketplace_model_id_copied', { model_id: detail.model_id, source: 'detail' })}
          />
          {/* Hero 操作行（PRD §7.6）：去体验 + 查看API接入手册（新标签页打开公开文档）。
              AC-13「暂未开放」：没配置任何可体验任务时禁用并把文案换成「暂未开放」
              （原型 App.tsx:5074-5082 逐字对齐，不只是禁用，按钮文字本身也要变）。 */}
          <div className="border-mg-border mt-6 flex flex-wrap items-center gap-3 border-t pt-5">
            <Button
              variant="brand"
              disabled={!hasPlaygroundExperience(detail)}
              title={!hasPlaygroundExperience(detail) ? t('modelsCatalog.button.comingSoonHint') : undefined}
              onClick={goTry}
            >
              {hasPlaygroundExperience(detail) ? t('modelsCatalog.button.try') : t('modelsCatalog.button.comingSoon')}
              <LuChevronRight size={14} />
            </Button>
            <a
              href={docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleDocsClick}
              className="inline-flex items-center gap-1 text-[13px] text-mg-text-3 transition-colors hover:text-brand-base"
            >
              {isZh ? '查看API接入手册' : 'View API integration guide'}
              <LuExternalLink size={13} />
            </a>
          </div>

          {/* API 接入区（PRD §7.6）：标题右侧只保留「获取API Key」；代码 Tab 按协议过滤 */}
          <ApiAccessPanel
            ref={apiSectionRef}
            modelId={detail.model_id}
            protocols={mapApiProtocols(detail.protocols)}
            isZh={isZh}
            onGetKeyClick={handleGetKey}
            onTabChange={(codeTab, protocol) => trackEvent('marketplace_api_tab_changed', { code_tab: codeTab, protocol })}
            onCodeCopied={(codeTab) => trackEvent('marketplace_api_code_copied', { model_id: detail.model_id, code_tab: codeTab })}
          />

          {related.length > 0 && (
            <section className="border-mg-border mt-6 border-t pt-5">
              <h3 className="text-mg-text-1 mb-3 text-[14px] font-semibold">
                {isZh ? '相关模型' : 'Related models'}
              </h3>
              <div className="mg-related-grid">
                {related.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="mg-tile mg-tile-hover mg-related-card"
                    onClick={() => navigate(`/models/${item.slug || item.id}`, { state: { source: 'related' } })}
                  >
                    <span className="mg-related-name">{item.name}</span>
                    <span className="mg-related-meta">
                      {item.vendor}
                      {item.context_length > 0 && ` · ${Math.round(item.context_length / 1000)}K`}
                    </span>
                    <span className="mg-related-price">
                      {item.is_free
                        ? (isZh ? '限时免费' : 'Free')
                        : `${item.currency === 'CNY' ? '¥' : '$'} ${trimPriceZeros(item.input_price)} / ${trimPriceZeros(item.output_price)}`}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
