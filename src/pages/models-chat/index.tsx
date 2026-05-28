import { useState, useRef, useEffect } from 'react'
import type { KeyboardEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, TextArea, Toast, Spin, Typography } from '@douyinfe/semi-ui'
import { LuSend, LuPlus } from 'react-icons/lu'
import { chatAgent } from '@/services/agent'

const { Text } = Typography

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function ModelsChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [conversationId, setConversationId] = useState<string | undefined>(undefined)
  const bottomRef = useRef<HTMLDivElement>(null)

  const chatMutation = useMutation({
    mutationFn: (message: string) =>
      chatAgent({ message, conversation_id: conversationId }),
    onSuccess: (data) => {
      if (data.conversation_id) {
        setConversationId(data.conversation_id)
      }
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.answer },
      ])
    },
    onError: () => {
      Toast.error('发送失败，请稍后重试')
    },
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    const text = input.trim()
    if (!text || chatMutation.isPending) return

    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setInput('')
    chatMutation.mutate(text)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleNewConversation = () => {
    setMessages([])
    setConversationId(undefined)
    setInput('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '600px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '20px',
        flexShrink: 0,
      }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--semi-color-text-0)', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>
            对话
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', margin: 0 }}>
            与 ModelGo Agent 进行对话。
          </p>
        </div>
        <Button
          icon={<LuPlus size={14} />}
          onClick={handleNewConversation}
          theme="light"
          size="small"
        >
          新对话
        </Button>
      </div>

      {/* Messages area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        background: 'var(--semi-color-fill-0)',
        borderRadius: '12px',
        marginBottom: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}>
        {messages.length === 0 && !chatMutation.isPending && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: 'var(--semi-color-text-2)', fontSize: '13px' }}>
              发送消息开始对话
            </Text>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div style={{
              maxWidth: '72%',
              padding: '10px 14px',
              borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              background: msg.role === 'user'
                ? 'var(--semi-color-primary)'
                : 'var(--semi-color-bg-0)',
              color: msg.role === 'user'
                ? '#fff'
                : 'var(--semi-color-text-0)',
              fontSize: '14px',
              lineHeight: '1.6',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {chatMutation.isPending && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              padding: '10px 14px',
              borderRadius: '14px 14px 14px 4px',
              background: 'var(--semi-color-bg-0)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <Spin size="small" />
              <Text style={{ color: 'var(--semi-color-text-2)', fontSize: '13px' }}>思考中...</Text>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{
        display: 'flex',
        gap: '10px',
        alignItems: 'flex-end',
        flexShrink: 0,
      }}>
        <TextArea
          value={input}
          onChange={(v) => setInput(v)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息，Enter 发送，Shift+Enter 换行..."
          rows={2}
          style={{
            flex: 1,
            borderRadius: '10px',
            resize: 'none',
          }}
          disabled={chatMutation.isPending}
        />
        <Button
          icon={<LuSend size={16} />}
          theme="solid"
          type="primary"
          onClick={handleSend}
          loading={chatMutation.isPending}
          disabled={!input.trim() || chatMutation.isPending}
          style={{ height: '58px', width: '58px', borderRadius: '10px', padding: 0 }}
        />
      </div>
    </div>
  )
}
