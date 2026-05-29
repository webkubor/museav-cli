import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { appToast } from '@/lib/app-toast'
import { LuSend, LuRotateCcw, LuUser, LuBot } from 'react-icons/lu'
import { useAuthStore } from '@/store/auth'
import { listApiKeys } from '@/services/api-keys'
import { listModels } from '@/services/catalog'
import { pageItems } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  pending?: boolean
}

export default function ChatTestPage() {
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)

  const apiKeysQuery = useQuery({
    queryKey: ['api-keys', activeWorkspaceId],
    queryFn: () => listApiKeys(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
    staleTime: 60_000,
  })
  const modelsQuery = useQuery({
    queryKey: ['catalog-models'],
    queryFn: () => listModels({ limit: 100 }),
    staleTime: 5 * 60_000,
  })

  const apiKeys = pageItems(apiKeysQuery.data).filter(k => k.status === 'active')
  const models = pageItems(modelsQuery.data)

  const [selectedKey, setSelectedKey] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const baseUrl = window.location.origin.replace('console.', 'api.')

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!input.trim()) return
    if (!selectedKey) { appToast.error('请先选择 API Key'); return }
    if (!selectedModel) { appToast.error('请先选择模型'); return }

    const userMsg: ChatMessage = { role: 'user', content: input.trim() }
    const next = [...messages, userMsg]
    setMessages([...next, { role: 'assistant', content: '', pending: true }])
    setInput('')
    setStreaming(true)

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${selectedKey}`,
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: next.map(m => ({ role: m.role, content: m.content })),
          stream: true,
        }),
        signal: ctrl.signal,
      })

      if (!res.ok) {
        const err = await res.text()
        setMessages(prev => prev.slice(0, -1).concat({ role: 'assistant', content: `错误 ${res.status}: ${err}` }))
        return
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
          try {
            const json = JSON.parse(line.slice(6))
            const delta = json.choices?.[0]?.delta?.content ?? ''
            assistantContent += delta
            setMessages(prev => prev.slice(0, -1).concat({ role: 'assistant', content: assistantContent, pending: true }))
          } catch { /* skip malformed */ }
        }
      }

      setMessages(prev => prev.slice(0, -1).concat({ role: 'assistant', content: assistantContent }))
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setMessages(prev => prev.slice(0, -1).concat({ role: 'assistant', content: `请求失败: ${String(e)}` }))
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  function handleStop() {
    abortRef.current?.abort()
  }

  function handleReset() {
    abortRef.current?.abort()
    setMessages([])
    setInput('')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-[var(--semi-color-text-0)] m-0">对话测试</h1>
        <p className="text-sm text-[var(--semi-color-text-1)] mt-1.5 m-0">
          选择 API Key 和模型，实时流式测试对话效果。
        </p>
      </div>

      {/* 顶部配置栏 */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <Select
          value={selectedKey}
          onValueChange={setSelectedKey}
        >
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder={apiKeysQuery.isLoading ? "加载中..." : "选择 API Key"} />
          </SelectTrigger>
          <SelectContent>
            {apiKeys.map(k => (
              <SelectItem key={k.api_key_id} value={k.api_key_id}>
                <span className="font-semibold">{k.name}</span>
                <span className="ml-2 font-mono text-[11px] text-[var(--semi-color-text-2)]">{k.masked}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectedModel}
          onValueChange={setSelectedModel}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder={modelsQuery.isLoading ? "加载中..." : "选择模型"} />
          </SelectTrigger>
          <SelectContent>
            {models.map(m => (
              <SelectItem key={m.model_id} value={m.model_id}>
                {m.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto">
          <Button onClick={handleReset} variant="outline" disabled={streaming}>
            <LuRotateCcw size={13} className="mr-1" />
            清空对话
          </Button>
        </div>
      </div>

      {/* 对话区域 */}
      <div className="flex-1 min-h-[360px] max-h-[520px] overflow-y-auto border border-[var(--semi-color-border)] rounded-xl p-4 bg-[var(--semi-color-fill-0)] flex flex-col gap-3 mb-3">
        {messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-[var(--semi-color-text-2)] text-[13px]">
            选好 API Key 和模型后开始对话
          </div>
        ) : messages.map((msg, idx) => (
          <div key={idx} className={cn("flex gap-2.5 items-start", msg.role === 'user' ? "justify-end" : "justify-start")}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-[var(--semi-color-primary-light-default)] flex items-center justify-center shrink-0 mt-0.5 border border-[var(--semi-color-border)]">
                <LuBot size={14} className="text-[var(--semi-color-primary)]" />
              </div>
            )}
            <div className={cn(
              "max-w-[75%] px-3.5 py-2.5 text-[13px] leading-relaxed shadow-sm whitespace-pre-wrap break-words",
              msg.role === 'user'
                ? "rounded-[12px_12px_2px_12px] bg-[var(--semi-color-primary)] text-white"
                : "rounded-[12px_12px_12px_2px] bg-card-bg text-[var(--semi-color-text-0)] border border-[var(--semi-color-border)]"
            )}>
              {msg.content}
              {msg.pending && <span className="inline-block w-1.5 h-3.5 ml-1 bg-current rounded-[2px] animate-pulse vertical-align-text-bottom opacity-70" />}
            </div>
            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-[var(--semi-color-fill-0)] border border-[var(--semi-color-border)] flex items-center justify-center shrink-0 mt-0.5">
                <LuUser size={14} className="text-[var(--semi-color-text-1)]" />
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 输入区 */}
      <div className="flex gap-2 items-end">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!streaming) handleSend() } }}
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          rows={2}
          className="flex-1 rounded-[10px] resize-none h-[58px] min-h-[58px]"
          disabled={streaming}
        />
        {streaming ? (
          <Button onClick={handleStop} variant="destructive" className="h-[58px] shrink-0">停止</Button>
        ) : (
          <Button variant="brand" onClick={handleSend} className="h-[58px] px-5 rounded-[10px] shrink-0" disabled={!input.trim()}>
            <LuSend size={14} className="mr-1" />
            发送
          </Button>
        )}
      </div>

      <span className="text-[11px] text-[var(--semi-color-text-2)] mt-2">
        请求直接发往 {baseUrl}/v1/chat/completions，响应不经过控制台后端。
      </span>
    </div>
  )
}
