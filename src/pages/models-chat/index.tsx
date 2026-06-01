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

// 极其精致的弹性起伏三点思考态
const PulsingDots = () => (
  <div className="flex items-center gap-1.25 py-2 px-0.5 shrink-0">
    <span className="w-1.5 h-1.5 rounded-full bg-brand-base animate-[bounce_1.4s_infinite_ease-in-out]" />
    <span className="w-1.5 h-1.5 rounded-full bg-brand-base animate-[bounce_1.4s_infinite_ease-in-out_0.2s]" style={{ animationDelay: '0.2s' }} />
    <span className="w-1.5 h-1.5 rounded-full bg-brand-base animate-[bounce_1.4s_infinite_ease-in-out_0.4s]" style={{ animationDelay: '0.4s' }} />
  </div>
)

export default function ModelsChatPage() {
  const { t } = useTranslation()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [conversationId, setConversationId] = useState<string | undefined>(undefined)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  // 输入框自适应弹性长高控制
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`
    }
  }, [input])

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
      <div className={cn(
        "flex-1 overflow-y-auto p-4 bg-[var(--mg-fill-0)] border border-[var(--mg-border)] rounded-xl mb-4 flex flex-col gap-3",
        messages.length === 0 && "justify-center"
      )}>
        {messages.length === 0 && !chatMutation.isPending && (
          <div className="flex flex-col items-center justify-center p-6 text-center max-w-[480px] mx-auto animate-in fade-in duration-500">
            <div className="w-11 h-11 rounded-2xl bg-brand-selected-bg flex items-center justify-center text-brand-base mb-4 shadow-sm border border-brand-glow">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-[var(--mg-text-0)] mb-1 tracking-tight">
              {t('modelsChat.title')}
            </h3>
            <p className="text-[13px] text-[var(--mg-text-2)] mb-8 max-w-[320px] leading-relaxed">
              {t('modelsChat.desc')}
            </p>
            
            <div className="w-full flex flex-col gap-2 text-left">
              <span className="text-[10px] font-bold tracking-widest text-[var(--mg-text-2)] uppercase pl-1">
                {t('modelsChat.suggestion.title')}
              </span>
              <div className="grid grid-cols-1 gap-2">
                {[1, 2, 3].map((num) => {
                  const key = `s${num}` as 's1' | 's2' | 's3'
                  const promptText = t(`modelsChat.suggestion.${key}`)
                  return (
                    <button
                      key={num}
                      onClick={() => {
                        setInput(promptText)
                        textareaRef.current?.focus()
                      }}
                      className="w-full p-3.5 rounded-xl border border-[var(--mg-border)] bg-card-bg hover:bg-[var(--mg-fill-0)] hover:border-brand-mid/40 hover:shadow-sm text-[13px] text-[var(--mg-text-1)] hover:text-[var(--mg-text-0)] transition-all duration-200 text-left cursor-pointer relative overflow-hidden group active:scale-[0.99] active:duration-100"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="line-clamp-2 pr-4">{promptText}</span>
                        <svg className="w-4 h-4 text-[var(--mg-text-2)] group-hover:text-brand-base group-hover:translate-x-0.5 transition-all shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out`}
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
          <div className="flex justify-start animate-in fade-in duration-200">
            <div className="px-3.5 py-2.5 rounded-[14px_14px_14px_4px] bg-card-bg shadow-sm flex items-center gap-2.5">
              <PulsingDots />
              <span className="text-[var(--mg-text-2)] text-[13px]">{t('modelsChat.thinking')}</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="flex gap-2.5 items-end shrink-0">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('modelsChat.input.placeholder')}
          rows={1}
          className="flex-1 rounded-xl resize-none min-h-[44px] h-[44px] py-3.5 transition-[height] duration-150 ease-out scrollbar-none"
          disabled={chatMutation.isPending}
        />
        <Button
          variant="brand"
          onClick={handleSend}
          loading={chatMutation.isPending}
          disabled={!input.trim() || chatMutation.isPending}
          className="h-[44px] w-[44px] rounded-xl p-0 flex items-center justify-center shrink-0 transition-transform active:scale-95"
        >
          {!chatMutation.isPending && <LuSend size={15} />}
        </Button>
      </div>
    </div>
  )
}
