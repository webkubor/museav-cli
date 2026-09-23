import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/auth'
import { appToast } from '@/lib/app-toast'
import { trackEvent } from '@/lib/track'
import { storageKeys } from '@/lib/storage'
import { ModelGoApiError } from '@/lib/request'
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
import { getOrCreateSupportSessionId, clearSupportSessionId } from './session-id'
import {
  canStartHandoff,
  canApplyHandoffSnapshot,
  composerDisabled as composerDisabledOf,
  canApplyEndedTicket,
  isHumanChannel,
  isEndedSupportTicket,
  isSameSupportContext,
  modeFromServiceMode,
  needsEvents,
  reserveEndedTicket,
  serviceModeOf,
  showsComposer,
  showsFeedbackEntry,
  ticketIdOf,
  transition,
  type SupportMode,
} from './support-machine'
import { EPHEMERAL_ANSWER_ID, supportMessageRoleOf, ticketAgentNameOf, ticketNoOf, ticketSlaTextOf } from '@/interfaces/support'
import type {
  SupportTicketSnapshot,
  SupportAnswerRating,
  SupportAnswerStatus,
  SupportAskResponse,
  SupportFeedbackRequest,
  SupportMessage,
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
  suggestHandoff?: boolean
  /** 后端 sensitive.Hit：这条提问/回答命中了疑似密钥，界面要提示且不进交接摘要 */
  sensitiveHit?: boolean
  rating?: SupportAnswerRating | null
  kind?: 'feedback_receipt' | 'rating_card' | 'async_ticket'
  feedbackReceipt?: { ticketNo: string; status: string; slaText?: string; category: string; description: string }
  ratingCard?: { ticketId: string; agentName?: string; agentNo?: string; submittedStars?: number; skipped?: boolean }
  /** 转异步后的问题单回执（PRD 原型 CustomerSupportAsyncTicket.tsx 的 AsyncSupportTicketCard） */
  asyncTicket?: { ticketNo: string; status: string; slaText?: string }
}

/**
 * 把工单消息列表里**新的客服回复**接到本地对话框。
 * 后端实测是 sender_type，不是 role（CS-20260917-4109）；本地用户气泡用的是
 * crypto.randomUUID()，跟服务端 id 对不上，所以只收 agent，避免把用户自己的
 * 发言再插一遍。
 */
export function mergeFreshAgentMessages(prev: ChatItem[], items: SupportMessage[]): ChatItem[] {
  const known = new Set(prev.map((m) => m.id))
  const fresh: ChatItem[] = []
  for (const m of items) {
    if (known.has(m.id) || supportMessageRoleOf(m) !== 'agent') continue
    known.add(m.id)
    fresh.push({
      id: m.id,
      role: 'agent',
      content: m.content,
      createdAt: new Date(m.created_at).getTime(),
    })
  }
  return fresh.length === 0 ? prev : [...prev, ...fresh]
}

/**
 * 人工交接摘要（PRD §8.6）。只拼**用户提问**与回答状态，绝不带回答正文与任何凭据：
 * §10 明确 API Key / Token / 密码不得进入交接摘要。取最近 6 条，整体截到 800 字。
 */
export function buildHandoffSummary(items: ChatItem[], pagePath: string): string {
  const lines = items
    .filter((m) => m.role === 'user' && !m.sensitiveHit)
    .slice(-6)
    .map((m) => `- ${m.content.slice(0, 120)}`)
  const tried = items.filter((m) => m.role === 'assistant').length
  return [
    `页面：${pagePath}`,
    tried > 0 ? `已尝试智能回答 ${tried} 次` : '未获得智能回答',
    lines.length ? `最近提问：\n${lines.join('\n')}` : '',
  ].filter(Boolean).join('\n').slice(0, 800)
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
  const isLoading = useAuthStore((s) => s.isLoading)

  // 🔴 模式是**单一真源**：原先 mode(4) × serviceMode(6) = 24 种组合、PRD 只承认 9 种，
  // 且 ticketId / queuePosition / agentInfo 散在外面，切模式要手动清 4~5 个变量
  // —— 漏一个就残留（见 support-machine.ts 顶部记的两个真实 bug）。
  // 现在这些数据随模式携带，切模式即失效，漏不掉。
  const [mode, setModeRaw] = useState<SupportMode>({ kind: 'chat' })
  const modeRef = useRef(mode)
  useLayoutEffect(() => {
    modeRef.current = mode
  }, [mode])
  const [messages, setMessages] = useState<ChatItem[]>([])
  const [isAsking, setIsAsking] = useState(false)
  const askGeneration = useRef(0)
  const handoffPending = useRef(false)
  const [isCancellingHandoff, setIsCancellingHandoff] = useState(false)
  const [ticketDetail, setTicketDetail] = useState<SupportTicketDetail | null>(null)

  /** 唯一的模式迁移入口：非法跳转被 transition() 拦下，不静默生效。 */
  const go = useCallback((next: SupportMode) => {
    setModeRaw((cur) => transition(cur, next))
  }, [])

  /** 当前模式关联的工单号（取代原来那个全局 ticketId）。 */
  const ticketId = ticketIdOf(mode)

  const lastAccountId = useRef<string | null>(null)
  const appliedAsyncTicketIds = useRef<Set<string>>(new Set())
  const appliedEndedTicketIds = useRef<ReadonlySet<string>>(new Set())
  const activeAccountId = useRef(account?.account_id ?? null)
  const activeMode = useRef(mode)

  useLayoutEffect(() => {
    activeAccountId.current = account?.account_id ?? null
    activeMode.current = mode
  }, [account?.account_id, mode])

  const isCurrentSupportTicket = useCallback((ticketId: string, expectedAccountId: string | null) => (
    isSameSupportContext(
      activeAccountId.current,
      expectedAccountId,
      ticketIdOf(activeMode.current),
      ticketId,
    )
  ), [])

  const applyEndedTicket = useCallback((ticketId: string, expectedAccountId: string | null, detail: SupportTicketDetail) => {
    if (!isCurrentSupportTicket(ticketId, expectedAccountId)) return
    if (!canApplyEndedTicket(activeMode.current)) return
    const reservation = reserveEndedTicket(appliedEndedTicketIds.current, ticketId)
    appliedEndedTicketIds.current = reservation.appliedTicketIds
    if (!reservation.shouldApply) return

    setTicketDetail(detail)
    go(modeFromServiceMode('ended', ticketId))
    setMessages((prev) => prev.some((message) => message.kind === 'rating_card' && message.ratingCard?.ticketId === ticketId)
      ? prev
      : [...prev,
        { id: crypto.randomUUID(), role: 'system', content: t('common.customerService.handoffEnded'), createdAt: Date.now() },
        {
          id: crypto.randomUUID(),
          role: 'system',
          content: '',
          createdAt: Date.now(),
          kind: 'rating_card',
          ratingCard: { ticketId, agentName: ticketAgentNameOf(detail), agentNo: detail.agent_no },
        },
      ])
  }, [go, isCurrentSupportTicket, t])
  const suppressedHandoffTicketIds = useRef<ReadonlySet<string>>(new Set())
  const cancellingHandoffTicketId = useRef<string | null>(null)

  // 一次性清除迁移期废弃的历史缓存（旧 SSE hook 用过）。
  // 注意：不再清除 cs_cid —— #1057 要求 session_id 本地持久化（刷新/重开保留），
  // 会话 id 的生命周期改由 getOrCreateSupportSessionId 管理，仅在登出/切账号时清。
  useEffect(() => {
    try {
      localStorage.removeItem(storageKeys.csHistory())
    } catch { /* ignore */ }
  }, [])

  // 退出登录/切账号：清空私有会话上下文
  useEffect(() => {
    const currentId = account?.account_id ?? null
    if (lastAccountId.current !== null && lastAccountId.current !== currentId) {
      askGeneration.current += 1
      setIsAsking(false)
      // 回到 chat 即丢弃全部模式内数据（ticketId / 排队人数 / 客服信息），
      // 不用再逐个清 —— 这正是原先漏清 agentInfo 的地方
      setMessages([])
      setModeRaw({ kind: 'chat' })
      setTicketDetail(null)
      appliedEndedTicketIds.current = new Set()
      appliedAsyncTicketIds.current = new Set()
      suppressedHandoffTicketIds.current = new Set()
      cancellingHandoffTicketId.current = null
      handoffPending.current = false
      // 切账号必须换新会话：否则上一账号持久化的 session_id 会带到新账号，
      // 让后端把两人的多轮上下文串到一起（#1057 要求会话稳定，但不能跨账号）。
      clearSupportSessionId()
    }
    lastAccountId.current = currentId
  }, [account?.account_id])

  const appendMessage = useCallback((item: ChatItem) => {
    setMessages((prev) => [...prev, item])
  }, [])

  const startHandoffWithTrigger = useCallback(async (trigger?: { question: string; sensitiveHit: boolean }) => {
    // 「排队中不允许重复发起转接」由状态机判定（PRD §8.6），不再自己比 serviceMode
    if (!canStartHandoff(mode) || handoffPending.current) return
    // 未登录直接引导登录：转人工是登录态能力，发出去只会拿到 40101，
    // 再被 catch 成「转人工失败，请稍后重试」——用户会一直重试，而重试
    // 永远失败。同理这里也不能让 40101 走到 request.ts 的全局分支，
    // 那条是给「会话过期」用的，对从未登录的人提示「会话已过期」是错的。
    // ⚠️ 必须带 !isLoading：页面刷新后 auth store 要先拉 /auth/session 才有 account，
    // 那几百毫秒里 account 是 null。只判 account 会对**已登录**用户弹「请先登录」
    // ——f8992444 就这么回归过一次，2026-09-14 在 test 上实测撞到。
    if (!isLoading && !account) {
      appendMessage({
        id: crypto.randomUUID(),
        role: 'system',
        content: t('common.customerService.loginRequired.handoff'),
        createdAt: Date.now(),
      })
      return
    }
    handoffPending.current = true
    trackEvent('support_handoff_start')
    try {
      const resp = await requestHandoff({
        page_path: currentPagePath(),
        // PRD §8.6：转人工要自动交接当前页面与最近对话摘要，客服不用从头问一遍。
        // §10/§12 要求摘要先过敏感检测：这里只取**用户自己的提问**和回答状态标签，
        // 不带回答正文、不带 API Key/Token（后端 sensitive.Hit 命中的那条也不会进来）。
        summary: buildHandoffSummary(trigger
          ? [...messages, { id: '', role: 'user', content: trigger.question, createdAt: Date.now(), sensitiveHit: trigger.sensitiveHit }]
          : messages, currentPagePath() ?? ''),
      })
      appendMessage({
        id: crypto.randomUUID(),
        role: 'system',
        content: t('common.customerService.handoffStarted'),
        createdAt: Date.now(),
      })
      go(modeFromServiceMode(resp.service_mode, resp.ticket_id, {
        ahead: resp.queue_position,
        agentName: resp.agent_name,
        agentNo: resp.agent_no,
        status: resp.status,
      }))
    } catch (error) {
      appToast.requestError(error, t('common.customerService.handoffFailed'))
      go({ kind: 'chat' })
      appendMessage({ id: crypto.randomUUID(), role: 'system', content: t('common.customerService.handoffFailed'), createdAt: Date.now() })
    } finally {
      handoffPending.current = false
    }
  }, [mode, go, appendMessage, t, account, isLoading, messages])
  const startHandoff = useCallback(() => startHandoffWithTrigger(), [startHandoffWithTrigger])

  const ask = useCallback(async (question: string) => {
    const trimmed = question.trim()
    if (!trimmed || isAsking) return
    const generation = askGeneration.current
    const accountId = account?.account_id ?? null

    if (HANDOFF_TRIGGER_RE.test(trimmed) && canStartHandoff(mode)) {
      appendMessage({ id: crypto.randomUUID(), role: 'user', content: trimmed, createdAt: Date.now() })
      await startHandoff()
      return
    }

    appendMessage({ id: crypto.randomUUID(), role: 'user', content: trimmed, createdAt: Date.now() })
    setIsAsking(true)
    trackEvent('support_question_submit')
    try {
      const resp = await askSupport({
        message: trimmed,
        session_id: getOrCreateSupportSessionId(),
        page_path: currentPagePath(),
      })
      if (generation !== askGeneration.current || accountId !== activeAccountId.current) return
      appendMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: resp.answer,
        createdAt: Date.now(),
        // 后端实测返回 message_id（不是 PRD 写的 answer_id）；匿名态是
        // ans_ephemeral 占位，没落库、评分接口用不了，故不给评分控件。
        answerId: pickAnswerId(resp),
        answerStatus: resp.answer_status,
        suggestHandoff: resp.suggest_handoff,
        // 后端在响应里回 sensitive:{Hit,Kind}，PRD §10 要求命中后给用户明确提示
        // （命中内容不进模型/检索/埋点/人工摘要）。此前前端完全没读这个字段。
        sensitiveHit: resp.sensitive?.Hit === true,
        rating: null,
      })
      if (resp.intent === 'human_handoff') await startHandoffWithTrigger({ question: trimmed, sensitiveHit: resp.sensitive?.Hit === true })
    } catch (error) {
      if (generation !== askGeneration.current || accountId !== activeAccountId.current) return
      appToast.requestError(error, t('common.customerService.sendFailed'))
      appendMessage({
        id: crypto.randomUUID(),
        role: 'system',
        content: t('common.customerService.sendFailed'),
        createdAt: Date.now(),
      })
    } finally {
      if (generation === askGeneration.current) setIsAsking(false)
    }
  }, [isAsking, mode, account?.account_id, appendMessage, startHandoff, startHandoffWithTrigger, t])

  const rateMessageAnswer = useCallback(async (messageId: string, rating: SupportAnswerRating) => {
    const target = messages.find((m) => m.id === messageId)
    if (!target?.answerId) return
    // 后端评分一次性（qa#731 实测：up 后再 down → 40001 support.invalid_transition），
    // 已评过就不再响应，切换/撤销都不允许。
    if (target.rating) return
    const next = rating
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
    if (!ticketId || cancellingHandoffTicketId.current === ticketId
      || !canApplyHandoffSnapshot(ticketId, ticketIdOf(modeRef.current), suppressedHandoffTicketIds.current)) return
    const isConnecting = mode.kind === 'connecting'
    cancellingHandoffTicketId.current = ticketId
    suppressedHandoffTicketIds.current = new Set([...suppressedHandoffTicketIds.current, ticketId])
    setIsCancellingHandoff(true)
    try {
      await cancelHandoff(ticketId)
      trackEvent('support_handoff_cancel')
    } catch (error) {
      suppressedHandoffTicketIds.current = new Set(
        [...suppressedHandoffTicketIds.current].filter((id) => id !== ticketId),
      )
      appToast.requestError(error)
      return
    } finally {
      cancellingHandoffTicketId.current = null
      setIsCancellingHandoff(false)
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
    const accountId = account?.account_id ?? null
    const messageId = crypto.randomUUID()
    appendMessage({ id: messageId, role: 'user', content: trimmed, createdAt: Date.now() })
    try {
      await replyTicketMessage(ticketId, trimmed)
    } catch (error) {
      setMessages((prev) => prev.filter((message) => message.id !== messageId))
      if (!isCurrentSupportTicket(ticketId, accountId)) return
      if (error instanceof ModelGoApiError && error.rawMessage === 'support.invalid_transition') {
        try {
          const detail = await getSupportTicket(ticketId)
          if (!isCurrentSupportTicket(ticketId, accountId)) return
          if (isEndedSupportTicket(detail)) {
            applyEndedTicket(ticketId, accountId, detail)
            return
          }
        } catch {
          // Keep the original send error when refreshing ticket state also fails.
        }
      }
      appToast.requestError(error, t('common.customerService.sendFailed'))
    }
  }, [account?.account_id, ticketId, appendMessage, applyEndedTicket, isCurrentSupportTicket, t])

  // 长轮询：开关也由模式推导（PRD 只在人工线进行中需要）
  const eventsEnabled = needsEvents(mode)
  useSupportEvents(eventsEnabled, ticketId ?? undefined, useCallback(async (raw) => {
    const accountId = account?.account_id ?? null
    // 后端的 /support/events 只是**变更信号**（events[] + server_versions），
    // 不带 service_mode / queue_position / has_new_messages —— 那三个是照 PRD 写的，
    // 从没下发过，长轮询因此空转：排队→接通、超时转异步、新消息全推不动。
    // 真状态一律回工单详情拿，这里把详情压成下面这套逻辑原本期待的形状。
    if (!ticketId) return
    if (!canApplyHandoffSnapshot(ticketId, ticketIdOf(modeRef.current), suppressedHandoffTicketIds.current)) return
    if (raw && Array.isArray(raw.events) && raw.events.length === 0) return
    const detail = await getSupportTicket(ticketId).catch(() => null)
    if (!detail) return
    if (!isCurrentSupportTicket(ticketId, accountId)) return
    if (!canApplyHandoffSnapshot(ticketId, ticketIdOf(modeRef.current), suppressedHandoffTicketIds.current)) return
    const agentName = ticketAgentNameOf(detail)
    const event: SupportTicketSnapshot = {
      // 后端的 service_mode 只有 live / async 两个值，排队到哪一步不在里面：
      // 有客服显示名 = 已接通，否则还在排队。不猜 status 枚举（只实测到 pending）。
      service_mode: detail.service_mode === 'async'
        ? 'async'
        : detail.service_mode === 'ended'
          ? 'ended'
          : agentName ? 'connected' : 'queueing',
      status_label: detail.status_label,
      agent_name: agentName,
      has_new_messages: (detail.latest_message_seq ?? 0) > (detail.read_message_seq ?? 0),
    }
    // 排队文案变化：同模式内换数据（状态机允许 from === to）。
    // 后端不下发 queue_position 数字，只给整句 status_label（「排队中 · 前方 0 人」），
    // 直接透传 —— 前端再拼一遍只会拼出「前方 - 人」。
    if (event.status_label && mode.kind === 'queuing' && mode.statusLabel !== event.status_label) {
      go({ ...mode, statusLabel: event.status_label })
    }
    if (event.service_mode && event.service_mode !== serviceModeOf(mode)) {
      const prevKind = mode.kind
      go(modeFromServiceMode(event.service_mode, ticketId, {
        statusLabel: event.status_label,
        agentName: event.agent_name ?? (mode.kind === 'human' ? mode.agentName : undefined),
        agentNo: mode.kind === 'human' ? mode.agentNo : undefined,
      }))
      if (event.service_mode === 'connected' && prevKind !== 'human') {
        setModeRaw((cur) => (cur.kind === 'human'
          ? { ...cur, agentName, agentNo: detail.agent_no }
          : cur))
        trackEvent('support_handoff_connected')
        appendMessage({ id: crypto.randomUUID(), role: 'system', content: t('common.customerService.handoffConnected'), createdAt: Date.now() })
      }
      if (event.service_mode === 'ended') {
        applyEndedTicket(ticketId, accountId, detail)
      }
      if (event.service_mode === 'async') {
        if (appliedAsyncTicketIds.current.has(ticketId)) return
        appliedAsyncTicketIds.current.add(ticketId)
        // 转异步后走异步回执、不再占用面板主态（PRD §8.6）。
        // 模式已由 modeFromServiceMode('async') 映射回 chat，排队人数/客服信息随之丢弃
        // —— 旧实现这里漏清 queuePosition，顶部还会显示「前方 N 人」。
        appendMessage({ id: crypto.randomUUID(), role: 'system', content: t('common.customerService.handoffAsync'), createdAt: Date.now() })
        // 🔴 再出一张**带工单编号的回执卡**（PRD 原型 AsyncSupportTicketCard）：
        // AC 第 3 条要的是「出现异步问题单回执（CS-）」，只发一句纯文本系统消息
        // 用户拿不到编号、后续无从追踪。events 接口不带 ticket_no，从详情拉。
        // detail 上面已经拉过，直接用 —— 编号/状态/SLA 一律走统一取值口径，
        // 后端字段是 ticket_id / status_label / next_step，不是 PRD 的 ticket_no / sla_text。
        appendMessage({
          id: crypto.randomUUID(),
          role: 'system',
          content: '',
          createdAt: Date.now(),
          kind: 'async_ticket',
          asyncTicket: {
            ticketNo: ticketNoOf(detail),
            status: t('common.customerService.asyncTicket.pending'),
            slaText: ticketSlaTextOf(detail) || t('common.customerService.asyncTicket.defaultEta'),
          },
        })
      }
    }
    if (event.has_new_messages && ticketId && mode.kind === 'human') {
      listTicketMessages(ticketId).then((page) => {
        setMessages((prev) => mergeFreshAgentMessages(prev, page.items))
      }).catch(() => {})
    }
  }, [mode, go, ticketId, appendMessage, applyEndedTicket, isCurrentSupportTicket, t, account]))

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
          // 后端实测只给 ticket_id（FB-20260914-8315），没有 ticket_no —— 读错字段
          // 的后果是回执卡「反馈编号」整行空白；status 是机器码（pending），
          // 上屏要用 status_label（「等待客服受理」）。
          ticketNo: resp.ticket_id || resp.ticket_no || '',
          status: resp.status_label || resp.status,
          // 后端把 SLA 放在 next_step（「我们将在 1 个工作日内联系你。」），不是 sla_text
          slaText: resp.next_step || resp.sla_text,
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
    isCancellingHandoff,
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
