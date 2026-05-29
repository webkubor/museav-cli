import { useState, useRef, useEffect } from 'react'
import type { KeyboardEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { appToast } from '@/lib/app-toast'
import { LuSend, LuPlus } from 'react-icons/lu'
import { chatAgent } from '@/services/agent'
import { cn } from '@/lib/utils'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const Spinner = () => (
  <svg className="animate-spin text-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
)

export default function ModelsChatPage() {
  const { t } = useTranslation()
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
      appToast.error(t('modelsChat.toast.sendError'))
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
    <div className="flex flex-col h-[600px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-[var(--mg-text-0)] m-0 mb-1 tracking-tight">
            {t('modelsChat.title')}
          </h1>
          <p className="text-[13px] text-[var(--mg-text-1)] m-0">
            {t('modelsChat.desc')}
          </p>
        </div>
        <Button
          onClick={handleNewConversation}
          variant="secondary"
          size="sm"
        >
          <LuPlus size={14} className="mr-1" />
          {t('modelsChat.button.new')}
        </Button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 bg-[var(--mg-fill-0)] border border-[var(--mg-border)] rounded-xl mb-4 flex flex-col gap-3">
        {messages.length === 0 && !chatMutation.isPending && (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-[var(--mg-text-2)] text-[13px]">
              {t('modelsChat.empty')}
            </span>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={cn(
              "max-w-[72%] px-3.5 py-2.5 text-sm leading-relaxed shadow-sm whitespace-pre-wrap break-words",
              msg.role === 'user'
                ? "rounded-[14px_14px_4px_14px] bg-[var(--mg-primary)] text-white"
                : "rounded-[14px_14px_14px_4px] bg-card-bg text-[var(--mg-text-0)]"
            )}>
              {msg.content}
            </div>
          </div>
        ))}

        {chatMutation.isPending && (
          <div className="flex justify-start">
            <div className="px-3.5 py-2.5 rounded-[14px_14px_14px_4px] bg-card-bg shadow-sm flex items-center gap-2">
              <Spinner />
              <span className="text-[var(--mg-text-2)] text-[13px]">{t('modelsChat.thinking')}</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="flex gap-2.5 items-end shrink-0">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('modelsChat.input.placeholder')}
          rows={2}
          className="flex-1 rounded-[10px] resize-none"
          disabled={chatMutation.isPending}
        />
        <Button
          variant="brand"
          onClick={handleSend}
          loading={chatMutation.isPending}
          disabled={!input.trim() || chatMutation.isPending}
          className="h-[58px] w-[58px] rounded-[10px] p-0 flex items-center justify-center"
        >
          {!chatMutation.isPending && <LuSend size={16} />}
        </Button>
      </div>
    </div>
  )
}
