import { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { apiBaseUrl } from '@/lib/request'
import { injectHeaders } from '@/lib/request-headers'
import { storageKeys } from '@/lib/storage'
import type { AgentEvent } from '@/interfaces/agent'
import { stopConversation } from '@/services/agent'
import { appToast } from '@/lib/app-toast'

export interface Message {
  id: string
  role: 'user' | 'agent'
  content: string
  timestamp: number
  isError?: boolean
}

export type ConnectionStatus = 'connecting' | 'online' | 'offline'

function parseSSELine(line: string): AgentEvent | null {
  if (!line.startsWith('data:')) return null
  const raw = line.slice(5).trim()
  if (!raw || raw === '[DONE]') return null
  try {
    return JSON.parse(raw) as AgentEvent
  } catch {
    return null
  }
}

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
  const abortRef = useRef<AbortController | null>(null)
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
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

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

      const response = await fetch(url, {
        method: 'POST',
        headers: { ...Object.fromEntries(req.headers.entries()), ...extraHeaders },
        body: JSON.stringify({
          message: content.trim(),
          ...(conversationId ? { conversation_id: conversationId } : {}),
          lang: document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en',
        }),
        credentials: 'include',
        signal: controller.signal,
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const contentType = response.headers.get('Content-Type') ?? ''

      if (contentType.includes('text/event-stream')) {
        const reader = response.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let buffer = ''
        let accumulated = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const event = parseSSELine(line)
            if (!event) continue

            if (event.type === 'delta' && event.delta) {
              accumulated += event.delta
              setMessages((prev) =>
                prev.map((m) => (m.id === agentMsgId ? { ...m, content: accumulated } : m))
              )
            }
            if (event.type === 'done') {
              const final = event.answer ?? accumulated
              setMessages((prev) =>
                prev.map((m) => (m.id === agentMsgId ? { ...m, content: final } : m))
              )
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
        }
      } else {
        const json = await response.json()
        const bizCode: number = json?.code ?? 0
        if (bizCode !== 0) throw new Error(json?.msg ?? `请求失败（${bizCode}）`)
        const answer: string = json?.data?.answer ?? ''
        const cid: string = json?.data?.conversation_id ?? ''
        if (cid) {
          setConversationId(cid)
          localStorage.setItem(storageKeys.csConversationId(), cid)
        }
        setMessages((prev) =>
          prev.map((m) => (m.id === agentMsgId ? { ...m, content: answer } : m))
        )
      }

      setMessages((prev) => {
        const agentMsg = prev.find((m) => m.id === agentMsgId)
        if (agentMsg && !agentMsg.content.trim()) {
          return prev.map((m) =>
            m.id === agentMsgId ? { ...m, content: t('common.customerService.emptyReply') } : m
          )
        }
        saveMessages(prev)
        return prev
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      const msg = err instanceof Error ? err.message : t('common.customerService.sendFailed')
      setStatus('offline')
      setMessages((prev) =>
        prev.map((m) => (m.id === agentMsgId ? { ...m, content: msg, isError: true } : m))
      )
    } finally {
      setIsLoading(false)
      activeAgentMsgIdRef.current = null
    }
    // options 注入到请求头：必须进依赖，否则切换组织后 sendMessage 仍持旧闭包，
    // 会用旧 tenantId 覆盖 injectHeaders 写入的当前租户（React Compiler 要求依赖整个 options）
  }, [isLoading, conversationId, saveMessages, options, t])

  const stopMessage = useCallback(async () => {
    if (!isLoading) return

    const currentConversationId = conversationId
    const activeAgentMsgId = activeAgentMsgIdRef.current

    abortRef.current?.abort()
    setIsLoading(false)

    if (currentConversationId) {
      stopConversation(currentConversationId).catch((error) => {
        appToast.requestError(error, t('common.customerService.stopFailed'))
      })
    }

    if (!activeAgentMsgId) return

    setMessages((prev) => {
      const next = prev.map((m) =>
        m.id === activeAgentMsgId
          ? { ...m, content: m.content.trim() ? `${m.content}\n\n${t('common.customerService.stopped')}` : t('common.customerService.stopped') }
          : m
      )
      saveMessages(next)
      return next
    })
  }, [conversationId, isLoading, saveMessages, t])

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
