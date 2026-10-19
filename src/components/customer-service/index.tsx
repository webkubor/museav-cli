import { Button } from '@/components/ui/Button'
import { useState, useEffect, useRef, createContext, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

import { MarkdownContent } from '@/components/ui/MarkdownContent'
import { LuX, LuSendHorizontal, LuHistory, LuMessageSquareWarning, LuCheck, LuThumbsUp, LuThumbsDown, LuKeyRound, LuTerminal, LuSparkles, LuReceipt, LuMessageSquarePlus } from 'react-icons/lu'
import { useSiteLogo } from '@/config/brand-assets'
import { storageKeys } from '@/lib/storage'
import { useCustomerServiceStore } from '@/store/use-customer-service-store'
import { formatChartDate, formatDate, formatShortTime } from '@/lib/format-date'
import { trackEvent } from '@/lib/track'
import { useSupport } from './use-support'
import type { ChatItem } from './use-support'
import { HandoffHeaderStatus, RatingCard } from './human-chat'
import { FeedbackForm } from './feedback-form'
import { TicketsList, TicketDetailView } from './tickets'
import { answerStatusPresentation } from './answer-status'
import { extractFinalAnswer } from './final-answer'
import { canStartHandoff, showsMessageThread } from './support-machine'
import { SupportOrb } from './support-orb'
import { supportOrbState } from './support-presentation'
import { useMessageAutoScroll } from './use-message-scroll'
import { useUnreadTotal } from './use-unread-total'
import { useAuthStore } from '@/store/auth'

function formatCsTimestamp(timestamp: number, t: (key: string, options?: Record<string, unknown>) => string) {
  const date = new Date(timestamp)
  const now = new Date()
  const dateIso = date.toISOString()
  const isToday = formatDate(dateIso) === formatDate(now.toISOString())
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday = formatDate(dateIso) === formatDate(yesterday.toISOString())
  const timeStr = formatShortTime(dateIso)
  if (isToday) return t('common.customerService.todayAt', { time: timeStr })
  if (isYesterday) return t('common.customerService.yesterdayAt', { time: timeStr })
  return `${formatChartDate(dateIso)} ${timeStr}`
}

const FAQ_ITEMS = [
  { icon: LuKeyRound, key: 'apiKey' },
  { icon: LuTerminal, key: 'callModel' },
  { icon: LuSparkles, key: 'chooseModel' },
  { icon: LuReceipt, key: 'billing' },
] as const

export function MessageBubble({ msg, onRate }: { msg: ChatItem; onRate: (id: string, rating: 'like' | 'dislike') => void }) {
  const { t } = useTranslation()

  if (msg.kind === 'rating_card') {
    return <RatingCardBridge msg={msg} />
  }

  if (msg.kind === 'async_ticket' && msg.asyncTicket) {
    const a = msg.asyncTicket
    // 照 PRD 原型 CustomerSupportAsyncTicket.tsx：标题「已转为异步问题单」+ 状态徽标，
    // 正文是转异步原因，再 dl 两项（工单编号 / 预计联系），末尾是联系方式说明。
    return (
      <div
        className="mb-4 mg-tile px-3 py-2.5 flex flex-col gap-1.5"
        role="group"
        aria-label={t('common.customerService.asyncTicket.ariaLabel', { id: a.ticketNo })}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="mg-text-caption font-medium text-mg-text-1">
            {t('common.customerService.asyncTicket.title')}
          </span>
          <span className="mg-compact-badge px-2 py-0.5 rounded-full bg-mg-primary-light text-brand-base shrink-0">{a.status}</span>
        </div>
        <p className="m-0 text-[11px] text-mg-text-3">{t('common.customerService.asyncTicket.reason')}</p>
        <dl className="m-0 flex flex-col gap-0.5 text-[11px]">
          <div className="flex gap-1.5">
            <dt className="shrink-0 text-mg-text-3">{t('common.customerService.asyncTicket.idLabel')}</dt>
            <dd className="m-0 min-w-0 truncate font-medium text-mg-text-2" title={a.ticketNo}>{a.ticketNo}</dd>
          </div>
          {a.slaText && (
            <div className="flex gap-1.5">
              <dt className="shrink-0 text-mg-text-3">{t('common.customerService.asyncTicket.etaLabel')}</dt>
              <dd className="m-0 min-w-0 truncate text-mg-text-2" title={a.slaText}>{a.slaText}</dd>
            </div>
          )}
        </dl>
        <p className="m-0 text-[11px] text-mg-text-3">{t('common.customerService.asyncTicket.contact')}</p>
      </div>
    )
  }

  if (msg.kind === 'feedback_receipt' && msg.feedbackReceipt) {
    const r = msg.feedbackReceipt
    return (
      // 字段与标签照 PRD 原型 CustomerSupportFeedback.tsx 的 FeedbackReceiptCard：
      // 标题「反馈已提交」+ 状态徽标，正文是 dl 四项（反馈编号 / 预计响应 / 问题类型 /
      // 问题描述）。原先只渲染了 4 个**裸值、无标签、且漏了问题类型**，用户看到一串
      // 数字不知道哪个是编号。aria-label 也照原型给到「反馈 <编号> 已提交」。
      <div
        className="mb-4 mg-tile px-3 py-2.5 flex flex-col gap-1.5"
        role="group"
        aria-label={t('common.customerService.feedback.receipt.ariaLabel', { id: r.ticketNo })}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="mg-text-caption font-medium text-mg-text-1">
            {t('common.customerService.feedback.receipt.title')}
          </span>
          <span className="mg-compact-badge px-2 py-0.5 rounded-full bg-mg-primary-light text-brand-base shrink-0">{r.status}</span>
        </div>
        <dl className="m-0 flex flex-col gap-0.5 text-[11px]">
          <div className="flex gap-1.5">
            <dt className="shrink-0 text-mg-text-3">{t('common.customerService.feedback.receipt.idLabel')}</dt>
            <dd className="m-0 min-w-0 truncate font-medium text-mg-text-2" title={r.ticketNo}>{r.ticketNo}</dd>
          </div>
          {r.slaText && (
            <div className="flex gap-1.5">
              <dt className="shrink-0 text-mg-text-3">{t('common.customerService.feedback.receipt.etaLabel')}</dt>
              <dd className="m-0 min-w-0 truncate text-mg-text-2" title={r.slaText}>{r.slaText}</dd>
            </div>
          )}
          <div className="flex gap-1.5">
            <dt className="shrink-0 text-mg-text-3">{t('common.customerService.feedback.receipt.issueTypeLabel')}</dt>
            <dd className="m-0 min-w-0 truncate text-mg-text-2">
              {t(`common.customerService.feedback.categoryOptions.${r.category}`, { defaultValue: r.category })}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-mg-text-3">{t('common.customerService.feedback.receipt.summaryLabel')}</dt>
            <dd className="m-0 text-mg-text-2 line-clamp-2" title={r.description}>{r.description}</dd>
          </div>
        </dl>
      </div>
    )
  }

  if (msg.role === 'system') {
    return (
      <div className="mb-3 text-center">
        <span className="mg-text-caption text-mg-text-3">{msg.content}</span>
      </div>
    )
  }

  const isUser = msg.role === 'user'
  const presentation = msg.role === 'assistant'
    ? answerStatusPresentation(msg.answerStatus)
    : { hintKey: null }
  // 显示侧防线（#1124）：助手回答渲染前做结构化 <think> 抽取，标签与推理绝不上屏。
  // 只作用于 assistant —— 用户消息与人工客服消息原样保留（人工客服的正文是真人写的，
  // 不是模型输出，不该被这套模型输出清理规则改写）。语义与后端 ExtractFinalAnswer 一致。
  const renderedContent = msg.role === 'assistant' ? extractFinalAnswer(msg.content) : msg.content

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', marginBottom: 16 }}>
      {/* 气泡的色 / 圆角 / 边框一律走 Tailwind token 类，不在 style 里写 CSS 变量
          （DESIGN.md · ui-guard 硬拦）。rounded-lg 是体系刻度；「尖角朝说话人」
          那一角单独用 rounded-br-sm / rounded-bl-sm 压回小圆角。 */}
      <div
        className={`max-w-[80%] break-words border px-3.5 py-2.5 mg-text-body text-mg-text-1 ${
          isUser
            ? 'whitespace-pre-wrap rounded-lg rounded-br-sm border-mg-fill-1 bg-mg-fill-1'
            : 'rounded-lg rounded-bl-sm border-mg-border bg-mg-fill-0'
        }`}
      >
        {isUser ? msg.content : <MarkdownContent linkifyBareUrls>{renderedContent}</MarkdownContent>}
        {presentation.hintKey && <p className="m-0 mt-1.5 text-[11px] text-mg-text-3">{t(presentation.hintKey)}</p>}
      </div>
      {/* PRD §10：敏感信息命中后要给用户明确提示（内容不进模型/检索/埋点/人工摘要）。
          后端回 sensitive.Hit，此前前端一个字段都没读。 */}
      {msg.sensitiveHit && (
        <p className="m-0 mt-1 px-1 text-[11px] text-mg-warning">
          {t('common.customerService.sensitiveHit')}
        </p>
      )}
      {msg.role === 'assistant' && msg.answerId && (
        <div className="mt-1 flex items-center gap-2 px-1">
          <button
            type="button"
            aria-label={t('common.customerService.like')}
            onClick={() => onRate(msg.id, 'like')}
            className={cn('p-0.5 rounded', msg.rating === 'like' ? 'text-mg-success' : 'text-mg-text-3 hover:text-mg-text-1')}
          >
            <LuThumbsUp size={13} />
          </button>
          <button
            type="button"
            aria-label={t('common.customerService.dislike')}
            onClick={() => onRate(msg.id, 'dislike')}
            className={cn('p-0.5 rounded', msg.rating === 'dislike' ? 'text-mg-danger' : 'text-mg-text-3 hover:text-mg-text-1')}
          >
            <LuThumbsDown size={13} />
          </button>
          {/* PRD §8.4：点击后在控件旁展示勾号和「感谢反馈」。文案 key 早就有，
              一直没渲染 —— 用户点完没有任何反馈，会以为没点上。

              2026-09-16 test 实测补记：上一版 key 写成 `customerService.thanks`，
              而文案实际挂在 `customerService.rating.thanks`（少一层）。i18n 取不到就把
              key 原样吐出来，于是页面上真的显示了一行 "common.customerService.thanks"。
              条件渲染是对的、按钮也确实变绿了，**错的只有这一个字符串** —— 从外面看
              就像「功能没生效」，查半天才发现是文案路径。写 key 对着 locales 的实际
              层级核，别照记忆敲：同组件里 like/dislike 是直挂的，thanks 却多一层 rating。 */}
          {msg.rating && (
            <span className="flex items-center gap-0.5 text-[11px] text-mg-text-3">
              <LuCheck size={12} aria-hidden />
              {t('common.customerService.rating.thanks')}
            </span>
          )}
        </div>
      )}
      <span className="mt-1 px-1 text-[10px] text-mg-text-3">
        {formatCsTimestamp(msg.createdAt, t)}
      </span>
    </div>
  )
}

// 独立包一层避免 RatingCard 内部 useState 随父级消息数组整体重渲染丢失选中态
function RatingCardBridge({ msg }: { msg: ChatItem }) {
  const support = useSupportContext()
  return (
    <RatingCard
      item={msg}
      onSubmit={(stars) => support.rateEndedHandoff(msg, stars)}
      onSkip={() => support.rateEndedHandoff(msg, undefined, true)}
    />
  )
}

// 简易上下文：把 useSupport 的评价收尾方法透传给消息流里的 RatingCard，避免逐层传参
const SupportCtx = createContext<{ rateEndedHandoff: (msg: ChatItem, stars?: number, skip?: boolean) => void } | null>(null)
function useSupportContext() {
  const ctx = useContext(SupportCtx)
  if (!ctx) throw new Error('SupportCtx missing')
  return ctx
}

export function CustomerService() {
  const { t } = useTranslation()
  const isOpen = useCustomerServiceStore((s) => s.isOpen)
  const toggleOpen = useCustomerServiceStore((s) => s.toggle)
  const setOpen = useCustomerServiceStore((s) => s.setOpen)
  const logoSrc = useSiteLogo()

  const support = useSupport()
  const {
    mode, go, messages, isAsking, ticketDetail, ticketDetailError, ticketMessages, ticketMessagesLoaded, markSelectedTicketSeen, replySelectedTicket, unreadVersion,
    // 三区行为由状态机推导，组件不再自己拼布尔组合（原先是 mode/serviceMode 交叉判断）
    showComposer, composerDisabled, showFeedbackEntry, isHumanChat,
    ask, rateMessageAnswer, cancelActiveHandoff, isCancellingHandoff, endActiveHandoff, rateEndedHandoff,
    sendHumanReply, feedbackSubmitting, submitFeedback, startNewSession, startingNewSession, handoffInFlight, openTicketDetail, reopenSelectedTicket, rateSelectedTicket, supplementSelectedTicket,
  } = support

  const orbState = supportOrbState(support)
  const accountId = useAuthStore((s) => s.account?.account_id ?? null)
  const unreadTotal = useUnreadTotal(accountId, isOpen, unreadVersion)

  const [inputValue, setInputValue] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const [pos, setPos] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKeys.csTriggerPos())
      return saved ? JSON.parse(saved) : { x: 0, y: 0 }
    } catch { return { x: 0, y: 0 } }
  })
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)
  const isDragging = useRef(false)

  useMessageAutoScroll(scrollRef, messages, isAsking, mode)

  useEffect(() => {
    if (!isOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, setOpen])

  useEffect(() => {
    if (isOpen) trackEvent('support_assistant_open')
  }, [isOpen])

  // ⚠️ 这里原先是 `if (!activeTenantId) return null`（未登录不渲染），与 prd#996 冲突：
  // PRD §11.6 要求「官网、登录页和 Console 右下角共用 ModelGo 圆形入口」，原型
  // modelgo_prd/src/App.tsx 也在 `shell === "login"` 分支里挂了 widget。
  // 未登录同样要能问平台知识；账户类问题由后端回 needs_login，不靠前端藏入口来拦。
  // 私有上下文的隔离靠「登出/换号清会话」那条（见 use-support），不靠这个门槛。

  function handleMouseDown(e: React.MouseEvent) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: pos.x, startPosY: pos.y }
    isDragging.current = false

    function onMouseMove(ev: MouseEvent) {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDragging.current = true
      setPos({ x: dragRef.current.startPosX + dx, y: dragRef.current.startPosY + dy })
    }
    function onMouseUp() {
      try { localStorage.setItem(storageKeys.csTriggerPos(), JSON.stringify(pos)) } catch { /* ignore */ }
      dragRef.current = null
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  function handleTriggerClick() {
    if (isDragging.current) return
    toggleOpen()
  }

  /**
   * 键盘可达：外层是 role="button" + tabIndex=0，必须能用 Enter / Space 触发
   * （WCAG 4.1.2）。此前只有 onClick —— 键盘用户能 Tab 聚焦到悬浮球，
   * 但按 Enter / Space 毫无反应，等于客服入口对纯键盘用户不可达。
   * Space 要 preventDefault，否则会顺带滚动页面。
   */
  function handleTriggerKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    handleTriggerClick()
  }


  function handleSend() {
    if (!inputValue.trim() || isAsking || composerDisabled) return
    if (isHumanChat) sendHumanReply(inputValue)
    else ask(inputValue)
    setInputValue('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleFaqClick(key: string) {
    ask(t(`common.customerService.faq.${key}`))
  }


  return (
    <SupportCtx.Provider value={{
      rateEndedHandoff: (msg, stars, skip) => {
        if (msg.ratingCard?.ticketId) void rateEndedHandoff(msg.ratingCard.ticketId, stars, skip)
      },
    }}>
      {/* Floating trigger button */}
      <div
        onMouseDown={handleMouseDown}
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
        role="button"
        tabIndex={0}
        aria-label={isOpen ? t('common.customerService.close') : t('common.customerService.assistant')}
        style={{
          position: 'fixed',
          right: 24 - pos.x,
          bottom: 24 - pos.y,
          zIndex: 1000,
        }}
        className="mg-float flex h-[52px] w-[52px] cursor-grab select-none items-center justify-center rounded-full border border-mg-border bg-mg-bg-2"
      >
        {/* 常显 ai-orb 状态球：按真实流程变表情（在想 / 在干活 / 等你补充 / 好了 / 出错）。
            展开面板时也要继续表态——对话中的「思考中/待补充」正是状态球存在的意义，
            切成 X 就把状态全遮掉了。关闭入口只留面板头部那一个 X，悬浮球不再兼任
            关闭图标（此前展开时头尾两个 X 同屏，多余且难看）。
            球只读状态、不驱动状态机（见 support-presentation.ts）。 */}
        <SupportOrb size={48} state={orbState} label={t('common.customerService.orb.open')} />
        {/* 未读角标自己画：ai-orb 自带的角标只在 done 态显示，而入口平时是 idle，
            传 unseen 永远出不来（#1148）。面板开着时不显示 —— 服务记录图标另有提示。 */}
        {!isOpen && unreadTotal > 0 && (
          <span
            role="status"
            aria-label={t('common.customerService.unreadBadge', { count: unreadTotal })}
            className="pointer-events-none absolute -right-1 -top-1 min-w-[18px] rounded-full bg-mg-danger px-1 text-center text-[10px] font-medium leading-[18px] text-white"
          >
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </span>
        )}
      </div>

      {/* 面板：表面走 .mg-float（同 Popover / Dialog 一档玻璃）+ 体系圆角 rounded-lg；
          style 只留定位与响应式尺寸这类算出来的几何量（DESIGN.md · ui-guard 硬拦） */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            right: 24,
            bottom: 88,
            width: 'min(380px, calc(100vw - 32px))',
            height: 'min(560px, calc(100vh - 140px))',
            zIndex: 999,
          }}
          className="mg-float flex flex-col overflow-hidden rounded-lg border border-mg-border bg-mg-bg-2"
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-mg-fill-0 bg-mg-bg-1 px-5 py-4">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 }}>
              <img src={logoSrc} alt="" style={{ width: 28, height: 28, objectFit: 'contain', marginTop: 2 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="m-0 text-[13px] font-bold text-mg-text-1">{t('common.customerService.assistant')}</p>
                {/* 顶部第二行：人工线进行中显示状态+操作，其余模式显示「在线」 */}
                {mode.kind === 'queuing' || mode.kind === 'connecting' || mode.kind === 'human' ? (
                  <HandoffHeaderStatus mode={mode} onCancel={cancelActiveHandoff} isCanceling={isCancellingHandoff} onEnd={() => endActiveHandoff()} />
                ) : (
                  <p className="m-0 text-[11px] text-mg-text-2">{t('common.customerService.online')}</p>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {(mode.kind === 'chat' || mode.kind === 'empty' || mode.kind === 'humanEnded') && (
                <button
                  type="button"
                  aria-label={t('common.customerService.records.open')}
                  onClick={() => go({ kind: 'tickets' })}
                  className="text-mg-text-2 hover:text-mg-text-1 p-1"
                >
                  <LuHistory size={16} />
                </button>
              )}
              <button
                type="button"
                aria-label={t('common.customerService.close')}
                onClick={() => setOpen(false)}
                className="text-mg-text-2 hover:text-mg-text-1 p-1"
              >
                <LuX size={16} />
              </button>
            </div>
          </div>

          {/* Body */}
          {mode.kind === 'tickets' && <TicketsList onSelect={openTicketDetail} onClose={() => go({ kind: 'chat' })} />}
          {mode.kind === 'ticketDetail' && (
            <TicketDetailView
              detail={ticketDetail}
              error={ticketDetailError}
              messages={ticketMessages}
              messagesLoaded={ticketMessagesLoaded}
              renderMessage={(msg) => <MessageBubble msg={msg} onRate={rateMessageAnswer} />}
              onLatestVisible={markSelectedTicketSeen}
              onReply={replySelectedTicket}
              onRetry={() => openTicketDetail(mode.ticketId)}
              onBack={() => go({ kind: 'tickets' })}
              onReopen={reopenSelectedTicket}
              onRate={rateSelectedTicket}
              onSupplement={supplementSelectedTicket}
            />
          )}
          {mode.kind === 'feedback' && (
            <FeedbackForm submitting={feedbackSubmitting} onCancel={() => go({ kind: 'chat' })} onSubmit={submitFeedback} />
          )}
          {showsMessageThread(mode) && (
            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {messages.length === 0 && (mode.kind === 'empty' || mode.kind === 'chat') && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col items-center gap-2 py-4">
                    <img src={logoSrc} alt="" style={{ width: 40, height: 40, opacity: 0.25 }} />
                    <p className="text-center text-xs text-mg-text-3">{t('common.customerService.empty')}</p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {FAQ_ITEMS.map(({ icon: Icon, key }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleFaqClick(key)}
                        className="mg-tile flex items-center gap-2.5 px-3 py-2.5 text-left hover:border-brand-mid/50 transition-colors min-h-[44px]"
                      >
                        <Icon size={15} className="text-brand-base shrink-0" />
                        <span className="mg-text-caption text-mg-text-1 flex-1">{t(`common.customerService.faq.${key}`)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} onRate={rateMessageAnswer} />)}
              {isAsking && (
                <div className="flex items-center gap-1 px-1 mb-4">
                  <span className="mg-text-caption text-mg-text-3 italic">{t('common.customerService.thinking')}</span>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          {showComposer && (
            <div className="flex flex-col gap-2 px-4 py-3 border-t border-mg-fill-0">
              {/* 服务条（PRD 原型 customer-support-service-bar）：问题反馈 · 新会话。
                  「人工客服」按钮已按 modelgo_prd#1388 隐藏：转人工成本过低，改为只能在对话里
                  表达，由后端判定——没说具体问题先引导描述，第一次先由 AI 作答，再次要求才转人工。
                  canStartHandoff(mode) 与原型 humanSupportStatus === 'idle' 同义
                  （排队中/接通中不允许重复发起）。 */}
              {(showFeedbackEntry || canStartHandoff(mode)) && (
                <div className="flex items-center gap-2">
                  {showFeedbackEntry && (
                    <button
                      type="button"
                      onClick={() => go({ kind: 'feedback' })}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-mg-border bg-mg-fill-0/40 px-2.5 py-1.5 mg-text-caption font-medium text-mg-text-2 transition-colors hover:border-brand-mid/50 hover:text-brand-base"
                    >
                      <LuMessageSquareWarning size={13} />
                      {t('common.customerService.feedback.entry')}
                    </button>
                  )}
                  {/* 新会话：丢掉当前问答上下文从头开始（qa#751）。没有对话时点了没意义，不显示 */}
                  {canStartHandoff(mode) && messages.length > 0 && (
                    <button
                      type="button"
                      onClick={startNewSession}
                      disabled={startingNewSession || handoffInFlight}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-mg-border bg-mg-fill-0/40 px-2.5 py-1.5 mg-text-caption font-medium text-mg-text-2 transition-colors hover:border-brand-mid/50 hover:text-brand-base disabled:opacity-50"
                    >
                      <LuMessageSquarePlus size={13} />
                      {t('common.customerService.newSession')}
                    </button>
                  )}
                </div>
              )}
              <div className="mg-tile flex items-center gap-2 px-3 py-2">
                <textarea
                  rows={1}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={composerDisabled}
                  placeholder={
                    composerDisabled
                      ? t('common.customerService.placeholderLoading')
                      : isHumanChat
                        ? t('common.customerService.handoff.humanPlaceholder')
                        : t('common.customerService.placeholder')
                  }
                  className="flex-1 border-none outline-none bg-transparent resize-none mg-text-body text-mg-text-1 max-h-[100px] overflow-y-auto p-0 m-0"
                  style={{ fontFamily: 'inherit' }}
                />
                <Button
                  size="small"
                  variant="brand"
                  onClick={handleSend}
                  disabled={composerDisabled || !inputValue.trim()}
                  loading={isAsking}
                  icon={<LuSendHorizontal size={14} />}
                  aria-label={t('common.customerService.send')}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </SupportCtx.Provider>
  )
}
