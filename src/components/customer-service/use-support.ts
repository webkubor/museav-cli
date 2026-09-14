import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/auth'
import { appToast } from '@/lib/app-toast'
import { trackEvent } from '@/lib/track'
import { storageKeys } from '@/lib/storage'
import {
  askSupport,
  cancelHandoff,
  endHandoff,
  getSupportTicket,
  listTicketMessages,
  rateAnswer,
  rateTicket,
  replyTicketMessage,
  reopenTicket,
  requestHandoff,
  submitSupportFeedback,
} from '@/services/support'
import { useSupportEvents } from './use-support-events'
import {
  canStartHandoff,
  composerDisabled as composerDisabledOf,
  isHumanChannel,
  modeFromServiceMode,
  needsEvents,
  serviceModeOf,
  showsComposer,
  showsFeedbackEntry,
  ticketIdOf,
  transition,
  type SupportMode,
} from './support-machine'
import { EPHEMERAL_ANSWER_ID } from '@/interfaces/support'
import type {
  SupportAnswerRating,
  SupportAnswerStatus,
  SupportAskResponse,
  SupportFeedbackRequest,
  SupportTicketDetail,
} from '@/interfaces/support'

export type PanelMode = 'chat' | 'feedback' | 'tickets' | 'ticket-detail'

export interface ChatItem {
  id: string
  role: 'user' | 'assistant' | 'agent' | 'system'
  content: string
  createdAt: number
  answerId?: string
  answerStatus?: SupportAnswerStatus
  rating?: SupportAnswerRating | null
  kind?: 'feedback_receipt' | 'rating_card' | 'async_ticket'
  feedbackReceipt?: { ticketNo: string; status: string; slaText?: string; category: string; description: string }
  ratingCard?: { ticketId: string; agentName?: string; agentNo?: string; submittedStars?: number; skipped?: boolean }
  /** 转异步后的问题单回执（PRD 原型 CustomerSupportAsyncTicket.tsx 的 AsyncSupportTicketCard） */
  asyncTicket?: { ticketNo: string; status: string; slaText?: string }
}

/** 取后端实测的回答 id；匿名占位不算，评分控件据此隐藏。 */
function pickAnswerId(resp: SupportAskResponse): string | undefined {
  const id = resp.message_id ?? resp.answer_id
  return !id || id === EPHEMERAL_ANSWER_ID ? undefined : id
}

const HANDOFF_TRIGGER_RE = /转\s*人工|找\s*客服|人工\s*处理|human\s*(agent|support)/i

export function useSupport() {
  const { t } = useTranslation()
  const account = useAuthStore((s) => s.account)

  // 🔴 模式是**单一真源**：原先 mode(4) × serviceMode(6) = 24 种组合、PRD 只承认 9 种，
  // 且 ticketId / queuePosition / agentInfo 散在外面，切模式要手动清 4~5 个变量
  // —— 漏一个就残留（见 support-machine.ts 顶部记的两个真实 bug）。
  // 现在这些数据随模式携带，切模式即失效，漏不掉。
  const [mode, setModeRaw] = useState<SupportMode>({ kind: 'chat' })
  const [messages, setMessages] = useState<ChatItem[]>([])
  const [isAsking, setIsAsking] = useState(false)
  const [ticketDetail, setTicketDetail] = useState<SupportTicketDetail | null>(null)

  /** 唯一的模式迁移入口：非法跳转被 transition() 拦下，不静默生效。 */
  const go = useCallback((next: SupportMode) => {
    setModeRaw((cur) => transition(cur, next))
  }, [])

  /** 当前模式关联的工单号（取代原来那个全局 ticketId）。 */
  const ticketId = ticketIdOf(mode)

  const lastAccountId = useRef<string | null>(null)

  // 一次性清除迁移期废弃的 localStorage（旧 SSE hook 用过），新实现不再落盘会话
  useEffect(() => {
    try {
      localStorage.removeItem(storageKeys.csHistory())
      localStorage.removeItem(storageKeys.csConversationId())
    } catch { /* ignore */ }
  }, [])

  // 退出登录/切账号：清空私有会话上下文
  useEffect(() => {
    const currentId = account?.account_id ?? null
    if (lastAccountId.current !== null && lastAccountId.current !== currentId) {
      // 回到 chat 即丢弃全部模式内数据（ticketId / 排队人数 / 客服信息），
      // 不用再逐个清 —— 这正是原先漏清 agentInfo 的地方
      setMessages([])
      setModeRaw({ kind: 'chat' })
      setTicketDetail(null)
    }
    lastAccountId.current = currentId
  }, [account?.account_id])

  const appendMessage = useCallback((item: ChatItem) => {
    setMessages((prev) => [...prev, item])
  }, [])

  const startHandoff = useCallback(async () => {
    // 「排队中不允许重复发起转接」由状态机判定（PRD §8.6），不再自己比 serviceMode
    if (!canStartHandoff(mode)) return
    // 未登录直接引导登录：转人工是登录态能力，发出去只会拿到 40101，
    // 再被 catch 成「转人工失败，请稍后重试」——用户会一直重试，而重试
    // 永远失败。同理这里也不能让 40101 走到 request.ts 的全局分支，
    // 那条是给「会话过期」用的，对从未登录的人提示「会话已过期」是错的。
    if (!account) {
      appendMessage({
        id: crypto.randomUUID(),
        role: 'system',
        content: t('common.customerService.loginRequired.handoff'),
        createdAt: Date.now(),
      })
      return
    }
    trackEvent('support_handoff_request')
    try {
      const resp = await requestHandoff({ page_path: currentPagePath() })
      go(modeFromServiceMode(resp.service_mode, resp.ticket_id, {
        ahead: resp.queue_position,
        agentName: resp.agent_name,
        agentNo: resp.agent_no,
      }))
    } catch (error) {
      appToast.requestError(error, t('common.customerService.handoffFailed'))
      go({ kind: 'chat' })
      appendMessage({ id: crypto.randomUUID(), role: 'system', content: t('common.customerService.handoffFailed'), createdAt: Date.now() })
    }
  }, [mode, go, appendMessage, t, account])

  const ask = useCallback(async (question: string) => {
    const trimmed = question.trim()
    if (!trimmed || isAsking) return

    if (HANDOFF_TRIGGER_RE.test(trimmed) && canStartHandoff(mode)) {
      appendMessage({ id: crypto.randomUUID(), role: 'user', content: trimmed, createdAt: Date.now() })
      await startHandoff()
      return
    }

    appendMessage({ id: crypto.randomUUID(), role: 'user', content: trimmed, createdAt: Date.now() })
    setIsAsking(true)
    trackEvent('support_question_submit')
    try {
      const resp = await askSupport({ message: trimmed, page_path: currentPagePath() })
      appendMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: resp.answer,
        createdAt: Date.now(),
        // 后端实测返回 message_id（不是 PRD 写的 answer_id）；匿名态是
        // ans_ephemeral 占位，没落库、评分接口用不了，故不给评分控件。
        answerId: pickAnswerId(resp),
        answerStatus: resp.answer_status,
        rating: null,
      })
    } catch (error) {
      appToast.requestError(error, t('common.customerService.sendFailed'))
      appendMessage({
        id: crypto.randomUUID(),
        role: 'system',
        content: t('common.customerService.sendFailed'),
        createdAt: Date.now(),
      })
    } finally {
      setIsAsking(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAsking, mode, appendMessage, t])

  const rateMessageAnswer = useCallback(async (messageId: string, rating: SupportAnswerRating) => {
    const target = messages.find((m) => m.id === messageId)
    if (!target?.answerId) return
    const next = target.rating === rating ? null : rating
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, rating: next } : m)))
    if (next) {
      trackEvent('support_answer_rating', { rating: next })
      try {
        await rateAnswer(target.answerId, next)
      } catch (error) {
        appToast.requestError(error)
      }
    }
  }, [messages])

  const cancelActiveHandoff = useCallback(async () => {
    if (!ticketId) return
    const isConnecting = mode.kind === 'connecting'
    try {
      await cancelHandoff(ticketId)
      trackEvent('support_handoff_cancel')
    } catch (error) {
      appToast.requestError(error)
    }
    appendMessage({
      id: crypto.randomUUID(),
      role: 'system',
      content: isConnecting ? t('common.customerService.handoffConnectCancelled') : t('common.customerService.handoffQueueCancelled'),
      createdAt: Date.now(),
    })
    // 回 chat 一步到位：ticketId / 排队人数 / 客服信息随模式一起丢弃。
    // 旧实现这里漏清 agentInfo，导致取消排队后评价卡会带上一位客服的姓名/工号。
    go({ kind: 'chat' })
  }, [ticketId, mode, go, appendMessage, t])

  const endActiveHandoff = useCallback(async (rating?: number, skip?: boolean) => {
    if (!ticketId) return
    try {
      await endHandoff(ticketId, { rating, skip })
      trackEvent('support_handoff_end')
      if (rating) trackEvent('support_human_rating', { rating })
      else if (skip) trackEvent('support_human_rating', { skipped: true })
    } catch (error) {
      appToast.requestError(error)
    }
    setMessages((prev) => prev.map((m) => (m.kind === 'rating_card' ? { ...m, ratingCard: { ...m.ratingCard!, submittedStars: rating, skipped: skip } } : m)))
    go({ kind: 'chat' })
  }, [ticketId, go])

  const sendHumanReply = useCallback(async (content: string) => {
    const trimmed = content.trim()
    if (!trimmed || !ticketId) return
    appendMessage({ id: crypto.randomUUID(), role: 'user', content: trimmed, createdAt: Date.now() })
    try {
      await replyTicketMessage(ticketId, trimmed)
    } catch (error) {
      appToast.requestError(error, t('common.customerService.sendFailed'))
    }
  }, [ticketId, appendMessage, t])

  // 长轮询：开关也由模式推导（PRD 只在人工线进行中需要）
  const eventsEnabled = needsEvents(mode)
  useSupportEvents(eventsEnabled, ticketId ?? undefined, useCallback((event) => {
    // 排队人数变化：同模式内换数据（状态机允许 from === to）
    if (event.queue_position !== undefined && mode.kind === 'queuing') {
      go({ ...mode, ahead: event.queue_position })
    }
    if (event.service_mode && event.service_mode !== serviceModeOf(mode)) {
      const prevKind = mode.kind
      go(modeFromServiceMode(event.service_mode, ticketId!, {
        ahead: event.queue_position,
        agentName: mode.kind === 'human' ? mode.agentName : undefined,
        agentNo: mode.kind === 'human' ? mode.agentNo : undefined,
      }))
      if (event.service_mode === 'connected' && prevKind !== 'human') {
        getSupportTicket(ticketId!).then((detail) => {
          // 客服信息随 human 模式携带，不再是游离变量
          setModeRaw((cur) => (cur.kind === 'human'
            ? { ...cur, agentName: detail.agent_name, agentNo: detail.agent_no }
            : cur))
        }).catch(() => {})
        appendMessage({ id: crypto.randomUUID(), role: 'system', content: t('common.customerService.handoffConnected'), createdAt: Date.now() })
      }
      if (event.service_mode === 'ended') {
        appendMessage({ id: crypto.randomUUID(), role: 'system', content: t('common.customerService.handoffEnded'), createdAt: Date.now() })
        appendMessage({
          id: crypto.randomUUID(),
          role: 'system',
          content: '',
          createdAt: Date.now(),
          kind: 'rating_card',
          ratingCard: {
            ticketId: ticketId!,
            // 只有 human 模式才有客服信息 —— 取不到就不带，绝不会带上一次的
            agentName: mode.kind === 'human' ? mode.agentName : undefined,
            agentNo: mode.kind === 'human' ? mode.agentNo : undefined,
          },
        })
      }
      if (event.service_mode === 'async') {
        // 转异步后走异步回执、不再占用面板主态（PRD §8.6）。
        // 模式已由 modeFromServiceMode('async') 映射回 chat，排队人数/客服信息随之丢弃
        // —— 旧实现这里漏清 queuePosition，顶部还会显示「前方 N 人」。
        appendMessage({ id: crypto.randomUUID(), role: 'system', content: t('common.customerService.handoffAsync'), createdAt: Date.now() })
        // 🔴 再出一张**带工单编号的回执卡**（PRD 原型 AsyncSupportTicketCard）：
        // AC 第 3 条要的是「出现异步问题单回执（CS-）」，只发一句纯文本系统消息
        // 用户拿不到编号、后续无从追踪。events 接口不带 ticket_no，从详情拉。
        const asyncTicketId = ticketId
        if (asyncTicketId) {
          getSupportTicket(asyncTicketId).then((detail) => {
            appendMessage({
              id: crypto.randomUUID(),
              role: 'system',
              content: '',
              createdAt: Date.now(),
              kind: 'async_ticket',
              asyncTicket: { ticketNo: detail.ticket_no, status: detail.status, slaText: detail.sla_text },
            })
          }).catch(() => { /* 拉不到就只留上面那条文本，不阻断 */ })
        }
      }
    }
    if (event.has_new_messages && ticketId && mode.kind === 'human') {
      listTicketMessages(ticketId).then((page) => {
        setMessages((prev) => {
          const known = new Set(prev.map((m) => m.id))
          const fresh = page.items.filter((m) => !known.has(m.id) && m.role === 'agent')
          return [...prev, ...fresh.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: new Date(m.created_at).getTime() }))]
        })
      }).catch(() => {})
    }
  }, [mode, go, ticketId, appendMessage, t]))

  // ---- 反馈 ----
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)

  const submitFeedback = useCallback(async (fields: Omit<SupportFeedbackRequest, 'client_submission_id' | 'page_path'>) => {
    setFeedbackSubmitting(true)
    try {
      const resp = await submitSupportFeedback({
        ...fields,
        client_submission_id: crypto.randomUUID(),
        page_path: currentPagePath(),
      })
      trackEvent('support_feedback_submit', { category: fields.category })
      appendMessage({
        id: crypto.randomUUID(),
        role: 'system',
        content: '',
        createdAt: Date.now(),
        kind: 'feedback_receipt',
        feedbackReceipt: {
          ticketNo: resp.ticket_no,
          status: resp.status,
          slaText: resp.sla_text,
          category: fields.category,
          description: fields.description,
        },
      })
      go({ kind: 'chat' })
      return true
    } catch (error) {
      appToast.requestError(error, t('common.customerService.feedbackFailed'))
      return false
    } finally {
      setFeedbackSubmitting(false)
    }
  }, [appendMessage, go, t])

  // ---- 服务记录 ----
  const openTicketDetail = useCallback(async (id: string) => {
    // 工单号随 ticketDetail 模式携带 —— 原先那个游离的 selectedTicketId 一旦
    // 模式切走就成了悬空引用（reopen/rate 还会拿它去打接口）
    go({ kind: 'ticketDetail', ticketId: id })
    setTicketDetail(null)
    try {
      const detail = await getSupportTicket(id)
      setTicketDetail(detail)
    } catch (error) {
      appToast.requestError(error)
    }
  }, [go])

  const reopenSelectedTicket = useCallback(async () => {
    // 只在详情模式下有效：切走了就不该再对那张工单做写操作
    if (mode.kind !== 'ticketDetail') return
    const selectedTicketId = mode.ticketId
    try {
      const detail = await reopenTicket(selectedTicketId)
      setTicketDetail(detail)
      appToast.success(t('common.customerService.reopenSuccess'))
    } catch (error) {
      appToast.requestError(error)
    }
  }, [mode, t])

  const rateSelectedTicket = useCallback(async (stars: number) => {
    if (mode.kind !== 'ticketDetail') return
    try {
      await rateTicket(mode.ticketId, stars)
      setTicketDetail((prev) => (prev ? { ...prev, rating: stars } : prev))
    } catch (error) {
      appToast.requestError(error)
    }
  }, [mode])

  return {
    /** 唯一的模式真源（discriminated union，见 support-machine.ts） */
    mode,
    /** 模式迁移唯一入口 —— 非法跳转会被拦下，组件别直接 setState */
    go,
    messages,
    isAsking,
    ticketId,
    ticketDetail,
    // 三区行为：由模式单向推导，组件不再自己拼布尔组合
    showComposer: showsComposer(mode),
    composerDisabled: composerDisabledOf(mode),
    showFeedbackEntry: showsFeedbackEntry(mode),
    isHumanChat: isHumanChannel(mode),
    serviceMode: serviceModeOf(mode),
    ask,
    rateMessageAnswer,
    startHandoff,
    cancelActiveHandoff,
    endActiveHandoff,
    sendHumanReply,
    feedbackSubmitting,
    submitFeedback,
    openTicketDetail,
    reopenSelectedTicket,
    rateSelectedTicket,
  }
}

function currentPagePath() {
  if (typeof window === 'undefined') return undefined
  return `${window.location.pathname}${window.location.search}`
}
