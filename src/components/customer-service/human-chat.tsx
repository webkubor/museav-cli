import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { SupportServiceMode } from '@/interfaces/support'
import type { ChatItem } from './use-support'

export interface HandoffHeaderStatusProps {
  serviceMode: SupportServiceMode | 'idle'
  queuePosition?: number
  agentInfo: { name?: string; no?: string } | null
  onCancel: () => void
  onEnd: () => void
}

/** 顶部第二行的人工服务状态 + 右上角操作（排队/连接中/已接入），aria-live 播报状态变化 */
export function HandoffHeaderStatus({ serviceMode, queuePosition, agentInfo, onCancel, onEnd }: HandoffHeaderStatusProps) {
  const { t } = useTranslation()
  if (serviceMode === 'idle' || serviceMode === 'ended') return null

  const label = serviceMode === 'queueing'
    ? t('common.customerService.handoff.queueing', { position: queuePosition ?? '-' })
    : serviceMode === 'connecting'
      ? t('common.customerService.handoff.connecting')
      : t('common.customerService.handoff.connected', { name: agentInfo?.name ?? '', no: agentInfo?.no ?? '' })

  return (
    <div className="flex items-center justify-between mt-0.5" aria-live="polite">
      <p className="m-0 text-[11px] text-mg-text-2">{label}</p>
      {serviceMode === 'connected' ? (
        <button type="button" onClick={onEnd} className="text-[11px] text-mg-text-3 hover:text-mg-text-1 underline underline-offset-2">
          {t('common.customerService.handoff.endService')}
        </button>
      ) : (
        <button type="button" onClick={onCancel} className="text-[11px] text-mg-text-3 hover:text-mg-text-1 underline underline-offset-2">
          {serviceMode === 'connecting' ? t('common.customerService.handoff.cancelConnecting') : t('common.customerService.handoff.cancelQueue')}
        </button>
      )}
    </div>
  )
}

export interface RatingCardProps {
  item: ChatItem
  onSubmit: (stars: number) => void
  onSkip: () => void
}

/** 人工服务结束后的紧凑五星评价卡片；提交/跳过后收起为确认态 */
export function RatingCard({ item, onSubmit, onSkip }: RatingCardProps) {
  const { t } = useTranslation()
  const [hover, setHover] = useState(0)
  const [selected, setSelected] = useState(0)
  const card = item.ratingCard

  if (card?.submittedStars) {
    return (
      <div className="mb-4 mg-tile px-3 py-2 mg-text-caption text-mg-text-2">
        ✓ {t('common.customerService.handoff.ratingSubmitted', { stars: card.submittedStars })}
      </div>
    )
  }
  if (card?.skipped) {
    return (
      <div className="mb-4 mg-tile px-3 py-2 mg-text-caption text-mg-text-3">
        {t('common.customerService.handoff.ratingSkipped')}
      </div>
    )
  }

  return (
    <div className="mb-4 mg-tile px-3 py-3 flex flex-col gap-2">
      <p className="m-0 mg-text-caption font-medium text-mg-text-1">{t('common.customerService.handoff.rateService')}</p>
      {(card?.agentName || card?.agentNo) && (
        <p className="m-0 text-[11px] text-mg-text-3">{card.agentName} · {card.agentNo}</p>
      )}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            aria-label={t('common.customerService.handoff.starAria', { star })}
            onClick={() => setSelected(star)}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            className={cn('text-lg leading-none', (hover || selected) >= star ? 'text-mg-warning' : 'text-mg-text-4')}
          >
            ★
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-2 mt-1">
        <button type="button" onClick={onSkip} className="mg-text-caption text-mg-text-3 hover:text-mg-text-1">
          {t('common.customerService.handoff.skipRating')}
        </button>
        <Button size="small" variant="brand" disabled={selected === 0} onClick={() => onSubmit(selected)}>
          {t('common.customerService.handoff.submitRating')}
        </Button>
      </div>
    </div>
  )
}
