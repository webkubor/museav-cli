import { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { apiBaseUrl } from '@/lib/request'
import { injectHeaders } from '@/lib/request-headers'
import type { AgentEvent } from '@/interfaces/agent'
import type { SupportAnswerRatingValue, SupportHumanRatingValue } from '@/interfaces/support'
import { stopConversation } from '@/services/agent'
import { rateAssistantAnswer } from '@/services/support'
import { useAuthStore } from '@/store/auth'
import { appToast } from '@/lib/app-toast'
import { readSSE, extractHTTPError, isAbortError, patchMessageById } from 'ai-sse-kit'
import { useStreamingController } from 'ai-sse-kit/react'
import type { FeedbackReceipt } from './feedback'
import type { AsyncTicketCardData } from './cards/AsyncTicketCard'
import type { HumanRatingStatus } from './cards/HumanRatingCard'
import { supportTrack } from './support-track'

/**
 * 消息流里的三种卡片（PRD §7.5 回执、§7.6.1 转异步、§7.7 五星评价）。
 * 卡片是消息流的一等成员而不是浮层 —— PRD 明确「不使用弹窗、抽屉或独立页面」。
 */
export type SupportMessageCard =
  | { kind: 'feedback-receipt'; receipt: FeedbackReceipt }
  | { kind: 'async-ticket'; data: AsyncTicketCardData }
  | {
      kind: 'human-rating'
      ticketId: string
      agentLabel: string | null
      rating?: SupportHumanRatingValue
      status: HumanRatingStatus
    }

export interface Message {
  id: string
  /**
   * · user         用户
   * · assistant    智能助手（走 /agent/chat 的流式回答，**只有它挂点赞点踩**）
   * · human-agent  人工客服（§7.4：人工消息不显示点赞点踩）
   * · system       前端本地生成的系统提示与卡片，不经 /agent/chat、也不参与上下文
   */
  role: 'user' | 'assistant' | 'human-agent' | 'system'
  content: string
  timestamp: number
  isError?: boolean
  /** 智能回答的点赞点踩（§7.4）：互斥、会话内可改判 */
  rating?: SupportAnswerRatingValue
  /** 有值时该条消息渲染成卡片而非气泡 */
  card?: SupportMessageCard
  /** 服务端消息 id；点赞点踩上行要用它，拿不到就只改本地 */
  serverMessageId?: string
}

export type ConnectionStatus = 'connecting' | 'online' | 'offline'

export interface CsChatOptions {
  source?: string
  tenantId?: string | null
}

export function useCsChat(options?: CsChatOptions) {
  const { t } = useTranslation()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  /**
   * 会话与消息只在内存里。
   *
   * 技术方案 §7.1「数据来源」明确：localStorage 只保留未发送草稿、已选附件与面板展开
   * 状态，**对话历史与未读数不再本地长期缓存**，退出登录或切换账号时一起清除。
   * 这既是 PRD §9 的隐私口径，也修掉了旧实现把整段对话写进 localStorage 导致的多端不一致。
   *
   * PRD §8 要的「关闭面板再打开保留消息」由组件常挂载 + 内存 state 满足；
   * 刷新页面属于新的页面会话，不承诺保留。
   */
  const [messages, setMessages] = useState<Message[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState<ConnectionStatus>('online')
  // 中断编排（新一轮自动掐上一轮、卸载自动收尾）统一走 hook
  const stream = useStreamingController()
  const activeAgentMsgIdRef = useRef<string | null>(null)
  const lastUserMessageRef = useRef<string>('')

  /**
   * §8：退出登录、会话失效或切换账号后清空智能问答会话与私有上下文。
   *
   * 用「渲染期按变化调整 state」而不是 useEffect —— 后者要在 effect 里同步 setState，
   * 会多渲染一帧并被 react-hooks/set-state-in-effect 判为级联渲染；这个写法是 React
   * 官方对「prop 变了要重置 state」的推荐解法，清空在同一次渲染内完成。
   */
  const [authSnapshot, setAuthSnapshot] = useState(isAuthenticated)
  if (authSnapshot !== isAuthenticated) {
    setAuthSnapshot(isAuthenticated)
    if (!isAuthenticated) {
      setMessages([])
      setConversationId(null)
    }
  }

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return

    lastUserMessageRef.current = content.trim()
    const askedAt = Date.now()
    const signal = stream.begin()

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, userMsg])
    setIsLoading(true)

    const agentMsgId = crypto.randomUUID()
    activeAgentMsgIdRef.current = agentMsgId
    setMessages((prev) => [
      ...prev,
      { id: agentMsgId, role: 'assistant' as const, content: '', timestamp: Date.now() },
    ])

    try {
      const url = `${apiBaseUrl()}/api/v1/agent/chat`
      const req = new Request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      })
      injectHeaders(req)

      const extraHeaders: Record<string, string> = {}
      if (options?.source) extraHeaders['X-Source'] = options.source
      if (options?.tenantId) extraHeaders['X-Tenant-Id'] = options.tenantId

      // 同一 URL 可能返回 SSE 或降级 JSON：先 fetch 拿响应判断 Content-Type，
      // 再决定走 readSSE 分帧还是 JSON。所以这里不用 streamSSE 一体化函数。
      const response = await fetch(url, {
        method: 'POST',
        headers: { ...Object.fromEntries(req.headers.entries()), ...extraHeaders },
        body: JSON.stringify({
          message: content.trim(),
          ...(conversationId ? { conversation_id: conversationId } : {}),
          lang: document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en',
        }),
        credentials: 'include',
        signal,
      })

      if (!response.ok) throw await extractHTTPError(response)

      const contentType = response.headers.get('Content-Type') ?? ''

      // 自研协议：每帧 data 是 {type, delta?, conversation_id?, answer?, error?}，
      // type 区分 start/delta/done/error。conversation_id 和最终 answer 要从帧里提取，
      // 超出适配器（只 yield delta）能力，所以直接用底层 readSSE 自己分流。
      if (contentType.includes('text/event-stream')) {
        let accumulated = ''
        for await (const sse of readSSE(response)) {
          let event: AgentEvent
          try {
            event = JSON.parse(sse.data) as AgentEvent
          } catch {
            continue
          }

          if (event.type === 'delta' && event.delta) {
            accumulated += event.delta
            setMessages((prev) => patchMessageById(prev, agentMsgId, { content: accumulated }))
          }
          if (event.type === 'done') {
            const final = event.answer ?? accumulated
            setMessages((prev) => patchMessageById(prev, agentMsgId, { content: final }))
            const cid = event.conversation_id ?? ''
            if (cid) setConversationId(cid)
          }
          if (event.type === 'start') {
            const cid = event.conversation_id ?? ''
            if (cid) setConversationId(cid)
          }
          if (event.type === 'error') {
            throw new Error(event.error ?? t('common.customerService.serviceError'))
          }
        }
      } else {
        // 非 SSE 降级：普通业务信封 {code, msg, data:{answer, conversation_id}}
        const json = await response.json()
        const bizCode: number = json?.code ?? 0
        if (bizCode !== 0) throw new Error(json?.msg ?? t('common.customerService.sendFailed'))
        const answer: string = json?.data?.answer ?? ''
        const cid: string = json?.data?.conversation_id ?? ''
        if (cid) setConversationId(cid)
        setMessages((prev) => patchMessageById(prev, agentMsgId, { content: answer }))
      }

      let answerStatus: 'ok' | 'empty' = 'ok'
      setMessages((prev) => {
        const agentMsg = prev.find((m) => m.id === agentMsgId)
        if (agentMsg && !agentMsg.content.trim()) {
          answerStatus = 'empty'
          return patchMessageById(prev, agentMsgId, { content: t('common.customerService.emptyReply') })
        }
        return prev
      })
      supportTrack.answerRender({ status: answerStatus, durationMs: Date.now() - askedAt })
    } catch (err) {
      if (isAbortError(err)) {
        supportTrack.answerRender({ status: 'stopped', durationMs: Date.now() - askedAt })
        return
      }
      const msg = err instanceof Error ? err.message : t('common.customerService.sendFailed')
      setStatus('offline')
      setMessages((prev) => patchMessageById(prev, agentMsgId, { content: msg, isError: true }))
      supportTrack.answerRender({ status: 'error', durationMs: Date.now() - askedAt })
    } finally {
      setIsLoading(false)
      activeAgentMsgIdRef.current = null
    }
    // options 注入到请求头：必须进依赖，否则切换组织后 sendMessage 仍持旧闭包，
    // 会用旧 tenantId 覆盖 injectHeaders 写入的当前租户（React Compiler 要求依赖整个 options）
  }, [isLoading, conversationId, options, t, stream])

  const stopMessage = useCallback(async () => {
    if (!isLoading) return

    const currentConversationId = conversationId
    const activeAgentMsgId = activeAgentMsgIdRef.current

    stream.abort()
    setIsLoading(false)

    if (currentConversationId) {
      stopConversation(currentConversationId).catch((error) => {
        appToast.requestError(error, t('common.customerService.stopFailed'))
      })
    }

    if (!activeAgentMsgId) return

    setMessages((prev) => patchMessageById(prev, activeAgentMsgId, (m) => ({
      content: m.content.trim() ? `${m.content}\n\n${t('common.customerService.stopped')}` : t('common.customerService.stopped'),
    })))
  }, [conversationId, isLoading, t, stream])

  /**
   * 追加一条本地生成的消息（系统提示与三种卡片）。
   * 不触发任何请求，也不改 conversationId —— 它们是前端产物，不是助手回答。
   */
  const appendLocalMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message])
  }, [])

  /** 就地更新一条消息（卡片状态流转用，如五星评价 pending → submitted） */
  const patchLocalMessage = useCallback((id: string, patch: Partial<Message>) => {
    setMessages((prev) => patchMessageById(prev, id, patch))
  }, [])

  /**
   * 智能回答点赞点踩（§7.4）。
   * 先改本地给即时反馈，再上行；上行失败回滚本地选择并静默 ——
   * 评价不是用户的目标动作，为它弹错只会打断对话。
   */
  const rateMessage = useCallback(async (id: string, rating: SupportAnswerRatingValue | undefined) => {
    let serverMessageId: string | undefined
    let previous: SupportAnswerRatingValue | undefined
    setMessages((prev) => {
      const target = prev.find((m) => m.id === id)
      serverMessageId = target?.serverMessageId
      previous = target?.rating
      return patchMessageById(prev, id, { rating })
    })
    if (!serverMessageId) return
    try {
      await rateAssistantAnswer(serverMessageId, rating ?? null)
    } catch {
      setMessages((prev) => patchMessageById(prev, id, { rating: previous }))
    }
  }, [])

  const reconnect = useCallback(() => {
    setStatus('online')
  }, [])

  const retryLastMessage = useCallback(() => {
    if (lastUserMessageRef.current && !isLoading) {
      sendMessage(lastUserMessageRef.current)
    }
  }, [sendMessage, isLoading])

  const clearHistory = useCallback(() => {
    setMessages([])
    setConversationId(null)
  }, [])

  return {
    messages,
    appendLocalMessage,
    patchLocalMessage,
    rateMessage,
    sendMessage,
    stopMessage,
    reconnect,
    retryLastMessage,
    clearHistory,
    status,
    isLoading,
    conversationId,
  }
}
