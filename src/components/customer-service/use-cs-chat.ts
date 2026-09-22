import { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { apiBaseUrl } from '@/lib/request'
import { injectHeaders } from '@/lib/request-headers'
import { storageKeys } from '@/lib/storage'
import type { AgentEvent } from '@/interfaces/agent'
import { stopConversation } from '@/services/agent'
import { appToast } from '@/lib/app-toast'
import { readSSE, extractHTTPError, isAbortError, patchMessageById } from 'ai-sse-kit'
import { useStreamingController } from 'ai-sse-kit/react'

export interface Message {
  id: string
  role: 'user' | 'agent'
  content: string
  timestamp: number
  isError?: boolean
}

export type ConnectionStatus = 'connecting' | 'online' | 'offline'

export interface CsChatOptions {
  source?: string
  tenantId?: string | null
}

export function useCsChat(options?: CsChatOptions) {
  const { t } = useTranslation()
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem(storageKeys.csHistory())
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [conversationId, setConversationId] = useState<string | null>(() =>
    localStorage.getItem(storageKeys.csConversationId())
  )
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState<ConnectionStatus>('online')
  // 中断编排（新一轮自动掐上一轮、卸载自动收尾）统一走 hook
  const stream = useStreamingController()
  const activeAgentMsgIdRef = useRef<string | null>(null)
  const lastUserMessageRef = useRef<string>('')

  const saveMessages = useCallback((msgs: Message[]) => {
    try {
      localStorage.setItem(storageKeys.csHistory(), JSON.stringify(msgs))
    } catch { /* ignore */ }
  }, [])

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return

    lastUserMessageRef.current = content.trim()
    const signal = stream.begin()

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
    }
    setMessages((prev) => {
      const next = [...prev, userMsg]
      saveMessages(next)
      return next
    })
    setIsLoading(true)

    const agentMsgId = crypto.randomUUID()
    activeAgentMsgIdRef.current = agentMsgId
    setMessages((prev) => [
      ...prev,
      { id: agentMsgId, role: 'agent' as const, content: '', timestamp: Date.now() },
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
            if (cid) {
              setConversationId(cid)
              localStorage.setItem(storageKeys.csConversationId(), cid)
            }
          }
          if (event.type === 'start') {
            const cid = event.conversation_id ?? ''
            if (cid) {
              setConversationId(cid)
              localStorage.setItem(storageKeys.csConversationId(), cid)
            }
          }
          if (event.type === 'error') {
            throw new Error(event.error ?? t('common.customerService.serviceError'))
          }
        }
      } else {
        // 非 SSE 降级：普通业务信封 {code, msg, data:{answer, conversation_id}}
        const json = await response.json()
        const bizCode: number = json?.code ?? 0
        // 后端 msg 缺失时的兜底文案也要跟界面语言走：原先固定中文，英文站会弹出中文报错。
        if (bizCode !== 0) throw new Error(json?.msg ?? t('common.customerService.requestFailed', { code: bizCode }))
        const answer: string = json?.data?.answer ?? ''
        const cid: string = json?.data?.conversation_id ?? ''
        if (cid) {
          setConversationId(cid)
          localStorage.setItem(storageKeys.csConversationId(), cid)
        }
        setMessages((prev) => patchMessageById(prev, agentMsgId, { content: answer }))
      }

      setMessages((prev) => {
        const agentMsg = prev.find((m) => m.id === agentMsgId)
        if (agentMsg && !agentMsg.content.trim()) {
          return patchMessageById(prev, agentMsgId, { content: t('common.customerService.emptyReply') })
        }
        saveMessages(prev)
        return prev
      })
    } catch (err) {
      if (isAbortError(err)) return
      const msg = err instanceof Error ? err.message : t('common.customerService.sendFailed')
      setStatus('offline')
      setMessages((prev) => patchMessageById(prev, agentMsgId, { content: msg, isError: true }))
    } finally {
      setIsLoading(false)
      activeAgentMsgIdRef.current = null
    }
    // options 注入到请求头：必须进依赖，否则切换组织后 sendMessage 仍持旧闭包，
    // 会用旧 tenantId 覆盖 injectHeaders 写入的当前租户（React Compiler 要求依赖整个 options）
  }, [isLoading, conversationId, saveMessages, options, t, stream])

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

    setMessages((prev) => {
      const next = patchMessageById(prev, activeAgentMsgId, (m) => ({
        content: m.content.trim() ? `${m.content}\n\n${t('common.customerService.stopped')}` : t('common.customerService.stopped'),
      }))
      saveMessages(next)
      return next
    })
  }, [conversationId, isLoading, saveMessages, t, stream])

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
    localStorage.removeItem(storageKeys.csHistory())
    localStorage.removeItem(storageKeys.csConversationId())
  }, [])

  return {
    messages,
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
