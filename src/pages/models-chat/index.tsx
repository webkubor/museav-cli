import { useState, useRef, useEffect } from 'react'
import type { KeyboardEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { appToast } from '@/lib/app-toast'
import { LuSend, LuPlus, LuMessageSquare } from 'react-icons/lu'
import { chatAgent, listConversations, getConversation } from '@/services/agent'
import type { AgentConversation } from '@/interfaces/agent'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/format-date'
import Markdown from 'react-markdown'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const PulsingDots = () => (
  <div className="flex items-center gap-1.25 py-2 px-0.5 shrink-0">
    <span className="w-1.5 h-1.5 rounded-full bg-brand-base animate-[bounce_1.4s_infinite_ease-in-out]" />
    <span className="w-1.5 h-1.5 rounded-full bg-brand-base animate-[bounce_1.4s_infinite_ease-in-out_0.2s]" style={{ animationDelay: '0.2s' }} />
    <span className="w-1.5 h-1.5 rounded-full bg-brand-base animate-[bounce_1.4s_infinite_ease-in-out_0.4s]" style={{ animationDelay: '0.4s' }} />
  </div>
)

export default function ModelsChatPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [conversationId, setConversationId] = useState<string | undefined>(undefined)
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 历史列表
  const conversationsQuery = useQuery({
    queryKey: ['agent', 'conversations'],
    queryFn: () => listConversations({ page: 1, page_size: 50 }),
    staleTime: 30_000,
  })
  const conversations = conversationsQuery.data?.items ?? []

  // 发送消息
  const chatMutation = useMutation({
    mutationFn: (message: string) =>
      chatAgent({ message, conversation_id: conversationId }),
    onSuccess: (data) => {
      if (data.conversation_id) setConversationId(data.conversation_id)
      setMessages((prev) => [...prev, { role: 'assistant', content: data.answer }])
      qc.invalidateQueries({ queryKey: ['agent', 'conversations'] })
    },
    onError: () => appToast.error(t('modelsChat.toast.sendError')),
  })

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

  function handleSend() {
    const text = input.trim()
    if (!text || chatMutation.isPending) return
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setInput('')
    chatMutation.mutate(text)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  function handleNewConversation() {
    setMessages([])
    setConversationId(undefined)
    setActiveConvId(null)
    setInput('')
  }

  function handleSelectConversation(conv: AgentConversation) {
    setActiveConvId(conv.id)
    setConversationId(conv.id)
    getConversation(conv.id).then((detail) => {
      setMessages(detail.messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })))
    })
  }

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[500px] gap-4">
      {/* 左侧：历史列表 */}
      <div className="w-[260px] shrink-0 flex flex-col bg-mg-fill-0 border border-mg-border rounded-md overflow-hidden">
        <div className="p-3 border-b border-mg-border/50 flex items-center justify-between shrink-0">
          <span className="text-[12px] font-bold text-mg-text-1">{t('modelsChat.history')}</span>
          <button
            onClick={handleNewConversation}
            className="p-1.5 rounded-md text-mg-text-3 hover:text-brand-base hover:bg-brand-base/5 transition-colors cursor-pointer"
            title={t('modelsChat.button.new')}
          >
            <LuPlus size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversationsQuery.isLoading ? (
            <div className="py-8 flex justify-center">
              <div className="w-5 h-5 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="py-10 text-center text-[11px] text-mg-text-3">{t('modelsHistory.empty')}</div>
          ) : (
            <div className="p-1.5 space-y-0.5">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded-lg transition-colors cursor-pointer',
                    activeConvId === conv.id
                      ? 'bg-brand-base/10 text-brand-base'
                      : 'text-mg-text-2 hover:bg-mg-fill-0',
                  )}
                >
                  <div className="text-[12px] font-semibold truncate leading-tight">
                    {conv.title || t('modelsHistory.noTitle')}
                  </div>
                  <div className="text-[10px] text-mg-text-3 mt-1">{formatDateTime(conv.updated_at)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 右侧：对话区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 消息区 */}
        <div className={cn(
          'flex-1 overflow-y-auto p-4 bg-mg-fill-0/30 border border-mg-border rounded-md mb-3 flex flex-col gap-3',
          messages.length === 0 && 'justify-center',
        )}>
          {messages.length === 0 && !chatMutation.isPending && (
            <div className="flex flex-col items-center justify-center text-center">
              <LuMessageSquare size={28} className="text-mg-text-3 mb-3" />
              <p className="text-sm font-semibold text-mg-text-1 mb-1">{t('modelsChat.title')}</p>
              <p className="text-[12px] text-mg-text-3">{t('modelsChat.empty')}</p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
              <div className={cn(
                'max-w-[72%] px-3.5 py-2.5 text-sm leading-relaxed shadow-sm break-words',
                msg.role === 'user'
                  ? 'rounded-[14px_14px_4px_14px] bg-[var(--mg-primary)] text-white whitespace-pre-wrap'
                  : 'rounded-[14px_14px_14px_4px] bg-card-bg text-mg-text-1',
              )}>
                {msg.role === 'user' ? msg.content : <div className="cs-markdown"><Markdown>{msg.content}</Markdown></div>}
              </div>
            </div>
          ))}

          {chatMutation.isPending && (
            <div className="flex justify-start animate-in fade-in duration-200">
              <div className="px-3.5 py-2.5 rounded-[14px_14px_14px_4px] bg-card-bg shadow-sm flex items-center gap-2.5">
                <PulsingDots />
                <span className="text-mg-text-3 text-[13px]">{t('modelsChat.thinking')}</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* 输入区 */}
        <div className="flex gap-2.5 items-end shrink-0">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('modelsChat.input.placeholder')}
            rows={1}
            className="flex-1 rounded-md resize-none min-h-[44px] h-[44px] py-3.5 transition-[height] duration-150 ease-out scrollbar-none"
            disabled={chatMutation.isPending}
          />
          <Button
            variant="brand"
            onClick={handleSend}
            loading={chatMutation.isPending}
            disabled={!input.trim() || chatMutation.isPending}
            className="h-[44px] w-[44px] rounded-md p-0 flex items-center justify-center shrink-0 transition-transform active:scale-95"
          >
            {!chatMutation.isPending && <LuSend size={15} />}
          </Button>
        </div>
      </div>
    </div>
  )
}
