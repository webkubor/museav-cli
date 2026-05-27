import { useState, useCallback, useRef } from 'react'
import { apiBaseUrl } from '@/lib/request'
import { injectHeaders } from '@/lib/request-headers'
import type { AgentEvent } from '@/interfaces/agent'

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

export function useCsChat() {
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem('modelgo_cs_history')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [conversationId, setConversationId] = useState<string | null>(() =>
    localStorage.getItem('modelgo_cs_conversation_id')
  )
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState<ConnectionStatus>('online')
  const abortRef = useRef<AbortController | null>(null)
  const lastUserMessageRef = useRef<string>('')

  const saveMessages = useCallback((msgs: Message[]) => {
    try {
      localStorage.setItem('modelgo_cs_history', JSON.stringify(msgs))
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

      const response = await fetch(url, {
        method: 'POST',
        headers: req.headers,
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
                localStorage.setItem('modelgo_cs_conversation_id', cid)
              }
            }
            if (event.type === 'start') {
              const cid = event.conversation_id ?? ''
              if (cid) {
                setConversationId(cid)
                localStorage.setItem('modelgo_cs_conversation_id', cid)
              }
            }
            if (event.type === 'error') {
              throw new Error(event.error ?? '服务异常，请稍后再试')
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
          localStorage.setItem('modelgo_cs_conversation_id', cid)
        }
        setMessages((prev) =>
          prev.map((m) => (m.id === agentMsgId ? { ...m, content: answer } : m))
        )
      }

      setMessages((prev) => {
        const agentMsg = prev.find((m) => m.id === agentMsgId)
        if (agentMsg && !agentMsg.content.trim()) {
          return prev.map((m) =>
            m.id === agentMsgId ? { ...m, content: '抱歉，收到空回复，请稍后再试。' } : m
          )
        }
        saveMessages(prev)
        return prev
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      const msg = err instanceof Error ? err.message : '发送失败'
      setStatus('offline')
      setMessages((prev) =>
        prev.map((m) => (m.id === agentMsgId ? { ...m, content: msg, isError: true } : m))
      )
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, conversationId, saveMessages])

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
    localStorage.removeItem('modelgo_cs_history')
    localStorage.removeItem('modelgo_cs_conversation_id')
  }, [])

  return {
    messages,
    sendMessage,
    reconnect,
    retryLastMessage,
    clearHistory,
    status,
    isLoading,
    conversationId,
  }
}
