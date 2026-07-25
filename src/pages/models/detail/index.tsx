/**
 * 模型详情页（公开，/models/:modelId）
 * 数据：GET /api/v1/catalog/models/:id（公开）
 * 推理供应商区块已按 PRD 删除，对应公开 API 也已下线，故不再拉取。
 * 复用 features/models 的 ModelDetailPanel；匿名可看，「去体验」需登录。
 */
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu'
import { getModel, listRelatedModels } from '@/services/catalog'
import { useAuthStore } from '@/store/auth'
import { toLoginWithRedirect } from '@/lib/redirect'
import { Button } from '@/components/ui/Button'
import { trimPriceZeros } from '@/lib/utils'
import { ModelDetailPanel } from '@/features/models/components/ModelDetailPanel'
import '../catalog/catalog.css'

export default function ModelDetailPage() {
  const { modelId = '' } = useParams()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const isZh = i18n.language.startsWith('zh')
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

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

  const goTry = () => {
    if (!isAuthenticated) { navigate(toLoginWithRedirect()); return }
    navigate('/models/playground', { state: { selectedModelId: detail?.model_id } })
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
          <ModelDetailPanel detail={detail} />
          <div className="border-mg-border mt-6 flex items-center gap-3 border-t pt-5">
            <Button variant="brand" onClick={goTry}>
              {t('modelsCatalog.button.try')}
              <LuChevronRight size={14} />
            </Button>
          </div>

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
                    onClick={() => navigate(`/models/${item.slug || item.id}`)}
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
