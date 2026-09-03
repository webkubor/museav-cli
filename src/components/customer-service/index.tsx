/**
 * 智能助手悬浮面板（智能客服 PRD v0.1，V1.0.6）。
 *
 * 这个文件只做两件事：**渲染由 `mode` 决定的形态**，以及**把用户操作与服务端事件
 * 翻译成模式转移**。所有业务规则住在别处 —— 模式表在 `machine.ts`，实时链路在
 * `use-support-events.ts`，列表编排在 `use-support-records.ts`，数据来源在 `gateway.ts`。
 *
 * 技术方案 §7.1 的两条硬规则在这里生效：
 *   1. 渲染分支全部从 `MODE_SPEC[mode]` 查表得到，不写「有没有客服名字」这类隐式推断。
 *   2. 模式切换只由用户操作与服务端事件触发；**前端计时器不改形态、更不建工单**
 *      （§6.8：转异步只能由后台事件驱动）。
 *
 * 视觉一律走 token 类与 `ui/*` 组件：旧实现把 20 处 CSS 变量与 4 处裸数值圆角写在内联
 * style 里，被 `scripts/ui-guard.sh` 判为 2 项 BLOCK（内联 style token、内联裸圆角），
 * 本次一并还清 —— 只剩入口的 right/bottom 两个拖拽坐标还留在 style 上（运行时算出来的
 * 位置值，不是设计 token）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuMessageSquareWarning, LuRefreshCw, LuSendHorizontal, LuSquare, LuX } from 'react-icons/lu'

import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { cn } from '@/lib/utils'
import { getRequestErrorMessage } from '@/lib/request-error-message'
import { storageKeys } from '@/lib/storage'
import { useAuthStore } from '@/store/auth'
import { useCustomerServiceStore } from '@/store/use-customer-service-store'
import type {
  SupportAttachment,
  SupportEvent,
  SupportHumanRatingValue,
  SupportTicketDetail,
  SupportTicketSummary,
} from '@/interfaces/support'
import { MODE_SPEC, isHumanFlow, type SupportMode } from './machine'
import { supportGateway } from './gateway'
import { useCsChat, type Message } from './use-cs-chat'
import { supportTrack } from './support-track'
import { useSupportEvents, UNREAD_BADGE_MAX } from './use-support-events'
import { useSupportRecords } from './use-support-records'
import { FeedbackForm, FEEDBACK_FORM_ID } from './FeedbackPanel'
import { ChatPanel } from './panels/ChatPanel'
import { RecordsPanel } from './panels/RecordsPanel'
import { TicketPanel } from './panels/TicketPanel'
import { PanelHeader } from './parts/PanelHeader'
import { SupportMark } from './parts/SupportMark'
import {
  buildFeedbackReceipt,
  buildFeedbackRequest,
  createEmptyFeedbackDraft,
  validateFeedbackDraft,
  type FeedbackDraft,
  type FeedbackErrors,
} from './feedback'

/**
 * 明确的人工意图（PRD §7.6：「转人工」「找客服」「我要人工处理」等直接进入排队，无需二次确认）。
 *
 * ⚠️ 待后端确认并落 API 单：意图识别的真源在服务端（技术方案 §6.2「规则前置短路」），
 * 但 `POST /agent/chat` 的事件信封目前只有 start/delta/done/error，**没有下发意图的字段**，
 * 前端无从知道后端判成了转人工。所以这里做与服务端同源的「规则前置短路」兜底，
 * 只匹配明确表达 —— PRD §3.2 明确「不因用户表达不满而自动转人工」，所以绝不做情绪判断。
 * 后端在 chat 事件里补 `intent` 后，这张表连同 `matchHandoffIntent` 一起删掉。
 */
const HANDOFF_PATTERNS = [
  /^\s*转人工\s*$/,
  /转(接)?人工/,
  /人工客服/,
  /找客服/,
  /我要人工/,
  /人工处理/,
  /\b(talk to|speak to)\s+(a\s+)?(human|agent|person)\b/i,
  /\bhuman (agent|support)\b/i,
]

function matchHandoffIntent(message: string) {
  return HANDOFF_PATTERNS.some((pattern) => pattern.test(message))
}

export function CustomerService() {
  const { t } = useTranslation()
  const isOpen = useCustomerServiceStore((s) => s.isOpen)
  const toggleOpen = useCustomerServiceStore((s) => s.toggle)
  const setOpen = useCustomerServiceStore((s) => s.setOpen)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const [mode, setMode] = useState<SupportMode>('chat')
  const [inputValue, setInputValue] = useState('')

  const chatOptions = useMemo(() => ({ source: 'console', tenantId: activeTenantId }), [activeTenantId])
  const {
    messages,
    appendLocalMessage,
    patchLocalMessage,
    rateMessage,
    sendMessage,
    stopMessage,
    reconnect,
    status,
    isLoading,
    conversationId,
  } = useCsChat(chatOptions)

  /* ── 人工服务流程 ─────────────────────────────────────────────────────── */
  const [handoffTicketId, setHandoffTicketId] = useState<string | null>(null)
  const [queuePosition, setQueuePosition] = useState<number | undefined>(undefined)
  const [handoffBusy, setHandoffBusy] = useState(false)
  /** 已插过卡片的工单，保证「同一次后台状态变更只创建一张卡」（§7.6.1 幂等要求） */
  const cardedTicketsRef = useRef<Set<string>>(new Set())
  const handoffTicketIdRef = useRef<string | null>(null)
  handoffTicketIdRef.current = handoffTicketId
  /** 埋点计时锚点：排队开始与接通时刻（§10.2 support_handoff_connected / _end 的耗时字段） */
  const queueStartedAtRef = useRef<number | null>(null)
  const liveStartedAtRef = useRef<number | null>(null)

  /* ── 服务记录与详情 ───────────────────────────────────────────────────── */
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [ticketDetail, setTicketDetail] = useState<SupportTicketDetail | null>(null)
  const [ticketLoading, setTicketLoading] = useState(false)
  const [ticketError, setTicketError] = useState(false)
  const [ticketSubmitting, setTicketSubmitting] = useState(false)
  const [ticketSubmitError, setTicketSubmitError] = useState(false)
  const [ratingSubmittingId, setRatingSubmittingId] = useState<string | null>(null)

  /* ── 问题反馈 ─────────────────────────────────────────────────────────── */
  const [feedbackDraft, setFeedbackDraft] = useState<FeedbackDraft>(() => createEmptyFeedbackDraft())
  const [feedbackErrors, setFeedbackErrors] = useState<FeedbackErrors>({})
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const [feedbackSubmitError, setFeedbackSubmitError] = useState<string | null>(null)
  /** 幂等键：同一次填写的重试复用同一个，只在进入表单时换新（技术方案 §6.6） */
  const submissionIdRef = useRef<string>('')

  /**
   * `handleEvent` 要用 `mergeTickets`，而后者由下面的 `useSupportEvents` 返回 ——
   * 声明顺序上还轮不到它。用 ref 打破这个环，effect 里同步（ref 不能在渲染期写）。
   */
  const mergeTicketsRef = useRef<((items: SupportTicketSummary[]) => void) | null>(null)

  const appendSystem = useCallback((content: string) => {
    appendLocalMessage({ id: crypto.randomUUID(), role: 'system', content, timestamp: Date.now() })
  }, [appendLocalMessage])

  /* ── 实时事件 ─────────────────────────────────────────────────────────── */

  const handleEvent = useCallback((event: SupportEvent) => {
    const isActiveHandoff = event.ticket_id === handoffTicketIdRef.current

    if (event.type === 'queue.position_changed' && isActiveHandoff) {
      setQueuePosition(event.payload.queue_position)
      return
    }

    if (event.type === 'ticket.status_changed' && event.payload.status === 'processing' && isActiveHandoff) {
      setMode('live')
      liveStartedAtRef.current = Date.now()
      supportTrack.handoffConnected({ queueMs: Date.now() - (queueStartedAtRef.current ?? Date.now()) })
      if (event.payload.message) appendSystem(event.payload.message)
      /**
       * 客服姓名与工号（§4.5：processing 的人工服务顶部要显示它）不在这个事件里 ——
       * 技术方案 §5.3 给 status_changed 的 payload 只有 status / waiting_user / message，
       * 摘要要自己重拉。拉回来并入缓存，`agentLabel` 就从缓存派生出来了。
       */
      void supportGateway.getTicket(event.ticket_id)
        .then((detail) => mergeTicketsRef.current?.([detail]))
        .catch(() => { /* 拉不到就退回兜底文案，不影响会话本身 */ })
      return
    }

    if (event.type === 'message.created' && isActiveHandoff && event.payload.sender_type === 'agent') {
      appendLocalMessage({
        id: `agent-${event.event_id}`,
        role: 'human-agent',
        content: event.payload.message ?? '',
        timestamp: new Date(event.occurred_at).getTime(),
      })
      return
    }

    // §6.8：转异步完全由后台驱动 —— 收到事件才结束人工流程并插卡，前端计时器永不建单
    if (event.type === 'ticket.async_converted') {
      if (cardedTicketsRef.current.has(`async:${event.ticket_id}`)) return
      cardedTicketsRef.current.add(`async:${event.ticket_id}`)
      if (isActiveHandoff) {
        supportTrack.handoffEnd({
          durationMs: Date.now() - (liveStartedAtRef.current ?? queueStartedAtRef.current ?? Date.now()),
          endedBy: 'async_converted',
        })
        setHandoffTicketId(null)
        setQueuePosition(undefined)
        liveStartedAtRef.current = null
        queueStartedAtRef.current = null
        setMode((current) => (isHumanFlow(current) ? 'chat' : current))
      }
      appendLocalMessage({
        id: `async-${event.event_id}`,
        role: 'system',
        content: '',
        timestamp: new Date(event.occurred_at).getTime(),
        card: {
          kind: 'async-ticket',
          data: {
            ticketId: event.ticket_id,
            statusLabel: event.payload.status_label ?? '',
            reason: event.payload.message ?? '',
            expectedContactLabel: event.payload.expected_contact_label,
          },
        },
      })
      return
    }

    if (event.type === 'ticket.cancelled' && isActiveHandoff) {
      supportTrack.handoffEnd({
        durationMs: Date.now() - (queueStartedAtRef.current ?? Date.now()),
        endedBy: 'cancelled',
      })
      setHandoffTicketId(null)
      setQueuePosition(undefined)
      liveStartedAtRef.current = null
      queueStartedAtRef.current = null
      setMode((current) => (isHumanFlow(current) ? 'chat' : current))
      appendSystem(event.payload.message ?? t('common.customerService.handoff.cancelled'))
    }
  }, [appendLocalMessage, appendSystem, t])

  const { tickets, unreadTotal, hasUnread, mergeTickets, markReadLocally } = useSupportEvents({ onEvent: handleEvent })

  useEffect(() => {
    mergeTicketsRef.current = mergeTickets
  }, [mergeTickets])

  /** 客服身份从工单缓存派生，不另存一份 state —— 单一真源，事件与重拉都能更新它 */
  const agentLabel = handoffTicketId ? tickets.get(handoffTicketId)?.assignee_display_name ?? null : null

  const records = useSupportRecords({
    active: mode === 'records',
    onLoaded: mergeTickets,
  })

  /* ── 面板开关 ─────────────────────────────────────────────────────────── */

  // §10.2：展开助手。只在打开这一侧发，收起不发
  useEffect(() => {
    if (isOpen) supportTrack.assistantOpen({ loggedIn: isAuthenticated })
  }, [isOpen, isAuthenticated])

  // §7.2：按 Esc 关闭；关闭只收起面板，不结束当前会话
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, setOpen])

  /* ── 拖拽入口 ─────────────────────────────────────────────────────────── */

  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem(storageKeys.csTriggerPos())
      return saved ? JSON.parse(saved) : { x: 0, y: 0 }
    } catch {
      return { x: 0, y: 0 }
    }
  })
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)
  const isDraggingRef = useRef(false)
  /** 拖拽结束要落盘最新位置：state 在 mouseup 的闭包里是旧值，旧实现存的一直是拖拽前的坐标 */
  const posRef = useRef(pos)
  posRef.current = pos

  function handleMouseDown(event: React.MouseEvent) {
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startPosX: pos.x,
      startPosY: pos.y,
    }
    isDraggingRef.current = false

    function onMouseMove(moveEvent: MouseEvent) {
      const origin = dragRef.current
      if (!origin) return
      const dx = moveEvent.clientX - origin.startX
      const dy = moveEvent.clientY - origin.startY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDraggingRef.current = true
      setPos({ x: origin.startPosX + dx, y: origin.startPosY + dy })
    }
    function onMouseUp() {
      try {
        localStorage.setItem(storageKeys.csTriggerPos(), JSON.stringify(posRef.current))
      } catch { /* 隐私模式下写不进就算了，位置不是关键状态 */ }
      dragRef.current = null
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  /* ── 对话与转人工 ─────────────────────────────────────────────────────── */

  const startHandoff = useCallback(async (trigger: 'intent' | 'button', userMessage?: string) => {
    if (!MODE_SPEC[mode].canStartHandoff || handoffBusy) return
    setHandoffBusy(true)
    queueStartedAtRef.current = Date.now()
    supportTrack.handoffStart({
      trigger,
      assistantTurns: messages.filter((message) => message.role === 'assistant').length,
    })
    if (userMessage) {
      appendLocalMessage({ id: crypto.randomUUID(), role: 'user', content: userMessage, timestamp: Date.now() })
    }
    try {
      const ticket = await supportGateway.startHandoff({
        client_submission_id: crypto.randomUUID(),
        trigger,
        conversation_id: conversationId,
        page_name: document.title,
        page_path: window.location.pathname,
      })
      setHandoffTicketId(ticket.ticket_id)
      setQueuePosition(ticket.queue_position)
      setMode('queueing')
      mergeTickets([ticket])
      appendSystem(t('common.customerService.handoff.queuedNotice', { count: ticket.queue_position ?? 0 }))
    } catch (error) {
      // §8 排队失败：保留当前对话与交接摘要，允许重试 —— 如实报错，不假装排上了
      appendSystem(getRequestErrorMessage(error, t('common.customerService.handoff.startFailed')))
    } finally {
      setHandoffBusy(false)
    }
  }, [appendLocalMessage, appendSystem, conversationId, handoffBusy, mergeTickets, messages, mode, t])

  const ask = useCallback((question: string, entry: 'composer' | 'quick_question' = 'composer') => {
    const text = question.trim()
    if (!text) return
    if (mode === 'live') {
      // 人工服务中用户消息走人工通道，不进 /agent/chat
      void replyInLiveSession(text)
      return
    }
    supportTrack.questionSubmit(text, { entry })
    if (matchHandoffIntent(text)) {
      void startHandoff('intent', text)
      return
    }
    void sendMessage(text)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, sendMessage, startHandoff])

  /** 人工服务中的用户消息：走工单消息接口，本地乐观插入（技术方案 §7.1） */
  const replyInLiveSession = useCallback(async (text: string) => {
    const ticketId = handoffTicketIdRef.current
    if (!ticketId) return
    appendLocalMessage({ id: crypto.randomUUID(), role: 'user', content: text, timestamp: Date.now() })
    try {
      const ticket = await supportGateway.reply(ticketId, {
        client_message_id: crypto.randomUUID(),
        content: text,
      })
      mergeTickets([ticket])
    } catch (error) {
      appendSystem(getRequestErrorMessage(error, t('common.customerService.handoff.sendFailed')))
    }
  }, [appendLocalMessage, appendSystem, mergeTickets, t])

  const cancelHandoff = useCallback(async () => {
    const ticketId = handoffTicketId
    if (!ticketId) return
    setHandoffBusy(true)
    try {
      const ticket = await supportGateway.cancelHandoff(ticketId)
      mergeTickets([ticket])
      // 取消后的收尾由 ticket.cancelled 事件统一做，避免和事件重复插两条提示
    } catch (error) {
      appendSystem(getRequestErrorMessage(error, t('common.customerService.handoff.cancelFailed')))
    } finally {
      setHandoffBusy(false)
    }
  }, [appendSystem, handoffTicketId, mergeTickets, t])

  const endHandoff = useCallback(async () => {
    const ticketId = handoffTicketId
    if (!ticketId) return
    setHandoffBusy(true)
    try {
      const ticket = await supportGateway.endHandoff(ticketId)
      mergeTickets([ticket])
      supportTrack.handoffEnd({
        durationMs: Date.now() - (liveStartedAtRef.current ?? Date.now()),
        endedBy: 'user',
      })
      liveStartedAtRef.current = null
      queueStartedAtRef.current = null
      setHandoffTicketId(null)
      setQueuePosition(undefined)
      setMode('chat')
      appendSystem(t('common.customerService.handoff.ended'))
      // §7.7：每个已结束的人工会话只生成一张评价卡
      if (!cardedTicketsRef.current.has(`rating:${ticketId}`)) {
        cardedTicketsRef.current.add(`rating:${ticketId}`)
        appendLocalMessage({
          id: `rating-${ticketId}`,
          role: 'system',
          content: '',
          timestamp: Date.now(),
          card: {
            kind: 'human-rating',
            ticketId,
            agentLabel: ticket.assignee_display_name ?? agentLabel,
            status: 'pending',
          },
        })
      }
    } catch (error) {
      appendSystem(getRequestErrorMessage(error, t('common.customerService.handoff.endFailed')))
    } finally {
      setHandoffBusy(false)
    }
  }, [agentLabel, appendLocalMessage, appendSystem, handoffTicketId, mergeTickets, t])

  /* ── 五星评价 ─────────────────────────────────────────────────────────── */

  /**
   * 就地改一张评价卡。刻意**不用** useCallback —— 它要读当前的 `messages`，
   * 包起来就会捕获首次渲染的闭包，改到旧数组上（第一版就踩了这个）。
   */
  function patchRatingCard(
    messageId: string,
    patch: Partial<Extract<NonNullable<Message['card']>, { kind: 'human-rating' }>>,
  ) {
    const target = messages.find((message) => message.id === messageId)
    if (!target?.card || target.card.kind !== 'human-rating') return
    patchLocalMessage(messageId, { card: { ...target.card, ...patch } })
  }

  async function submitRating(messageId: string) {
    const target = messages.find((message) => message.id === messageId)
    if (!target?.card || target.card.kind !== 'human-rating' || target.card.rating === undefined) return
    setRatingSubmittingId(messageId)
    try {
      const ticket = await supportGateway.rate(target.card.ticketId, target.card.rating)
      mergeTickets([ticket])
      supportTrack.humanRating({ rating: target.card.rating, skipped: false })
      patchRatingCard(messageId, { status: 'submitted' })
    } catch (error) {
      appendSystem(getRequestErrorMessage(error, t('common.customerService.humanRating.submitFailed')))
    } finally {
      setRatingSubmittingId(null)
    }
  }

  /* ── 服务记录与工单详情 ───────────────────────────────────────────────── */

  const loadTicket = useCallback(async (ticketId: string) => {
    setTicketLoading(true)
    setTicketError(false)
    try {
      const detail = await supportGateway.getTicket(ticketId)
      setTicketDetail(detail)
      mergeTickets([detail])
    } catch {
      setTicketDetail(null)
      setTicketError(true)
    } finally {
      setTicketLoading(false)
    }
  }, [mergeTickets])

  function openRecords() {
    supportTrack.recordsOpen({
      unreadTickets: [...tickets.values()].filter((ticket) => (ticket.unread_count ?? 0) > 0).length,
    })
    setMode('records')
  }

  function openTicket(ticketId: string) {
    const summary = tickets.get(ticketId)
    // 「是否置顶」= 有未读的工单会被服务端排到最前（§6.11），与未读同义
    if (summary) supportTrack.ticketOpen(summary, { pinned: (summary.unread_count ?? 0) > 0 })
    setSelectedTicketId(ticketId)
    setTicketSubmitError(false)
    setMode('ticket')
    void loadTicket(ticketId)
  }

  function back() {
    if (mode === 'ticket') {
      setSelectedTicketId(null)
      setTicketDetail(null)
      setMode('records')
      records.refresh()
      return
    }
    setMode('chat')
  }

  const markTicketRead = useCallback(async (readSeq: number) => {
    const ticketId = selectedTicketId
    if (!ticketId || readSeq <= 0) return
    markReadLocally(ticketId, readSeq)
    try {
      await supportGateway.markRead(ticketId, readSeq)
    } catch {
      // 已读游标推进失败不影响阅读；下一次进入详情会再试
    }
  }, [markReadLocally, selectedTicketId])

  async function uploadIfNeeded(file: File | null) {
    if (!file) return undefined
    const attachment = await supportGateway.uploadAttachment(file)
    return [attachment.id]
  }

  async function replyTicket(content: string, file: File | null) {
    if (!selectedTicketId) return false
    setTicketSubmitting(true)
    setTicketSubmitError(false)
    try {
      const attachmentIds = await uploadIfNeeded(file)
      await supportGateway.reply(selectedTicketId, {
        client_message_id: crypto.randomUUID(),
        content: content.trim(),
        ...(attachmentIds ? { attachment_ids: attachmentIds } : {}),
      })
      await loadTicket(selectedTicketId)
      return true
    } catch {
      setTicketSubmitError(true)
      return false
    } finally {
      setTicketSubmitting(false)
    }
  }

  async function supplementTicket(content: string, file: File | null) {
    if (!selectedTicketId) return false
    setTicketSubmitting(true)
    setTicketSubmitError(false)
    try {
      const attachmentIds = await uploadIfNeeded(file)
      const detail = await supportGateway.supplement(selectedTicketId, {
        client_message_id: crypto.randomUUID(),
        content: content.trim(),
        ...(attachmentIds ? { attachment_ids: attachmentIds } : {}),
      })
      setTicketDetail(detail)
      if (ticketDetail) supportTrack.ticketSupplementSubmit(ticketDetail, { hasAttachment: Boolean(file), ok: true })
      return true
    } catch {
      setTicketSubmitError(true)
      if (ticketDetail) supportTrack.ticketSupplementSubmit(ticketDetail, { hasAttachment: Boolean(file), ok: false })
      return false
    } finally {
      setTicketSubmitting(false)
    }
  }

  async function reopenTicket() {
    if (!selectedTicketId) return
    try {
      const ticket = await supportGateway.reopen(selectedTicketId)
      mergeTickets([ticket])
      await loadTicket(selectedTicketId)
    } catch {
      setTicketSubmitError(true)
    }
  }

  /** 「再次反馈」：带着来源工单进反馈表单（§7.11 / 原型的 followup 语义） */
  function createFollowup() {
    openFeedback()
  }

  async function downloadAttachment(attachment: SupportAttachment) {
    supportTrack.ticketAttachmentDownload({
      ticketType: ticketDetail?.ticket_type ?? 'unknown',
      // 补充里的附件 id 不在表单快照的附件列表里，据此区分来源（§10.2 attachment_source）
      source: (ticketDetail?.feedback?.attachments ?? []).some((item) => item.id === attachment.id)
        ? 'original'
        : 'supplement',
    })
    try {
      const { url } = await supportGateway.attachmentUrl(attachment.id)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = attachment.file_name
      anchor.click()
    } catch {
      appendSystem(t('common.customerService.ticket.downloadFailed'))
    }
  }

  /* ── 问题反馈 ─────────────────────────────────────────────────────────── */

  function openFeedback() {
    setFeedbackDraft(createEmptyFeedbackDraft())
    setFeedbackErrors({})
    setFeedbackSubmitError(null)
    submissionIdRef.current = crypto.randomUUID()
    setMode('feedback')
  }

  /** §7.5：取消直接回原对话，不生成任何消息 */
  function cancelFeedback() {
    setFeedbackErrors({})
    setFeedbackSubmitError(null)
    setMode('chat')
  }

  function changeFeedback(patch: Partial<FeedbackDraft>) {
    setFeedbackDraft((prev) => ({ ...prev, ...patch }))
    setFeedbackErrors((prev) => {
      const next = { ...prev }
      if ('issueType' in patch) delete next.issueType
      if ('description' in patch) delete next.description
      return next
    })
  }

  async function submitFeedback(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (feedbackSubmitting) return
    const errors = validateFeedbackDraft(feedbackDraft)
    setFeedbackErrors(errors)
    if (Object.keys(errors).length > 0) return

    setFeedbackSubmitError(null)
    setFeedbackSubmitting(true)
    try {
      const response = await supportGateway.submitFeedback(buildFeedbackRequest(feedbackDraft, {
        clientSubmissionId: submissionIdRef.current || crypto.randomUUID(),
        pageName: document.title,
        pagePath: window.location.pathname,
        conversationId,
      }))
      mergeTickets([response])
      supportTrack.feedbackSubmit({
        issueType: feedbackDraft.issueType || 'unknown',
        hasRequestId: Boolean(feedbackDraft.requestId.trim()),
        hasAttachment: Boolean(feedbackDraft.attachmentId),
      })
      appendLocalMessage({
        id: crypto.randomUUID(),
        role: 'system',
        content: '',
        timestamp: Date.now(),
        card: { kind: 'feedback-receipt', receipt: buildFeedbackReceipt(response, feedbackDraft) },
      })
      setFeedbackDraft(createEmptyFeedbackDraft())
      // §7.5：提交成功后回执进对话流，并自动回到普通问答模式
      setMode('chat')
    } catch (error) {
      setFeedbackSubmitError(getRequestErrorMessage(error, t('common.customerService.feedback.submitFailed')))
    } finally {
      setFeedbackSubmitting(false)
    }
  }

  /* ── 渲染 ─────────────────────────────────────────────────────────────── */

  const spec = MODE_SPEC[mode]
  const composerDisabled = spec.footer === 'input-disabled'

  function handleSend() {
    const text = inputValue.trim()
    if (!text || isLoading || composerDisabled) return
    ask(text)
    setInputValue('')
  }

  return (
    <>
      {/* 悬浮入口：§7.2 ModelGo 圆形入口 + 在线状态点；§6.11 关闭态显示未读数（99+ 上限） */}
      <div
        className={cn(
          'fixed z-[1000] flex size-13 cursor-grab items-center justify-center rounded-full',
          'border border-mg-border bg-mg-bg-2 shadow-md select-none',
        )}
        onClick={() => { if (!isDraggingRef.current) toggleOpen() }}
        onMouseDown={handleMouseDown}
        style={{ right: 24 - pos.x, bottom: 24 - pos.y }}
      >
        {isOpen ? (
          <>
            <LuX aria-hidden="true" className="text-mg-text-2" size={20} />
            <span className="sr-only">{t('common.customerService.close')}</span>
          </>
        ) : (
          <>
            <SupportMark size={26} status={status} />
            <span className="sr-only">{t('common.customerService.openAria')}</span>
            {/* §7.8：人工服务进行中不显示未读入口 —— 会话就在眼前，再提醒是干扰 */}
            {unreadTotal > 0 && !isHumanFlow(mode) ? (
              <span
                aria-label={t('common.customerService.records.unreadCount', { count: unreadTotal })}
                className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-brand-base px-1 mg-cs-micro font-bold text-white"
                role="status"
              >
                {unreadTotal > UNREAD_BADGE_MAX ? `${UNREAD_BADGE_MAX}+` : unreadTotal}
              </span>
            ) : null}
          </>
        )}
      </div>

      {isOpen ? (
        <aside
          aria-label={t('common.customerService.assistant')}
          className={cn(
            'fixed bottom-22 right-6 z-[999] flex flex-col overflow-hidden rounded-lg',
            // 固定 380×560 是桌面尺寸；窄屏/矮屏按视口收缩，避免裁切与横向溢出（PRD §12 响应式验收）
            'h-140 max-h-[calc(100vh-7rem)] w-95 max-w-[calc(100vw-3rem)]',
            // 浮层必须实底：--mg-bg-0 已并入玻璃（半透明），会把下层内容透出来叠字（需求方 #529/#559）
            'border border-mg-border bg-mg-bg-2 shadow-lg',
          )}
          role="dialog"
        >
          <PanelHeader
            agentLabel={agentLabel}
            busy={handoffBusy}
            connectionStatus={status}
            hasUnread={hasUnread}
            mode={mode}
            onBack={back}
            onCancelConnect={cancelHandoff}
            onCancelQueue={cancelHandoff}
            onEndLive={endHandoff}
            onOpenRecords={openRecords}
            queuePosition={queuePosition}
            ticketId={ticketDetail?.ticket_id}
            ticketStatusLabel={ticketDetail?.status_label}
          />

          {mode === 'records' ? (
            <RecordsPanel
              error={Boolean(records.error)}
              filter={records.filter}
              hasMore={records.hasMore}
              items={records.items}
              loading={records.loading}
              loadingMore={records.loadingMore}
              onFilterChange={records.setFilter}
              onLoadMore={records.loadMore}
              onOpenTicket={openTicket}
              onQueryChange={records.setQuery}
              onRetry={records.retry}
              query={records.query}
              total={records.total}
            />
          ) : mode === 'ticket' ? (
            <TicketPanel
              error={ticketError}
              loading={ticketLoading}
              onBackToList={back}
              onCreateFollowup={createFollowup}
              onDownloadAttachment={downloadAttachment}
              onRead={markTicketRead}
              onReopen={reopenTicket}
              onReply={replyTicket}
              onRetry={() => selectedTicketId && void loadTicket(selectedTicketId)}
              onSupplement={supplementTicket}
              submitError={ticketSubmitError}
              submitting={ticketSubmitting}
              ticket={ticketDetail}
            />
          ) : mode === 'feedback' ? (
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <FeedbackForm
                draft={feedbackDraft}
                errors={feedbackErrors}
                onChange={changeFeedback}
                onSubmit={submitFeedback}
              />
            </div>
          ) : (
            <ChatPanel
              isLoading={isLoading}
              messages={messages}
              onAsk={ask}
              onRate={(id, rating) => {
                supportTrack.answerRating(rating)
                void rateMessage(id, rating)
              }}
              onRatingCardChange={(id, rating: SupportHumanRatingValue) => patchRatingCard(id, { rating })}
              onRatingCardSkip={(id) => {
                supportTrack.humanRating({ skipped: true })
                patchRatingCard(id, { status: 'skipped' })
              }}
              onRatingCardSubmit={(id) => void submitRating(id)}
              ratingSubmittingId={ratingSubmittingId}
            />
          )}

          <PanelFooter
            composerDisabled={composerDisabled}
            feedbackSubmitError={feedbackSubmitError}
            feedbackSubmitting={feedbackSubmitting}
            inputValue={inputValue}
            isLoading={isLoading}
            mode={mode}
            onCancelFeedback={cancelFeedback}
            onInputChange={setInputValue}
            onOpenFeedback={openFeedback}
            onReconnect={reconnect}
            onSend={handleSend}
            onStop={stopMessage}
            status={status}
          />
        </aside>
      ) : null}
    </>
  )
}

/**
 * 底部区域。形态取自 `MODE_SPEC[mode].footer`，PRD §7.1 模式表的「底部区域」列：
 *   chat            问题反馈 + 消息输入
 *   feedback-actions 表单提交/取消，不显示聊天输入
 *   input-disabled  排队中 / 连接中：输入禁用且不显示问题反馈
 *   live-input      人工咨询输入，不显示问题反馈
 *   none            服务记录列表不显示输入
 *   ticket-actions  工单详情的写入口由 TicketPanel 按能力位自己渲染
 */
function PanelFooter(props: {
  mode: SupportMode
  status: 'connecting' | 'online' | 'offline'
  inputValue: string
  isLoading: boolean
  composerDisabled: boolean
  feedbackSubmitting: boolean
  feedbackSubmitError: string | null
  onInputChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  onOpenFeedback: () => void
  onCancelFeedback: () => void
  onReconnect: () => void
}) {
  const { t } = useTranslation()
  const footer = MODE_SPEC[props.mode].footer

  if (footer === 'none' || footer === 'ticket-actions') return null

  if (footer === 'feedback-actions') {
    return (
      <div className="flex flex-col gap-2 border-t border-mg-fill-0 px-4 py-3">
        {props.feedbackSubmitError ? (
          <p className="m-0 mg-cs-meta text-mg-danger" role="alert">{props.feedbackSubmitError}</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button disabled={props.feedbackSubmitting} onClick={props.onCancelFeedback} size="small" variant="ghost">
            {t('common.customerService.feedback.cancel')}
          </Button>
          <Button
            form={FEEDBACK_FORM_ID}
            htmlType="submit"
            loading={props.feedbackSubmitting}
            size="small"
            variant="brand"
          >
            {t('common.customerService.feedback.submit')}
          </Button>
        </div>
      </div>
    )
  }

  const placeholder = props.composerDisabled
    ? t('common.customerService.handoff.composerConnecting')
    : footer === 'live-input'
      ? t('common.customerService.handoff.composerLive')
      : props.isLoading
        ? t('common.customerService.placeholderLoading')
        : t('common.customerService.placeholder')

  const canSend = Boolean(props.inputValue.trim()) && !props.composerDisabled

  return (
    <div className="border-t border-mg-fill-0 px-4 py-3">
      {/* §7.5：普通问答底部只保留「问题反馈」，人工流程期间不显示 */}
      {footer === 'chat' ? (
        <div className="mb-2 flex items-center gap-2">
          <Button
            icon={<LuMessageSquareWarning size={13} />}
            onClick={props.onOpenFeedback}
            size="small"
            variant="ghost"
          >
            {t('common.customerService.feedback.entry')}
          </Button>
          {props.status === 'offline' ? (
            <Button
              aria-label={t('common.customerService.reconnect')}
              icon={<LuRefreshCw size={13} />}
              onClick={props.onReconnect}
              size="small"
              variant="ghost"
            />
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-2 rounded-md border border-mg-border bg-mg-fill-0 px-3 py-2">
        <Textarea
          aria-label={t('common.customerService.inputAria')}
          // Textarea 默认带 --mg-textarea-min-h（给表单多行域用），聊天输入要按 rows=1 起步，
          // 所以覆掉 min-height；容器已经有边框与底色，这里只留文字层
          className="max-h-25 min-h-0 flex-1 resize-none border-none bg-transparent p-0 focus:ring-0 focus-visible:ring-0"
          disabled={props.composerDisabled || props.isLoading}
          onChange={(event) => props.onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              props.onSend()
            }
          }}
          placeholder={placeholder}
          rows={1}
          value={props.inputValue}
        />
        <Button
          aria-label={props.isLoading ? t('common.customerService.stop') : t('common.customerService.send')}
          disabled={!props.isLoading && !canSend}
          icon={props.isLoading ? <LuSquare size={13} /> : <LuSendHorizontal size={14} />}
          onClick={props.isLoading ? props.onStop : props.onSend}
          size="small"
          variant="brand"
        />
      </div>
    </div>
  )
}
