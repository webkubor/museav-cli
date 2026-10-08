import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/auth'
import { appToast } from '@/lib/app-toast'
import { trackEvent } from '@/lib/track'
import { storageKeys } from '@/lib/storage'
import { isServerErrorCode, ModelGoApiError, SENSITIVE_KEY_RE } from '@/lib/request'
import {
  askSupportStream,
  attachSupportTicketAttachment,
  cancelHandoff,
  createSupportSession,
  endHandoff,
  getSupportTicket,
  listTicketMessages,
  markTicketRead,
  rateAnswer,
  rateTicket,
  supplementTicket,
  replyTicketMessage,
  reopenTicket,
  requestHandoff,
  submitSupportFeedback,
  uploadSupportAttachment,
} from '@/services/support'
import { useSupportEvents } from './use-support-events'
import { getOrCreateSupportSessionId, clearSupportSessionId, peekSupportSessionId, replaceSupportSessionId } from './session-id'
import { isNotFoundError } from '@/lib/request-error-message'
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
import { EPHEMERAL_ANSWER_ID, supportMessageRoleOf, ticketAgentNameOf, ticketNoOf, ticketSlaTextOf, ticketUnreadOf } from '@/interfaces/support'
import type {
  SupportTicketSnapshot,
  SupportAnswerRating,
  SupportAnswerStatus,
  SupportAskResponse,
  SupportFeedbackRequest,
  SupportMessage,
  SupportTicketDetail,
  SupplementResult,
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
/** 工单消息 → 气泡。system 消息（状态变更）也保留，转异步单的「状态变更」同样算新消息。 */
function toTicketChatItem(m: SupportMessage): ChatItem {
  return { id: m.id, role: supportMessageRoleOf(m) ?? 'system', content: m.content, createdAt: Date.parse(m.created_at) || Date.now() }
}

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

/**
 * 取客服接口的 support.* 业务码。agent 的 4001 经 web-api 转成 40001 参数校验失败后，
 * 机器码不在 msg 里，而在 data.field_errors[].message（2026-09-24 test 实测：
 * `{code:40001,msg:"request validation failed",data:{field_errors:[{field:"_root",message:"support.invalid_transition"}]}}`）；
 * 直连或未包装时则在 msg 上。两处都认。5xx / 40401 / 非 support.* 的错误返回 null。
 */
function supportErrorCodeOf(error: unknown): string | null {
  // 40401 由 requestError 归一成「服务暂不可用」，不在这里截走
  if (!(error instanceof ModelGoApiError) || isServerErrorCode(error.code) || error.code === 40401) return null
  if (error.rawMessage?.startsWith('support.')) return error.rawMessage
  return error.data?.field_errors?.map((f) => f.message).find((m): m is string => !!m?.startsWith('support.')) ?? null
}

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
  const accountEpoch = useRef(0)
  const handoffPending = useRef(false)
  // 每次转人工一个令牌：在途标记只由发起它的那次复位，不再依赖 accountEpoch ——
  // 「新会话」会推进代次，旧写法下 finally 判代次不等就永远不复位，之后再也发不起转人工
  const handoffToken = useRef(0)
  // 新会话请求在途：此时不许发起转人工，否则会话先回、代次一推，转人工回包被当过期丢掉，后端排队单成孤儿
  const newSessionPending = useRef(false)
  const newSessionToken = useRef(0)
  // 记账用：一次自动转人工（后端答 human_handoff）被 newSessionPending 挡下（prd46#1171-2）。
  // 若那次新会话随后失败（非 404 走 catch 分支），这次转人工就彻底丢了 —— 后端已判定的意图
  // 用户再也收不到任何提示，界面里只剩一个失败的新会话。由 startNewSession 在失败分支消费。
  const deferredHandoff = useRef(false)
  // 给按钮用的可渲染状态（ref 变了不触发渲染）
  const [handoffInFlight, setHandoffInFlight] = useState(false)
  const [isCancellingHandoff, setIsCancellingHandoff] = useState(false)
  const [ticketDetail, setTicketDetail] = useState<SupportTicketDetail | null>(null)
  // 详情取数失败要留在界面上：原先只弹 toast，详情页一直停在「加载中…」（#1151）
  const [ticketDetailError, setTicketDetailError] = useState<unknown>(null)
  // 人工单详情的会话气泡（PRD 工单类型：人工服务 / 转异步都是「对话形态」）。
  // 原先详情只渲染元信息，转异步单里客服发的消息用户根本看不到（#1154 实测）。
  const [ticketMessages, setTicketMessages] = useState<ChatItem[]>([])
  // 消息是否已拉回。没拉回之前气泡区是空的，可视区哨兵紧贴在元信息下面必然「可见」，
  // 转异步单会被误判已读（2026-09-28 test 实测：未滚动 2.5s 内 read_seq 就被推满）。
  // 拉取失败也保持 false：用户什么都没看到，不能算已读。
  const [ticketMessagesLoaded, setTicketMessagesLoaded] = useState(false)
  // 已读变化后递增，让入口角标重新拉一次未读数
  const [unreadVersion, setUnreadVersion] = useState(0)
  const detailRequestSeq = useRef(0)

  /** 唯一的模式迁移入口：非法跳转被 transition() 拦下，不静默生效。 */
  const go = useCallback((next: SupportMode) => {
    setModeRaw((cur) => transition(cur, next))
  }, [])

  /** 当前模式关联的工单号（取代原来那个全局 ticketId）。 */
  const ticketId = ticketIdOf(mode)

  const lastAccountId = useRef<string | null>(account?.account_id ?? null)
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

  // 人工会话结束的两条路径（客服在后台点已解决 / 用户点「结束服务」）共用这一处收尾：
  // 结束提示 +「每个已结束的人工会话一张」评价卡（PRD §7.6/§7.7）。按 ticketId 预留，
  // 长轮询晚到的 ended 回包不会再追加第二张。
  const enterHumanEnded = useCallback((ticketId: string, detail: SupportTicketDetail | null, agent?: { agentName?: string; agentNo?: string }) => {
    const reservation = reserveEndedTicket(appliedEndedTicketIds.current, ticketId)
    appliedEndedTicketIds.current = reservation.appliedTicketIds
    if (!reservation.shouldApply) return

    if (detail) setTicketDetail(detail)
    go(modeFromServiceMode('ended', ticketId))
    setMessages((prev) => prev.some((message) => message.kind === 'rating_card' && message.ratingCard?.ticketId === ticketId)
      ? prev
      : [...prev,
        { id: crypto.randomUUID(), role: 'system', content: t('common.customerService.handoff.ended'), createdAt: Date.now() },
        {
          id: crypto.randomUUID(),
          role: 'system',
          content: '',
          createdAt: Date.now(),
          kind: 'rating_card',
          ratingCard: {
            ticketId,
            agentName: agent?.agentName ?? (detail ? ticketAgentNameOf(detail) : undefined),
            agentNo: agent?.agentNo ?? detail?.agent_no,
          },
        },
      ])
  }, [go, t])

  const applyEndedTicket = useCallback((ticketId: string, expectedAccountId: string | null, detail: SupportTicketDetail) => {
    if (!isCurrentSupportTicket(ticketId, expectedAccountId)) return
    if (!canApplyEndedTicket(activeMode.current)) return
    enterHumanEnded(ticketId, detail)
  }, [enterHumanEnded, isCurrentSupportTicket])
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
  //
  // 用 useLayoutEffect 而非 useEffect（prd46#1171-5）：账号刚切、这个重置还没跑完的那一两帧里
  // （useEffect 要等浏览器绘制后才执行，中间存在一个空窗），用户点「新会话」会打在这个半初始化
  // 状态上 —— 点击被丢弃、界面毫无反应。改到布局阶段同步跑完，切号那次 commit 里不留空窗。
  useLayoutEffect(() => {
    const currentId = account?.account_id ?? null
    if (lastAccountId.current !== currentId) {
      accountEpoch.current += 1
      setIsAsking(false)
      // 回到 chat 即丢弃全部模式内数据（ticketId / 排队人数 / 客服信息），
      // 不用再逐个清 —— 这正是原先漏清 agentInfo 的地方
      setMessages([])
      setModeRaw({ kind: 'chat' })
      setTicketDetail(null)
      setTicketDetailError(null)
      setTicketMessages([])
      setTicketMessagesLoaded(false)
      // 换号后旧账号在途的详情回包作废
      detailRequestSeq.current++
      appliedEndedTicketIds.current = new Set()
      appliedAsyncTicketIds.current = new Set()
      suppressedHandoffTicketIds.current = new Set()
      cancellingHandoffTicketId.current = null
      handoffPending.current = false
      setHandoffInFlight(false)
      deferredHandoff.current = false
      newSessionToken.current += 1
      newSessionPending.current = false
      setStartingNewSession(false)
      // 切账号必须换新会话：否则上一账号持久化的 session_id 会带到新账号，
      // 让后端把两人的多轮上下文串到一起（#1057 要求会话稳定，但不能跨账号）。
      clearSupportSessionId()
    }
    lastAccountId.current = currentId
  }, [account?.account_id])

  const appendMessage = useCallback((item: ChatItem) => {
    setMessages((prev) => [...prev, item])
  }, [])

  const startHandoffWithTrigger = useCallback(async (
    trigger?: { question: string; sensitiveHit: boolean },
    // 只有「后端判定的自动转人工」才记账（prd46#1171-2）。用户手动输入「转人工」被挡下时
    // 已经拿到下面那条 handoffBusy 提示，若新会话随后失败又补一条 handoffRetryLater，
    // 同一次被挡会收到两条反馈。两者都要「有反馈」，但只有自动那条会无声消失、必须补。
    deferOnBlocked = false,
  ) => {
    // 「排队中不允许重复发起转接」由状态机判定（PRD §8.6），不再自己比 serviceMode
    if (!canStartHandoff(modeRef.current)) return
    // 在途时不静默 return（prd46#1171-1）。用户那条「转人工」已经上屏了，入口却一声不吭地
    // 退出 —— 界面上看起来像系统没听见，下一次还会再问一遍。给一条系统提示说清「为什么没反应」。
    if (handoffPending.current || newSessionPending.current) {
      // 被新会话在途挡下的自动转人工要记账：那次新会话若随后失败，这次转人工就彻底没了，
      // 界面里不会留下任何痕迹。消费点在 startNewSession 的失败分支（prd46#1171-2）。
      if (newSessionPending.current && deferOnBlocked) deferredHandoff.current = true
      // 同一在途原因不刷屏（评审 P2）：在途窗口可能很长（接口挂起时用户能连点多次），
      // 逐次追加同一条提示会淹没对话。
      // ⚠️ 两个坑都踩过：① 判重不能拿闭包里的 messages 比，连点时闭包落后于已排队的更新；
      // ② 也不能只看末条 —— 用户每次手输的「转人工」正好插在两条提示中间。所以从末尾
      // 回看、跳过 user 消息，找最近一条非用户消息。updater 拿到的是应用时刻的最新状态。
      const busy = t('common.customerService.handoffBusy')
      // 提示对象在 updater 外建好：updater 必须是纯的 —— StrictMode 会重复调用它，
      // 在里面取 randomUUID()/now() 等于每次生成一个被丢弃的不同对象（评审 P2）。
      // updater 只负责判重与追加。
      const note: ChatItem = { id: crypto.randomUUID(), role: 'system', content: busy, createdAt: Date.now() }
      setMessages((prev) => {
        for (let i = prev.length - 1; i >= 0; i--) {
          const m = prev[i]
          if (m.role === 'user') continue
          if (m.role === 'system' && m.content === busy) return prev
          break
        }
        return [...prev, note]
      })
      return
    }
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
    const epoch = accountEpoch.current
    const accountId = account?.account_id ?? null
    const token = ++handoffToken.current
    handoffPending.current = true
    setHandoffInFlight(true)
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
      if (epoch !== accountEpoch.current || accountId !== activeAccountId.current) return
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
      if (epoch !== accountEpoch.current || accountId !== activeAccountId.current) return
      appToast.requestError(error, t('common.customerService.handoffFailed'))
      go({ kind: 'chat' })
      appendMessage({ id: crypto.randomUUID(), role: 'system', content: t('common.customerService.handoffFailed'), createdAt: Date.now() })
    } finally {
      if (handoffToken.current === token) {
        handoffPending.current = false
        setHandoffInFlight(false)
      }
    }
  }, [go, appendMessage, t, account, isLoading, messages])
  const startHandoff = useCallback(() => startHandoffWithTrigger(), [startHandoffWithTrigger])

  const ask = useCallback(async (question: string) => {
    const trimmed = question.trim()
    if (!trimmed || isAsking) return
    const generation = accountEpoch.current
    const accountId = account?.account_id ?? null

    if (HANDOFF_TRIGGER_RE.test(trimmed) && canStartHandoff(mode)) {
      appendMessage({ id: crypto.randomUUID(), role: 'user', content: trimmed, createdAt: Date.now() })
      // Direct triggers bypass /support/ask's sensitive.Hit; omit the entire question
      // when the shared request redaction matcher spots a credential label.
      await startHandoffWithTrigger({ question: trimmed, sensitiveHit: SENSITIVE_KEY_RE.test(trimmed) })
      return
    }

    appendMessage({ id: crypto.randomUUID(), role: 'user', content: trimmed, createdAt: Date.now() })
    setIsAsking(true)
    trackEvent('support_question_submit')
    try {
      // /support/ask is consumed as SSE: the backend answers with an immediate
      // status frame (so the first byte lands inside the PRD's 5s budget,
      // #1157), then the validated answer. An older web-api answers the plain
      // JSON envelope, which askSupportStream surfaces as the same answer frame.
      const result: { answer?: SupportAskResponse } = {}
      await askSupportStream(
        {
          message: trimmed,
          session_id: getOrCreateSupportSessionId(),
          page_path: currentPagePath(),
        },
        (frame) => {
          if (frame.type === 'answer' && frame.data) result.answer = frame.data
        },
      )
      const answer = result.answer
      if (!answer) throw new Error('support/ask returned no answer')
      if (generation !== accountEpoch.current || accountId !== activeAccountId.current) return
      appendMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: answer.answer,
        createdAt: Date.now(),
        // 后端实测返回 message_id（不是 PRD 写的 answer_id）；匿名态是
        // ans_ephemeral 占位，没落库、评分接口用不了，故不给评分控件。
        answerId: pickAnswerId(answer),
        answerStatus: answer.answer_status,
        suggestHandoff: answer.suggest_handoff,
        // 后端在响应里回 sensitive:{Hit,Kind}，PRD §10 要求命中后给用户明确提示
        // （命中内容不进模型/检索/埋点/人工摘要）。此前前端完全没读这个字段。
        sensitiveHit: answer.sensitive?.Hit === true,
        rating: null,
      })
      if (answer.intent === 'human_handoff' && canStartHandoff(modeRef.current)) {
        // 第二个参数 true：这是后端判定的自动转人工，被新会话在途挡下后需要记账
        await startHandoffWithTrigger({ question: trimmed, sensitiveHit: answer.sensitive?.Hit === true }, true)
      }
    } catch (error) {
      if (generation !== accountEpoch.current || accountId !== activeAccountId.current) return
      appToast.requestError(error, t('common.customerService.sendFailed'))
      appendMessage({
        id: crypto.randomUUID(),
        role: 'system',
        content: t('common.customerService.sendFailed'),
        createdAt: Date.now(),
      })
    } finally {
      if (generation === accountEpoch.current) setIsAsking(false)
    }
  }, [isAsking, mode, account?.account_id, appendMessage, startHandoffWithTrigger, t])

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

  // 顶栏「结束服务」：先结束会话，成功后再出结束提示 + 评价卡（prd46#1202）。
  // 旧实现结束后直接 go(chat)，评价卡只有「客服后台点已解决」那条长轮询路径会出，
  // 用户自己结束的会话永远拿不到评价卡。先结束再评价、而不是等评价时才结束：
  // 用户不评价直接关面板，会话也不会一直挂在客服那边（同原型 endHumanSupport）。
  // 客服名/工号取当前人工模式自带的（长轮询时写进 mode），不读 ticketDetail——
  // 人工态下 ticketDetail 没人维护，可能是空，也可能是之前在服务记录里看过的另一张单。
  const endingHandoffTicketId = useRef<string | null>(null)
  const endActiveHandoff = useCallback(async () => {
    const current = activeMode.current
    if (current.kind !== 'human' || endingHandoffTicketId.current === current.ticketId) return
    const { ticketId: endingId, agentName, agentNo } = current
    const expectedAccountId = activeAccountId.current
    endingHandoffTicketId.current = endingId
    try {
      await endHandoff(endingId, {})
    } catch (error) {
      appToast.requestError(error)
      return
    } finally {
      endingHandoffTicketId.current = null
    }
    trackEvent('support_handoff_end')
    // 请求在途时切了账号 / 已被长轮询收尾：不往新上下文里追加旧单的结束提示和评价卡
    if (!isCurrentSupportTicket(endingId, expectedAccountId)) return
    enterHumanEnded(endingId, null, { agentName, agentNo })
  }, [enterHumanEnded, isCurrentSupportTicket])

  // 评价卡「提交 / 暂不评价」。后端 /handoff/end 结束幂等、评分一次性，专门支持
  // 「先结束、评分后到」（agent EndSessionWithRating）。用卡片自己的 ticketId，
  // 不读当前模式：用户可能已切去别的模式再回来评价。接口失败不标「已提交」，
  // 否则评分静默丢失。
  const ratingTicketIds = useRef<ReadonlySet<string>>(new Set())
  const rateEndedHandoff = useCallback(async (cardTicketId: string, rating?: number, skip?: boolean) => {
    // 双击防重：后端评分只收一次，第二发会报错 toast，而卡片已显示「已提交」，提示自相矛盾
    if (ratingTicketIds.current.has(cardTicketId)) return
    ratingTicketIds.current = new Set([...ratingTicketIds.current, cardTicketId])
    try {
      await endHandoff(cardTicketId, { rating, skip })
    } catch (error) {
      appToast.requestError(error)
      return
    } finally {
      ratingTicketIds.current = new Set([...ratingTicketIds.current].filter((id) => id !== cardTicketId))
    }
    if (rating) trackEvent('support_human_rating', { rating })
    else if (skip) trackEvent('support_human_rating', { skipped: true })
    setMessages((prev) => prev.map((m) => (
      m.kind === 'rating_card' && m.ratingCard?.ticketId === cardTicketId
        ? { ...m, ratingCard: { ...m.ratingCard, submittedStars: rating, skipped: skip } }
        : m
    )))
    const current = activeMode.current
    if (current.kind === 'humanEnded' && current.ticketId === cardTicketId) go({ kind: 'chat' })
  }, [go])

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
      // 客服在后台「解决」实时单后，后端 service_mode 仍是 live、只有 status 变 resolved
      // （2026-09-28 test 实测 CS-20260928-3713）。只认 service_mode==='ended' 会一直停在
      // 「已接入」，结束提示与评价卡都出不来 —— 与回复失败那条路径统一走 isEndedSupportTicket。
      service_mode: isEndedSupportTicket(detail)
        ? 'ended'
        : detail.service_mode === 'async'
          ? 'async'
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

  // ---- 新会话 ----
  // 丢掉当前问答上下文、从头开始（底部服务条「新会话」）。只动智能问答，不碰任何工单。
  // 优先走后端开会话接口（qa#751），让旧会话在服务端被标记结束；接口未上线（404）时
  // 退回本地换一个 session_id —— 按钮先可用，后端上线后自动切到正式接口。
  const [startingNewSession, setStartingNewSession] = useState(false)
  const startNewSession = useCallback(async () => {
    // 转人工请求在途时不许换会话：换了会让回包按代次作废 —— 后端已建的排队单成了没人看的孤儿，
    // handoffPending 也因代次对不上永远复位不了，之后再也发不起转人工（2026-09-28 补审发现）
    // 用 ref 判重入：state 在重渲染前还是旧值，快速双击会连发两次
    if (newSessionPending.current || handoffPending.current || !canStartHandoff(mode)) return
    const epoch = accountEpoch.current
    const accountId = account?.account_id ?? null
    // 每次新会话一个令牌：在途标记只由发起它的那次复位（同 handoffToken）。否则 A 切到 B 后，
    // A 的旧回包会把 B 刚发起的新会话标记清掉，B 就能在新会话在途时转人工 —— 孤儿单换了个入口又出现
    const token = ++newSessionToken.current
    const release = () => {
      if (newSessionToken.current !== token) return
      newSessionPending.current = false
      setStartingNewSession(false)
    }
    const stillSameAccount = () => epoch === accountEpoch.current && accountId === activeAccountId.current
    setStartingNewSession(true)
    newSessionPending.current = true
    let nextId: string | null = null
    try {
      nextId = (await createSupportSession(peekSupportSessionId()))?.session_id ?? null
    } catch (error) {
      if (!isNotFoundError(error)) {
        // 切号后旧账号的失败不弹到新账号界面上
        if (stillSameAccount()) appToast.requestError(error)
        // 新会话失败 → 期间被挡下的自动转人工不会再有机会发起（prd46#1171-2）。
        // 后端已判定的 human_handoff 意图此前在这条路径上彻底消失，界面上只剩一个失败的新会话。
        if (stillSameAccount() && deferredHandoff.current) {
          deferredHandoff.current = false
          appendMessage({
            id: crypto.randomUUID(),
            role: 'system',
            content: t('common.customerService.handoffRetryLater'),
            createdAt: Date.now(),
          })
        }
        release()
        return
      }
    }
    // 等回包期间切了账号：旧账号签发的 session_id 不能写给新账号（否则跨账号串问答上下文，#1057）
    if (!stillSameAccount()) {
      release()
      return
    }
    // 等回包期间若已经发起了转人工（理论上不可达：入口已被 newSessionPending 挡住，仍兜一层）
    if (handoffPending.current) {
      release()
      return
    }
    replaceSupportSessionId(nextId)
    // 会话成功换掉了：期间被挡下的自动转人工就此作废（新会话是干净的，用户重问一次即可），
    // 不再留待失败分支提示，免得下一次新会话失败时冒出一条不相关的提醒。
    // 评审 P2 提过「转人工意图被静默取消」：这里刻意不补提示 —— 「新会话」本身就是用户
    // 主动清空当前上下文的动作（下面紧接着 setMessages([])），被挡下的那次转人工正是被
    // 用户自己这个动作取消的。再补一句「转人工已取消」是噪音，不是反馈。
    deferredHandoff.current = false
    // 在途的问答回包按代次丢弃，不会晚到写进新会话
    accountEpoch.current += 1
    setIsAsking(false)
    setMessages([])
    go({ kind: 'chat' })
    trackEvent('support_new_session')
    release()
  }, [mode, go, account?.account_id, appendMessage, t])

  // ---- 反馈 ----
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)

  const submitFeedback = useCallback(async (
    fields: Omit<SupportFeedbackRequest, 'client_submission_id' | 'page_path'>,
    file?: File | null,
  ) => {
    setFeedbackSubmitting(true)
    try {
      // 先上传附件（可选）再建单：上传失败就中止，不留下「反馈已建、附件没带上」的半截状态。
      let objectRef = ''
      if (file) {
        try {
          const uploaded = await uploadSupportAttachment(file)
          objectRef = uploaded.object_ref
        } catch (error) {
          appToast.requestError(error, t('common.customerService.feedback.attachmentFailed'))
          return false
        }
      }
      const resp = await submitSupportFeedback({
        ...fields,
        client_submission_id: crypto.randomUUID(),
        page_path: currentPagePath(),
      })
      // 建单已成功：关联失败只提示、不回滚反馈（用户拿到回执比附件更重要）。
      const ticketID = resp.ticket_id || resp.ticket_no || ''
      if (file && objectRef && ticketID) {
        try {
          await attachSupportTicketAttachment(ticketID, {
            file_name: file.name,
            mime_type: file.type,
            object_ref: objectRef,
            size_bytes: file.size,
          })
        } catch (error) {
          // 上传已成功、只是关联失败：不能复用「附件上传失败」——事实不符，且按它去
          // 「重试」会再建一张不带附件的重复工单。拿不到工单号时也走这里，不拼空 id。
          appToast.requestError(error, t('common.customerService.feedback.attachmentAttachFailed'))
        }
      }
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
    setTicketDetailError(null)
    setTicketMessages([])
    setTicketMessagesLoaded(false)
    // 同步记下「最后一次打开的是哪张」：快速连点两张单时，先发的那张晚回包不能盖掉后一张。
    // 不用 activeMode 判 —— 它在 layout effect 里才同步，回包快过渲染时会误判成已离开。
    const token = ++detailRequestSeq.current
    const stillOpen = () => detailRequestSeq.current === token
    let detail: SupportTicketDetail
    try {
      detail = await getSupportTicket(id)
    } catch (error) {
      if (stillOpen()) setTicketDetailError(error)
      return
    }
    if (!stillOpen()) return
    setTicketDetail(detail)
    if (detail.ticket_type === 'human_support' || detail.type === 'handoff') {
      // 消息拉失败不挡详情：元信息照常看，气泡区为空
      listTicketMessages(id)
        .then((page) => {
          if (!stillOpen()) return
          setTicketMessages(page.items.map(toTicketChatItem))
          setTicketMessagesLoaded(true)
        })
        .catch(() => {})
    } else if (ticketUnreadOf(detail)) {
      // 问题反馈：打开详情即已读（工单类型 PRD「已读口径」）—— 新消息只会是状态变更，就在标题旁
      void markSelectedRead(id, detail)
    }
  }, [go])

  /** 把已读游标推到这张单的最新消息；失败静默（下次打开再标），不打断用户看详情。 */
  const markingRead = useRef<Set<string>>(new Set())
  // 已按哪个 seq 标过：同一张单同一 seq 只报一次。标完 setTicketDetail 会换对象、IO 重建，
  // 哨兵仍在可视区就会马上再回调；若后端未读算法不止看 seq，回包 unread 仍 >0 就会一直打 /read
  const markedSeq = useRef<Map<string, number>>(new Map())
  async function markSelectedRead(id: string, detail: SupportTicketDetail) {
    // 可视区哨兵每次重渲染都可能再报一次「看到了」，在途时不重复打接口
    const seq = detail.latest_message_seq ?? 0
    if (markingRead.current.has(id) || markedSeq.current.get(id) === seq) return
    markingRead.current.add(id)
    try {
      const fresh = await markTicketRead(id, detail.latest_message_seq ?? 0)
      // 只写回仍在显示的那张（prev.ticket_id 比对）；换号时详情整个被清空，同样写不进去
      setTicketDetail((prev) => (prev && prev.ticket_id === id ? { ...prev, ...fresh, capabilities: fresh?.capabilities ?? prev.capabilities } : prev))
      markedSeq.current.set(id, seq)
      setUnreadVersion((v) => v + 1)
    } catch { /* 静默 */ } finally {
      markingRead.current.delete(id)
    }
  }

  // 转异步：最新一条客服消息或状态变更**滚进可视区**才判已读（不是打开即已读）。
  // 由详情页的可视区哨兵回调触发；已读过 / 实时单 / 反馈单都不会走到请求。
  const markSelectedTicketSeen = useCallback(() => {
    if (mode.kind !== 'ticketDetail' || !ticketDetail || ticketDetail.ticket_id !== mode.ticketId) return
    if (!ticketUnreadOf(ticketDetail)) return
    void markSelectedRead(mode.ticketId, ticketDetail)
  }, [mode, ticketDetail])

  // 转异步详情底部的消息输入框（PRD 工单类型：转异步「底部为消息输入框」）
  const replySelectedTicket = useCallback(async (content: string): Promise<boolean> => {
    if (mode.kind !== 'ticketDetail') return false
    const targetId = mode.ticketId
    const accountId = account?.account_id ?? null
    try {
      // 回包不是一条消息：agent PostMessage 回的是 UserReply 的输出（工单 + 消息的包装），
      // 当 SupportMessage 读会拿不到 content，渲染出空气泡（2026-09-28 test 实测）。
      // 与主面板 sendHumanReply 同口径：先用用户输入上屏，成功后再按服务端列表对齐顺序与 id。
      await replyTicketMessage(targetId, content)
      if (isCurrentSupportTicket(targetId, accountId)) {
        const local: ChatItem = { id: crypto.randomUUID(), role: 'user', content, createdAt: Date.now() }
        setTicketMessages((prev) => [...prev, local])
        listTicketMessages(targetId)
          .then((page) => { if (isCurrentSupportTicket(targetId, accountId) && page.items.length > 0) setTicketMessages(page.items.map(toTicketChatItem)) })
          .catch(() => {})
      }
      return true
    } catch (error) {
      if (isCurrentSupportTicket(targetId, accountId)) appToast.requestError(error, t('common.customerService.sendFailed'))
      return false
    }
  }, [mode, account?.account_id, isCurrentSupportTicket, t])

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

  // 补充相关的详情写入只接受「同一张单、版本不低于当前」的快照：agent 每次写 version +1，
  // 所以两次提交回包颠倒、或失败后的刷新晚于紧接着那次成功重试时，旧快照不会盖掉新的
  // （否则刚补上的那条会从屏幕上消失，用户再发一次就是重复补充）。
  const applyNewerDetail = useCallback((detail: SupportTicketDetail) => {
    setTicketDetail((prev) => (
      prev && prev.ticket_id === detail.ticket_id && (prev.version ?? 0) > (detail.version ?? 0) ? prev : detail
    ))
  }, [])

  // 问题反馈「补充问题描述」（PRD §7.11）。结果交给详情页决定输入框怎么处理：
  // ok = 成功（清空收起）；failed = 失败但还能重试（保留内容）；closed = 工单已不能补充（收起）。
  // 接口成功时返回的就是补充后的详情（含 supplements），直接替换。
  const supplementSelectedTicket = useCallback(async (content: string): Promise<SupplementResult> => {
    if (mode.kind !== 'ticketDetail') return 'failed'
    const targetId = mode.ticketId
    const accountId = account?.account_id ?? null
    const stillHere = () => isCurrentSupportTicket(targetId, accountId)
    try {
      const detail = await supplementTicket(targetId, content)
      // 请求在途时用户可能已退回列表、换开了另一张单：晚到的回包不能盖掉那张单的详情，
      // 否则屏幕显示 A、后续操作却打到 B。
      if (stillHere()) applyNewerDetail(detail)
      return 'ok'
    } catch (error) {
      // 已离开这张单：输入框随详情页卸载了，「内容已保留」不成立，也别把提示弹到别的界面上。
      if (!stillHere()) return 'failed'
      const refresh = () => getSupportTicket(targetId)
        .then((fresh) => {
          if (stillHere()) applyNewerDetail(fresh)
          return fresh
        })
        .catch(() => null)
      const code = supportErrorCodeOf(error)
      if (code === 'support.invalid_transition') {
        // 同 sendHumanReply：工单状态不允许时，按刷新后的状态收口
        const fresh = await refresh()
        if (!stillHere()) return 'failed'
        if (fresh && !fresh.capabilities.can_supplement) {
          appToast.error(t('common.customerService.ticket.supplementClosed'))
          return 'closed'
        }
      } else {
        // 不等：超时的 POST 可能其实已经写进去了，刷新后那条会出现在列表里，
        // 用户就不会再点一次写出重复的补充；而按钮也不必陪着刷新再转一轮。
        void refresh()
      }
      // support.* 机器码不能原样上屏，改给 PRD 文案；其余（5xx / 超时 / 断网 / 404 / 429）
      // 交给 requestError，各有更准确的提示。
      if (code) appToast.error(t('common.customerService.ticket.supplementFailed'))
      else appToast.requestError(error, t('common.customerService.ticket.supplementFailed'))
      return 'failed'
    }
  }, [mode, account?.account_id, isCurrentSupportTicket, applyNewerDetail, t])

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
    ticketDetailError,
    ticketMessages,
    ticketMessagesLoaded,
    startNewSession,
    startingNewSession,
    handoffInFlight,
    unreadVersion,
    markSelectedTicketSeen,
    replySelectedTicket,
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
    rateEndedHandoff,
    sendHumanReply,
    feedbackSubmitting,
    submitFeedback,
    openTicketDetail,
    reopenSelectedTicket,
    rateSelectedTicket,
    supplementSelectedTicket,
  }
}

function currentPagePath() {
  if (typeof window === 'undefined') return undefined
  return `${window.location.pathname}${window.location.search}`
}
