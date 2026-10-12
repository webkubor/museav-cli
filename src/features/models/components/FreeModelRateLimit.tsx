import { useState } from 'react'
import { LuInfo, LuX } from 'react-icons/lu'
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
 * ## 展示条件：没配限流规则就整块不展示（prd46#1215，2026-10-09 需求方拍板）
 *
 * ⚠️ **这一条推翻了 2026-09-02 的相反决策，别再翻回去。** 当时的写法是「规则缺失时
 * 降级为不含数值的提示，而不是整块不展示」，理由是：限流由后端强制执行，用户看不到
 * 任何提示就会毫无预警被拦，「没提示比提示得不够精确更糟」。
 *
 * 需求方 2026-10-09 的新口径是反过来的，逻辑也站得住：**后端没配限流规则，就不会
 * 执行限流**，这时候显示「有限流约束」本身就是错误信息，比不显示更糟。
 *
 * 改动前实测（生产国际站 `GET /catalog/models`，X-Market: international）：
 * 73 个模型里免费模型只有 1 个 `minimax-m3:free`，它的 `rate_limit` 正是 `null`。
 * 所以**这次改完，国际站这条提示会完全消失**——不是「部分模型不显示」。这是预期结果，
 * 不是没生效。国内目录有 rate_limit 的模型不受影响，照常展示。
 *
 * 判定依据是目录接口的 `rate_limit` 对象（Swagger `catalog.ModelRateLimit`：
 * `request_limit` / `token_limit` / `window_seconds`），对象本身为空即视为未配置。
 *
 * 分寸不变：**不编造数值**。规则对象在、但数值不全时，仍走不含数值的提示
 * （`rateLimit.unknown`）——那种情况说明规则是配了的，约束真实存在。
 */
export function FreeModelRateLimit({ model, className = '' }: { model: RateLimitModel; className?: string }) {
  const { t } = useTranslation()
  // 用户点 × 关闭后本次停留内不再显示；切换模型或刷新页面后重新出现。
  const [dismissed, setDismissed] = useState(false)
  const rateLimit = model.rate_limit
  const requestLimit = rateLimit?.request_limit
  const tokenLimit = rateLimit?.token_limit
  const windowSeconds = rateLimit?.window_seconds
  // 目录接口的限时免费模型由 promotion.free 标记；兼容 catalog.free 的直接标记。
  const isFree = Boolean(model.free || model.promotion?.free)

  // 压根不是免费模型 → 不渲染
  if (!isFree) return null
  // 免费模型但后端没下发限流规则 → 不渲染（见上方「展示条件」）
  if (!rateLimit) return null
  if (dismissed) return null

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
      className={`flex items-start gap-1.5 rounded-md border border-mg-info/20 bg-mg-info/5 px-3 py-2 mg-text-caption leading-5 text-mg-text-2 ${className}`}
    >
      <LuInfo size={14} className="mt-0.5 shrink-0 text-mg-info" />
      <span>
        <strong className="font-semibold text-mg-info">{t('modelsExperience.freeQuota')}</strong>
        {/* 分隔符跟着语言走：中文全角「；」、英文半角「; 」。硬编码全角分号会让
            英文文案变成 "rate limits apply；Once a limit..." */}
        {' '}{limits}{t('modelsExperience.rateLimit.separator')}{waitText}
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label={t('modelsExperience.dismissQuota')}
        className="-mr-1 -mt-0.5 shrink-0 rounded-sm p-0.5 text-mg-text-3 transition-colors hover:text-mg-text-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mg-info/40"
      >
        <LuX size={14} aria-hidden="true" />
      </button>
    </p>
  )
}
