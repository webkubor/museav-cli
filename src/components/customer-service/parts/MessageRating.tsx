/**
 * 智能回答的点赞点踩（PRD §7.4）。
 *
 * 四条规则直接来自 PRD，别在调用方再抄一遍：
 *   · 点赞与点踩互斥，本次会话内可以改判（再点同一个即取消）。
 *   · 点击后在控件旁展示勾号与「感谢反馈」，短暂停留后自动收起。
 *   · 只有**智能回答**挂这个控件 —— 用户、系统、人工客服、反馈回执与客服评价都不挂
 *     （由调用方决定挂不挂，这个组件不判断）。
 *   · 评价上行到 `POST /agent/messages/{id}/rating`；接口未上线时回滚本地选择并静默，
 *     不给用户弹错 —— 评价不是用户的目标动作，失败弹窗只会打断对话。
 */

import { useEffect, useRef, useState } from 'react'
import { LuCircleCheck, LuThumbsDown, LuThumbsUp } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { SupportAnswerRatingValue } from '@/interfaces/support'

const ACK_DURATION_MS = 1600

export function MessageRating({
  rating,
  onChange,
}: {
  rating?: SupportAnswerRatingValue
  onChange: (next: SupportAnswerRatingValue | undefined) => void
}) {
  const { t } = useTranslation()
  const [acknowledged, setAcknowledged] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  }, [])

  function choose(next: SupportAnswerRatingValue) {
    onChange(rating === next ? undefined : next)
    setAcknowledged(true)
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setAcknowledged(false), ACK_DURATION_MS)
  }

  return (
    <div className="mt-1.5 flex items-center gap-1">
      <RatingButton
        active={rating === 'up'}
        icon={<LuThumbsUp size={13} />}
        label={t('common.customerService.rating.up')}
        onClick={() => choose('up')}
      />
      <RatingButton
        active={rating === 'down'}
        icon={<LuThumbsDown size={13} />}
        label={t('common.customerService.rating.down')}
        onClick={() => choose('down')}
      />
      <span aria-live="polite" className="inline-flex items-center gap-1 mg-text-meta text-mg-text-2" role="status">
        {acknowledged ? (
          <>
            <LuCircleCheck aria-hidden="true" size={12} />
            {t('common.customerService.rating.thanks')}
          </>
        ) : null}
      </span>
    </div>
  )
}

function RatingButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'inline-flex size-6 items-center justify-center rounded-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-glow',
        active ? 'bg-brand-base/10 text-brand-base' : 'text-mg-text-3 hover:bg-mg-fill-0 hover:text-mg-text-1',
      )}
      onClick={onClick}
      type="button"
    >
      {icon}
    </button>
  )
}
