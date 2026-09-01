import { LuInfo } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
import type { CatalogModelItem } from '@/types'

type RateLimitModel = Pick<CatalogModelItem, 'free' | 'rate_limit'>

function validLimit(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function windowLabel(windowSeconds: number, t: (key: string, options?: Record<string, unknown>) => string) {
  if (windowSeconds === 60) return t('modelsExperience.rateLimit.windowMinute')
  if (windowSeconds === 3600) return t('modelsExperience.rateLimit.windowHour')
  if (windowSeconds === 86_400) return t('modelsExperience.rateLimit.windowDay')
  return t('modelsExperience.rateLimit.windowSeconds', { count: windowSeconds })
}

/**
 * 免费模型限频提示（shared/modelgo_prd#914）。免费标记和全部数值均由目录接口提供；
 * 规则缺失或不完整时宁可不展示，避免把模型的普通定价/促销误报成免费额度。
 */
export function FreeModelRateLimit({ model, className = '' }: { model: RateLimitModel; className?: string }) {
  const { t } = useTranslation()
  const rateLimit = model.rate_limit
  const requestLimit = rateLimit?.request_limit
  const tokenLimit = rateLimit?.token_limit
  const windowSeconds = rateLimit?.window_seconds

  if (!model.free || !validLimit(windowSeconds) || (!validLimit(requestLimit) && !validLimit(tokenLimit))) {
    return null
  }

  const limitsKey = validLimit(requestLimit) && validLimit(tokenLimit)
    ? 'both'
    : validLimit(requestLimit)
      ? 'requests'
      : 'tokens'
  const limits = t(`modelsExperience.rateLimit.${limitsKey}`, {
    window: windowLabel(windowSeconds, t),
    requests: requestLimit?.toLocaleString(),
    tokens: tokenLimit?.toLocaleString(),
  })

  return (
    <p
      role="status"
      className={`flex items-start gap-1.5 rounded-md border border-mg-warning/20 bg-mg-warning/5 px-3 py-2 mg-text-caption leading-5 text-mg-text-2 ${className}`}
    >
      <LuInfo size={14} className="mt-0.5 shrink-0 text-mg-warning" />
      <span>
        <strong className="font-semibold text-mg-warning">{t('modelsExperience.freeQuota')}</strong>
        {' '}{limits}；{t('modelsExperience.rateLimit.wait')}
      </span>
    </p>
  )
}
