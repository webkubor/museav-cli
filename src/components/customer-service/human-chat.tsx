import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { SupportMode } from './support-machine'
import type { ChatItem } from './use-support'

export interface HandoffHeaderStatusProps {
  /** 直接收模式：排队人数/客服信息都随模式携带，不再是三个可能互相矛盾的游离参数 */
  mode: SupportMode
  onCancel: () => void
  onEnd: () => void
}

/** 顶部第二行的人工服务状态 + 右上角操作（排队/连接中/已接入），aria-live 播报状态变化 */
export function HandoffHeaderStatus({ mode, onCancel, onEnd }: HandoffHeaderStatusProps) {
  const { t } = useTranslation()
  // 只有人工线进行中才显示这一行
  if (mode.kind !== 'queuing' && mode.kind !== 'connecting' && mode.kind !== 'human') return null

  // 每个分支只能读到该模式**确实拥有**的字段 —— 排队时读不到 agentName，
  // 接通后读不到 ahead，编译期就杜绝了「拿上一个模式的残留值渲染」
  // 排队文案优先用后端整句 status_label（「排队中 · 前方 0 人」）：后端不下发
  // queue_position 数字，前端自己拼只会拼出「前方 - 人」（2026-09-14 test 实测）。
  const label = mode.kind === 'queuing'
    ? (mode.statusLabel
       ?? (mode.ahead !== undefined
           ? t('common.customerService.handoff.queueing', { position: mode.ahead })
           : t('common.customerService.handoff.connecting')))
    : mode.kind === 'connecting'
      ? t('common.customerService.handoff.connecting')
      : t('common.customerService.handoff.connected', { name: mode.agentName ?? '', no: mode.agentNo ?? '' })

  return (
    <div className="flex items-center justify-between mt-0.5" aria-live="polite">
      <p className="m-0 text-[11px] text-mg-text-2">{label}</p>
      {mode.kind === 'human' ? (
        <button type="button" onClick={onEnd} className="text-[11px] text-mg-text-3 hover:text-mg-text-1 underline underline-offset-2">
          {t('common.customerService.handoff.endService')}
        </button>
      ) : (
        <button type="button" onClick={onCancel} className="text-[11px] text-mg-text-3 hover:text-mg-text-1 underline underline-offset-2">
          {mode.kind === 'connecting' ? t('common.customerService.handoff.cancelConnecting') : t('common.customerService.handoff.cancelQueue')}
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

  // 三种状态的 aria-label 照 PRD 原型 CustomerSupportHumanRating.tsx：
  // 「客服评价已提交」/「客服评价已跳过」/「客服评价」，星级组是 radiogroup
  if (card?.submittedStars) {
    return (
      <div
        className="mb-4 mg-tile px-3 py-2 mg-text-caption text-mg-text-2"
        role="status"
        aria-label={t('common.customerService.handoff.ratingSubmittedAria')}
      >
        ✓ {t('common.customerService.handoff.ratingSubmitted', { stars: card.submittedStars })}
      </div>
    )
  }
  if (card?.skipped) {
    return (
      <div
        className="mb-4 mg-tile px-3 py-2 mg-text-caption text-mg-text-3"
        role="status"
        aria-label={t('common.customerService.handoff.ratingSkippedAria')}
      >
        {t('common.customerService.handoff.ratingSkipped')}
      </div>
    )
  }

  return (
    <div
      className="mb-4 mg-tile px-3 py-3 flex flex-col gap-2"
      role="group"
      aria-label={t('common.customerService.handoff.ratingAria')}
    >
      <p className="m-0 mg-text-caption font-medium text-mg-text-1">{t('common.customerService.handoff.rateService')}</p>
      {(card?.agentName || card?.agentNo) && (
        <p className="m-0 text-[11px] text-mg-text-3">{card.agentName} · {card.agentNo}</p>
      )}
      {/* 星级是单选组：原型用 role=radiogroup + 每颗星 aria-label「N 星」，
          读屏用户才知道当前选了几星、总共几档 */}
      <div className="flex items-center gap-1" role="radiogroup" aria-label={t('common.customerService.handoff.starsAria')}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={selected === star}
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
