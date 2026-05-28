import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Select, Toast, Typography } from '@douyinfe/semi-ui'
import { LuSend, LuRotateCcw, LuUser, LuBot } from 'react-icons/lu'
import { useAuthStore } from '@/store/auth'
import { listApiKeys } from '@/services/api-keys'
import { listModels } from '@/services/catalog'
import { pageItems } from '@/lib/utils'

const { Text } = Typography

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
    if (!selectedKey) { Toast.warning('请先选择 API Key'); return }
    if (!selectedModel) { Toast.warning('请先选择模型'); return }

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--semi-color-text-0)', margin: 0 }}>对话测试</h1>
        <p style={{ fontSize: '14px', color: 'var(--semi-color-text-1)', margin: '6px 0 0' }}>
          选择 API Key 和模型，实时流式测试对话效果。
        </p>
      </div>

      {/* 顶部配置栏 */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Select
          value={selectedKey}
          onChange={(v) => setSelectedKey(v as string)}
          placeholder="选择 API Key"
          style={{ width: '240px' }}
          loading={apiKeysQuery.isLoading}
        >
          {apiKeys.map(k => (
            <Select.Option key={k.api_key_id} value={k.api_key_id}>
              <span style={{ fontWeight: 600 }}>{k.name}</span>
              <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: '11px', color: 'var(--semi-color-text-2)' }}>{k.masked}</span>
            </Select.Option>
          ))}
        </Select>

        <Select
          value={selectedModel}
          onChange={(v) => setSelectedModel(v as string)}
          placeholder="选择模型"
          style={{ width: '220px' }}
          loading={modelsQuery.isLoading}
        >
          {models.map(m => (
            <Select.Option key={m.model_id} value={m.model_id}>
              {m.display_name}
            </Select.Option>
          ))}
        </Select>

        <div style={{ marginLeft: 'auto' }}>
          <Button icon={<LuRotateCcw size={13} />} onClick={handleReset} disabled={streaming}>清空对话</Button>
        </div>
      </div>

      {/* 对话区域 */}
      <div style={{
        flex: 1,
        minHeight: '360px',
        maxHeight: '520px',
        overflowY: 'auto',
        border: '1px solid var(--semi-color-fill-1)',
        borderRadius: '12px',
        padding: '16px',
        backgroundColor: 'var(--semi-color-fill-0)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        marginBottom: '12px',
      }}>
        {messages.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--semi-color-text-3)', fontSize: '13px' }}>
            选好 API Key 和模型后开始对话
          </div>
        ) : messages.map((msg, idx) => (
          <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {msg.role === 'assistant' && (
              <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: 'var(--semi-color-primary-light-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                <LuBot size={14} style={{ color: 'var(--semi-color-primary)' }} />
              </div>
            )}
            <div style={{
              maxWidth: '75%',
              padding: '10px 14px',
              borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
              backgroundColor: msg.role === 'user' ? 'var(--semi-color-primary)' : 'var(--semi-color-bg-0)',
              color: msg.role === 'user' ? '#fff' : 'var(--semi-color-text-0)',
              fontSize: '13px',
              lineHeight: 1.6,
              border: msg.role === 'assistant' ? '1px solid var(--semi-color-fill-1)' : 'none',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {msg.content}
              {msg.pending && <span style={{ display: 'inline-block', width: 6, height: 14, marginLeft: 4, backgroundColor: 'currentColor', borderRadius: 2, animation: 'blink 1s step-end infinite', verticalAlign: 'text-bottom', opacity: 0.7 }} />}
            </div>
            {msg.role === 'user' && (
              <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: 'var(--semi-color-fill-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                <LuUser size={14} style={{ color: 'var(--semi-color-text-1)' }} />
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 输入区 */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!streaming) handleSend() } }}
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          rows={2}
          style={{
            flex: 1,
            fontFamily: 'inherit',
            fontSize: '13px',
            padding: '10px 14px',
            borderRadius: '10px',
            border: '1px solid var(--semi-color-fill-1)',
            backgroundColor: 'var(--semi-color-bg-0)',
            color: 'var(--semi-color-text-0)',
            resize: 'none',
            outline: 'none',
            lineHeight: 1.6,
          }}
          disabled={streaming}
        />
        {streaming ? (
          <Button onClick={handleStop} style={{ alignSelf: 'flex-end' }}>停止</Button>
        ) : (
          <Button theme="solid" type="primary" icon={<LuSend size={14} />} onClick={handleSend} style={{ alignSelf: 'flex-end' }} disabled={!input.trim()}>
            发送
          </Button>
        )}
      </div>

      <Text style={{ fontSize: '11px', color: 'var(--semi-color-text-3)', marginTop: '8px' }}>
        请求直接发往 {baseUrl}/v1/chat/completions，响应不经过控制台后端。
      </Text>

      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </div>
  )
}
