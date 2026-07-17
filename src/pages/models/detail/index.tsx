/**
 * 模型详情页（公开，/models/:modelId）
 * 数据：GET /api/v1/catalog/models/:id（公开）+ /providers
 * 复用 features/models 的 ModelDetailPanel；匿名可看，「去体验」需登录。
 */
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu'
import { getModel, listModelProviders } from '@/services/catalog'
import { useAuthStore } from '@/store/auth'
import { toLoginWithRedirect } from '@/lib/redirect'
import { Button } from '@/components/ui/Button'
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
  const providersQuery = useQuery({
    queryKey: ['catalog-model-providers', modelId],
    queryFn: () => listModelProviders(modelId),
    enabled: !!modelId,
    staleTime: 5 * 60_000,
  })
  const detail = detailQuery.data
  const providers = providersQuery.data?.items ?? []

  const goTry = () => {
    if (!isAuthenticated) { navigate(toLoginWithRedirect()); return }
    navigate('/models/playground', { state: { selectedModelId: detail?.model_id } })
  }

  return (
    <div className="models-catalog-page mx-auto w-full max-w-[1080px]">
      <button
        type="button"
        onClick={() => navigate('/models')}
        className="inline-flex w-fit items-center gap-1 text-[13px] transition-colors hover:text-[color:var(--brand-base)]"
        style={{ color: 'var(--mg-text-3)' }}
      >
        <LuChevronLeft size={15} />
        {isZh ? '返回模型广场' : 'Back to models'}
      </button>

      {detailQuery.isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[120px] animate-pulse rounded-md border" style={{ background: 'var(--mg-bg-0)', borderColor: 'var(--mg-border)' }} />
          ))}
        </div>
      ) : detailQuery.isError || !detail ? (
        <div className="rounded-md border p-8 text-center text-[13px]" style={{ borderColor: 'var(--mg-border)', color: 'var(--mg-text-3)' }}>
          {isZh ? '模型不存在或加载失败' : 'Model not found or failed to load'}
        </div>
      ) : (
        <div className="rounded-lg border p-6" style={{ background: 'var(--mg-bg-0)', borderColor: 'var(--mg-border)' }}>
          <ModelDetailPanel detail={detail} providers={providers} />
          <div className="mt-6 flex items-center gap-3 border-t pt-5" style={{ borderColor: 'var(--mg-border)' }}>
            <Button variant="brand" onClick={goTry}>
              {t('modelsCatalog.button.try')}
              <LuChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
