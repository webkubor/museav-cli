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
import type {
  SupportAnswerRating,
  SupportAnswerStatus,
  SupportFeedbackRequest,
  SupportServiceMode,
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
  kind?: 'feedback_receipt' | 'rating_card'
  feedbackReceipt?: { ticketNo: string; status: string; slaText?: string; category: string; description: string }
  ratingCard?: { ticketId: string; agentName?: string; agentNo?: string; submittedStars?: number; skipped?: boolean }
}

const HANDOFF_TRIGGER_RE = /转\s*人工|找\s*客服|人工\s*处理|human\s*(agent|support)/i

export function useSupport() {
  const { t } = useTranslation()
  const account = useAuthStore((s) => s.account)

  const [mode, setMode] = useState<PanelMode>('chat')
  const [serviceMode, setServiceMode] = useState<SupportServiceMode | 'idle'>('idle')
  const [messages, setMessages] = useState<ChatItem[]>([])
  const [isAsking, setIsAsking] = useState(false)
  const [ticketId, setTicketId] = useState<string | null>(null)
  const [queuePosition, setQueuePosition] = useState<number | undefined>(undefined)
  const [agentInfo, setAgentInfo] = useState<{ name?: string; no?: string } | null>(null)
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [ticketDetail, setTicketDetail] = useState<SupportTicketDetail | null>(null)

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
      setMessages([])
      setMode('chat')
      setServiceMode('idle')
      setTicketId(null)
      setQueuePosition(undefined)
      setAgentInfo(null)
      setSelectedTicketId(null)
      setTicketDetail(null)
    }
    lastAccountId.current = currentId
  }, [account?.account_id])

  const appendMessage = useCallback((item: ChatItem) => {
    setMessages((prev) => [...prev, item])
  }, [])

  const startHandoff = useCallback(async () => {
    if (serviceMode !== 'idle') return
    setServiceMode('queueing')
    trackEvent('handoff_request')
    try {
      const resp = await requestHandoff({ page_path: currentPagePath() })
      setTicketId(resp.ticket_id)
      setServiceMode(resp.service_mode)
      setQueuePosition(resp.queue_position)
      if (resp.agent_name) setAgentInfo({ name: resp.agent_name, no: resp.agent_no })
    } catch (error) {
      appToast.requestError(error, t('common.customerService.handoffFailed'))
      setServiceMode('idle')
      appendMessage({ id: crypto.randomUUID(), role: 'system', content: t('common.customerService.handoffFailed'), createdAt: Date.now() })
    }
  }, [serviceMode, appendMessage, t])

  const ask = useCallback(async (question: string) => {
    const trimmed = question.trim()
    if (!trimmed || isAsking) return

    if (HANDOFF_TRIGGER_RE.test(trimmed) && serviceMode === 'idle') {
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
        answerId: resp.answer_id,
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
  }, [isAsking, serviceMode, appendMessage, t])

  const rateMessageAnswer = useCallback(async (messageId: string, rating: SupportAnswerRating) => {
    const target = messages.find((m) => m.id === messageId)
    if (!target?.answerId) return
    const next = target.rating === rating ? null : rating
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, rating: next } : m)))
    if (next) {
      trackEvent('answer_rating', { rating: next })
      try {
        await rateAnswer(target.answerId, next)
      } catch (error) {
        appToast.requestError(error)
      }
    }
  }, [messages])

  const cancelActiveHandoff = useCallback(async () => {
    if (!ticketId) return
    const isConnecting = serviceMode === 'connecting'
    try {
      await cancelHandoff(ticketId)
      trackEvent('handoff_cancel')
    } catch (error) {
      appToast.requestError(error)
    }
    appendMessage({
      id: crypto.randomUUID(),
      role: 'system',
      content: isConnecting ? t('common.customerService.handoffConnectCancelled') : t('common.customerService.handoffQueueCancelled'),
      createdAt: Date.now(),
    })
    setServiceMode('idle')
    setTicketId(null)
    setQueuePosition(undefined)
  }, [ticketId, serviceMode, appendMessage, t])

  const endActiveHandoff = useCallback(async (rating?: number, skip?: boolean) => {
    if (!ticketId) return
    try {
      await endHandoff(ticketId, { rating, skip })
      trackEvent('handoff_end')
      if (rating) trackEvent('human_rating', { rating })
      else if (skip) trackEvent('human_rating', { skipped: true })
    } catch (error) {
      appToast.requestError(error)
    }
    setMessages((prev) => prev.map((m) => (m.kind === 'rating_card' ? { ...m, ratingCard: { ...m.ratingCard!, submittedStars: rating, skipped: skip } } : m)))
    setServiceMode('idle')
    setTicketId(null)
    setAgentInfo(null)
    setQueuePosition(undefined)
  }, [ticketId])

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

  // 长轮询：仅排队/连接中/已接入时开启
  const eventsEnabled = serviceMode === 'queueing' || serviceMode === 'connecting' || serviceMode === 'connected'
  useSupportEvents(eventsEnabled, ticketId ?? undefined, useCallback((event) => {
    if (event.queue_position !== undefined) setQueuePosition(event.queue_position)
    if (event.service_mode && event.service_mode !== serviceMode) {
      const prevMode = serviceMode
      setServiceMode(event.service_mode)
      if (event.service_mode === 'connected' && prevMode !== 'connected') {
        getSupportTicket(ticketId!).then((detail) => {
          setAgentInfo({ name: detail.agent_name, no: detail.agent_no })
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
          ratingCard: { ticketId: ticketId!, agentName: agentInfo?.name, agentNo: agentInfo?.no },
        })
      }
      if (event.service_mode === 'async') {
        appendMessage({ id: crypto.randomUUID(), role: 'system', content: t('common.customerService.handoffAsync'), createdAt: Date.now() })
        setServiceMode('idle')
        setTicketId(null)
        setAgentInfo(null)
      }
    }
    if (event.has_new_messages && ticketId && serviceMode === 'connected') {
      listTicketMessages(ticketId).then((page) => {
        setMessages((prev) => {
          const known = new Set(prev.map((m) => m.id))
          const fresh = page.items.filter((m) => !known.has(m.id) && m.role === 'agent')
          return [...prev, ...fresh.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: new Date(m.created_at).getTime() }))]
        })
      }).catch(() => {})
    }
  }, [serviceMode, ticketId, agentInfo, appendMessage, t]))

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
      trackEvent('feedback_submit', { category: fields.category })
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
      setMode('chat')
      return true
    } catch (error) {
      appToast.requestError(error, t('common.customerService.feedbackFailed'))
      return false
    } finally {
      setFeedbackSubmitting(false)
    }
  }, [appendMessage, t])

  // ---- 服务记录 ----
  const openTicketDetail = useCallback(async (id: string) => {
    setSelectedTicketId(id)
    setMode('ticket-detail')
    setTicketDetail(null)
    try {
      const detail = await getSupportTicket(id)
      setTicketDetail(detail)
    } catch (error) {
      appToast.requestError(error)
    }
  }, [])

  const reopenSelectedTicket = useCallback(async () => {
    if (!selectedTicketId) return
    try {
      const detail = await reopenTicket(selectedTicketId)
      setTicketDetail(detail)
      appToast.success(t('common.customerService.reopenSuccess'))
    } catch (error) {
      appToast.requestError(error)
    }
  }, [selectedTicketId, t])

  const rateSelectedTicket = useCallback(async (stars: number) => {
    if (!selectedTicketId) return
    try {
      await rateTicket(selectedTicketId, stars)
      setTicketDetail((prev) => (prev ? { ...prev, rating: stars } : prev))
    } catch (error) {
      appToast.requestError(error)
    }
  }, [selectedTicketId])

  return {
    mode,
    setMode,
    serviceMode,
    messages,
    isAsking,
    ticketId,
    queuePosition,
    agentInfo,
    selectedTicketId,
    ticketDetail,
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
