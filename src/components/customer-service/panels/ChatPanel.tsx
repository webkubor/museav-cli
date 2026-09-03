/**
 * 对话区：初始空态 + 智能问答消息流（PRD §7.3 / §7.4）。
 *
 * 两处容易做错、这里刻意按 PRD 落的地方：
 *   · 常见问题点击后**以用户消息写入对话再走正式问答链路**（§7.3 原话：不使用只存在
 *     于前端的固定答案作为生产逻辑）—— 所以 `onAsk` 就是 `sendMessage`，没有本地答案表。
 *   · 点赞点踩**只挂智能回答**（§7.4）：用户、系统、人工客服、反馈回执与客服评价都不挂。
 *
 * 滚动行为按技术方案 §7.1「三处容易漏的细节」第一条：新增消息或状态变化滚到最新，
 * 但用户手动上滚看历史时不强制拉回底部。
 */

import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { LuArrowRight, LuChartColumn, LuCode, LuKeyRound, LuSearch } from 'react-icons/lu'
import type { IconType } from 'react-icons'
import { MarkdownContent } from '@/components/ui/MarkdownContent'
import { cn } from '@/lib/utils'
import { formatChartDate, formatDate, formatShortTime } from '@/lib/format-date'
import { AsyncTicketCard } from '../cards/AsyncTicketCard'
import { HumanRatingCard } from '../cards/HumanRatingCard'
import { FeedbackReceiptCard } from '../FeedbackPanel'
import { MessageRating } from '../parts/MessageRating'
import { SupportMark } from '../parts/SupportMark'
import type { Message } from '../use-cs-chat'
import type { SupportAnswerRatingValue, SupportHumanRatingValue } from '@/interfaces/support'

/** §7.3 的四个常见问题。文案走 i18n，图标与标题、进入箭头保持同一视觉层级 */
const QUICK_QUESTIONS: Array<{ key: string; icon: IconType }> = [
  { key: 'createApiKey', icon: LuKeyRound },
  { key: 'callModelApi', icon: LuCode },
  { key: 'chooseModel', icon: LuSearch },
  { key: 'usageAndBilling', icon: LuChartColumn },
]

export interface ChatPanelProps {
  messages: Message[]
  isLoading: boolean
  /** 常见问题与输入框共用同一条链路，entry 只用于埋点区分入口 */
  onAsk: (question: string, entry?: 'composer' | 'quick_question') => void
  onRate: (messageId: string, rating: SupportAnswerRatingValue | undefined) => void
  onRatingCardChange: (messageId: string, rating: SupportHumanRatingValue) => void
  onRatingCardSubmit: (messageId: string) => void
  onRatingCardSkip: (messageId: string) => void
  ratingSubmittingId?: string | null
}

export function ChatPanel(props: ChatPanelProps) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  /** 用户是否手动上滚了。上滚状态下不抢滚动条（技术方案 §7.1） */
  const pinnedToBottomRef = useRef(true)

  useEffect(() => {
    const node = scrollRef.current
    if (!node || !pinnedToBottomRef.current) return
    node.scrollTop = node.scrollHeight
  }, [props.messages, props.isLoading])

  function handleScroll() {
    const node = scrollRef.current
    if (!node) return
    const distanceToBottom = node.scrollHeight - node.scrollTop - node.clientHeight
    pinnedToBottomRef.current = distanceToBottom < 40
  }

  return (
    <div
      aria-live="polite"
      className="flex-1 overflow-y-auto px-5 py-4"
      onScroll={handleScroll}
      ref={scrollRef}
    >
      {props.messages.length === 0 ? (
        <div className="flex h-full flex-col justify-center gap-5">
          <div className="flex flex-col items-center gap-2.5">
            <SupportMark size={40} />
            <p className="m-0 text-center mg-text-body text-mg-text-1">
              {t('common.customerService.empty')}
            </p>
          </div>
          <div>
            <p className="m-0 mb-2 text-[11px] font-bold tracking-wide text-mg-text-2">
              {t('common.customerService.quickQuestionsTitle')}
            </p>
            <div className="flex flex-col gap-1.5" aria-label={t('common.customerService.quickQuestionsTitle')}>
              {QUICK_QUESTIONS.map(({ key, icon: Icon }) => {
                const label = t(`common.customerService.quickQuestions.${key}`)
                return (
                  <button
                    className={cn(
                      'mg-tile mg-tile-hover flex w-full items-center gap-2.5 px-3 py-2.5 text-left',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-glow',
                    )}
                    key={key}
                    onClick={() => props.onAsk(label, 'quick_question')}
                    type="button"
                  >
                    <Icon aria-hidden="true" className="shrink-0 text-mg-text-2" size={15} />
                    <span className="min-w-0 flex-1 truncate mg-text-body text-mg-text-1">{label}</span>
                    <LuArrowRight aria-hidden="true" className="shrink-0 text-mg-text-3" size={13} />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        <>
          {props.messages.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              onRate={props.onRate}
              onRatingCardChange={props.onRatingCardChange}
              onRatingCardSkip={props.onRatingCardSkip}
              onRatingCardSubmit={props.onRatingCardSubmit}
              ratingSubmitting={props.ratingSubmittingId === message.id}
            />
          ))}
          {props.isLoading ? <ThinkingDots /> : null}
        </>
      )}
    </div>
  )
}

function MessageRow({
  message,
  onRate,
  onRatingCardChange,
  onRatingCardSubmit,
  onRatingCardSkip,
  ratingSubmitting,
}: {
  message: Message
  onRate: ChatPanelProps['onRate']
  onRatingCardChange: ChatPanelProps['onRatingCardChange']
  onRatingCardSubmit: ChatPanelProps['onRatingCardSubmit']
  onRatingCardSkip: ChatPanelProps['onRatingCardSkip']
  ratingSubmitting: boolean
}) {
  const { t } = useTranslation()

  if (message.card) {
    const card = message.card
    if (card.kind === 'feedback-receipt') return <FeedbackReceiptCard receipt={card.receipt} />
    if (card.kind === 'async-ticket') return <AsyncTicketCard data={card.data} />
    return (
      <HumanRatingCard
        agentLabel={card.agentLabel}
        onChange={(value) => onRatingCardChange(message.id, value)}
        onSkip={() => onRatingCardSkip(message.id)}
        onSubmit={() => onRatingCardSubmit(message.id)}
        rating={card.rating}
        status={card.status}
        submitting={ratingSubmitting}
      />
    )
  }

  // 系统消息（排队提示、连接中、取消、人工结束）走居中细体，不用气泡
  if (message.role === 'system') {
    return (
      <p className="mx-auto mb-4 max-w-[86%] text-center text-[11px] leading-relaxed text-mg-text-2" role="status">
        {message.content}
      </p>
    )
  }

  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'

  return (
    <div className={cn('mb-4 flex flex-col', isUser ? 'items-end' : 'items-start')}>
      <div className={cn('flex max-w-[86%] gap-2', isUser ? 'flex-row-reverse' : 'flex-row')}>
        {isAssistant ? <SupportMark className="mt-0.5" size={20} /> : null}
        {message.role === 'human-agent' ? (
          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-base/10 text-[10px] font-bold text-brand-base"
          >
            {t('common.customerService.handoff.agentInitial')}
          </span>
        ) : null}
        <div className="min-w-0">
          <div
            className={cn(
              'rounded-md px-3 py-2.5 mg-text-body leading-relaxed break-words',
              isUser
                ? 'whitespace-pre-wrap border border-mg-fill-1 bg-mg-fill-1 text-mg-text-1'
                : 'border border-mg-border bg-mg-fill-0 text-mg-text-1',
              message.isError && 'opacity-70',
            )}
          >
            {message.content
              ? (isUser ? message.content : <MarkdownContent>{message.content}</MarkdownContent>)
              : <span className="italic text-mg-text-3">{t('common.customerService.thinking')}</span>}
          </div>
          {/* §7.4：只有智能回答挂点赞点踩，且回答生成完才出现 */}
          {isAssistant && message.content && !message.isError ? (
            <MessageRating onChange={(next) => onRate(message.id, next)} rating={message.rating} />
          ) : null}
        </div>
      </div>
      <span className={cn('mt-1 px-1 text-[10px] text-mg-text-3')}>
        {formatTimestamp(message.timestamp, t)}
      </span>
    </div>
  )
}

function ThinkingDots() {
  return (
    <div className="mb-4 flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map((index) => (
        <span
          className="mg-cs-dot size-1.5 rounded-full bg-mg-fill-2"
          key={index}
          style={{ animationDelay: `${index * 0.2}s` }}
        />
      ))}
    </div>
  )
}

function formatTimestamp(timestamp: number, t: (key: string, options?: Record<string, unknown>) => string) {
  const date = new Date(timestamp)
  const now = new Date()
  const iso = date.toISOString()
  const time = formatShortTime(iso)
  if (formatDate(iso) === formatDate(now.toISOString())) {
    return t('common.customerService.todayAt', { time })
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (formatDate(iso) === formatDate(yesterday.toISOString())) {
    return t('common.customerService.yesterdayAt', { time })
  }
  return `${formatChartDate(iso)} ${time}`
}
