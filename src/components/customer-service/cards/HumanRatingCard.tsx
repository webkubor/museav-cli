/**
 * 人工服务五星评价卡（PRD §7.7）。
 *
 * 生命周期只有三态，且**不可回头**（§6.10：一次性提交，不支持修改与重复提交）：
 *   pending   → 选星、提交或跳过；未选星级时提交按钮禁用
 *   submitted → 收起为带勾号的「已提交 N 星评价，感谢反馈」
 *   skipped   → 收起为「本次暂未评价」
 *
 * 谁不生成这张卡：取消排队、连接失败、转异步（§6.10）。判断在调用方，
 * 这个组件只负责渲染已经决定要展示的那一张。
 */

import { LuCircleCheck, LuStar } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { SupportHumanRatingValue } from '@/interfaces/support'

export type HumanRatingStatus = 'pending' | 'submitted' | 'skipped'

const STARS: SupportHumanRatingValue[] = [1, 2, 3, 4, 5]

export function HumanRatingCard({
  agentLabel,
  rating,
  status,
  submitting,
  onChange,
  onSubmit,
  onSkip,
}: {
  /** 客服姓名与工号，如「小沐 · MG-0726」，取服务端 assignee_display_name */
  agentLabel: string | null
  rating?: SupportHumanRatingValue
  status: HumanRatingStatus
  submitting?: boolean
  onChange: (value: SupportHumanRatingValue) => void
  onSubmit: () => void
  onSkip: () => void
}) {
  const { t } = useTranslation()

  if (status === 'submitted') {
    return (
      <article
        aria-label={t('common.customerService.humanRating.submittedAria')}
        className="mg-tile mb-4 flex items-center gap-1.5 px-4 py-2.5 mg-text-caption text-mg-text-2"
      >
        <LuCircleCheck aria-hidden="true" className="text-mg-success" size={14} />
        <span role="status">{t('common.customerService.humanRating.submitted', { rating })}</span>
      </article>
    )
  }

  if (status === 'skipped') {
    return (
      <article className="mg-tile mb-4 px-4 py-2.5 mg-text-caption text-mg-text-2">
        {t('common.customerService.humanRating.skipped')}
      </article>
    )
  }

  return (
    <article aria-label={t('common.customerService.humanRating.title')} className="mg-tile mb-4 p-4">
      <header className="flex flex-col gap-0.5">
        <strong className="mg-text-body font-semibold text-mg-text-1">
          {t('common.customerService.humanRating.title')}
        </strong>
        {agentLabel ? <span className="mg-text-meta text-mg-text-2">{agentLabel}</span> : null}
      </header>

      <div aria-label={t('common.customerService.humanRating.starsAria')} className="mt-3 flex items-center gap-1" role="radiogroup">
        {STARS.map((value) => {
          const filled = rating !== undefined && value <= rating
          return (
            <button
              aria-checked={rating === value}
              aria-label={t('common.customerService.humanRating.star', { count: value })}
              className={cn(
                'inline-flex size-7 items-center justify-center rounded-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-glow',
                filled ? 'text-mg-warning' : 'text-mg-text-3 hover:text-mg-text-2',
              )}
              key={value}
              onClick={() => onChange(value)}
              role="radio"
              type="button"
            >
              <LuStar aria-hidden="true" fill={filled ? 'currentColor' : 'none'} size={17} />
            </button>
          )
        })}
      </div>

      <footer className="mt-3 flex justify-end gap-2">
        <Button disabled={submitting} onClick={onSkip} size="small" variant="ghost">
          {t('common.customerService.humanRating.skip')}
        </Button>
        <Button
          disabled={rating === undefined}
          loading={submitting}
          onClick={onSubmit}
          size="small"
          variant="brand"
        >
          {t('common.customerService.humanRating.submit')}
        </Button>
      </footer>
    </article>
  )
}
