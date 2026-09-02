import { LuInfo } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
import type { CatalogModelItem } from '@/types'

type RateLimitModel = Pick<CatalogModelItem, 'free' | 'promotion' | 'rate_limit'>

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
 * 免费模型限频提示（shared/modelgo_prd#914）。免费标记和全部数值均由目录接口提供。
 *
 * **规则缺失时降级为不含数值的提示，而不是整块不展示。**
 * 早先的做法是拿不到 rate_limit 就 `return null`，只防住了「展示错误数值」这一半
 * 风险；另一半更严重——限流是后端强制执行的，用户看不到任何提示就会毫无预警被拦。
 * 2026-09-02 实测：国内目录有 rate_limit、海外全是 null，导致该特性在海外站发布后
 * 页面上一个字都没有。没提示比提示得不够精确更糟。
 *
 * 分寸：**不编造数值**（缺什么就不说什么），但**保留提示以说明约束存在**。
 */
export function FreeModelRateLimit({ model, className = '' }: { model: RateLimitModel; className?: string }) {
  const { t } = useTranslation()
  const rateLimit = model.rate_limit
  const requestLimit = rateLimit?.request_limit
  const tokenLimit = rateLimit?.token_limit
  const windowSeconds = rateLimit?.window_seconds
  // 目录接口的限时免费模型由 promotion.free 标记；兼容 catalog.free 的直接标记。
  const isFree = Boolean(model.free || model.promotion?.free)

  // 只有「压根不是免费模型」才整块不渲染
  if (!isFree) return null

  const hasFullRule = validLimit(windowSeconds) && (validLimit(requestLimit) || validLimit(tokenLimit))
  const limits = hasFullRule
    ? t(
        `modelsExperience.rateLimit.${
          validLimit(requestLimit) && validLimit(tokenLimit)
            ? 'both'
            : validLimit(requestLimit)
              ? 'requests'
              : 'tokens'
        }`,
        {
          window: windowLabel(windowSeconds, t),
          requests: requestLimit?.toLocaleString(),
          tokens: tokenLimit?.toLocaleString(),
        },
      )
    : t('modelsExperience.rateLimit.unknown')
  const waitText = hasFullRule
    ? t('modelsExperience.rateLimit.wait')
    : t('modelsExperience.rateLimit.waitUnknown')

  return (
    <p
      role="status"
      className={`flex items-start gap-1.5 rounded-md border border-mg-warning/20 bg-mg-warning/5 px-3 py-2 mg-text-caption leading-5 text-mg-text-2 ${className}`}
    >
      <LuInfo size={14} className="mt-0.5 shrink-0 text-mg-warning" />
      <span>
        <strong className="font-semibold text-mg-warning">{t('modelsExperience.freeQuota')}</strong>
        {' '}{limits}；{waitText}
      </span>
    </p>
  )
}
