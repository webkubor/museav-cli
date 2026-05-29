import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/Badge'
import { LuMessageSquare, LuChevronDown, LuChevronUp } from 'react-icons/lu'
import { listConversations, getConversation } from '@/services/agent'
import type { AgentConversation } from '@/interfaces/agent'
import { cn } from '@/lib/utils'

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

interface ConversationRowProps {
  conv: AgentConversation
}

function ConversationRow({ conv }: ConversationRowProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const detailQuery = useQuery({
    queryKey: ['agent', 'conversation', conv.id],
    queryFn: () => getConversation(conv.id),
    enabled: expanded,
  })

  return (
    <div className="border border-[var(--mg-border)] rounded-xl overflow-hidden bg-card-bg shadow-sm">
      {/* Row header */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center p-3.5 px-4 cursor-pointer gap-3 hover:bg-[var(--mg-fill-0)] transition-colors duration-150"
      >
        <LuMessageSquare size={16} className="text-[var(--mg-text-2)] shrink-0" />

        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-[var(--mg-text-0)] truncate mb-0.5">
            {conv.title || t('modelsHistory.noTitle')}
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--mg-text-2)]">
            <span>{formatDate(conv.created_at)}</span>
            <span>·</span>
            <span>{t('modelsHistory.updatedAt', { time: formatDate(conv.updated_at) })}</span>
          </div>
        </div>

        <Badge variant="info" className="py-0.5 px-2.5">{t('modelsHistory.messageCount', { count: conv.message_count })}</Badge>

        {expanded
          ? <LuChevronUp size={14} className="text-[var(--mg-text-2)] shrink-0" />
          : <LuChevronDown size={14} className="text-[var(--mg-text-2)] shrink-0" />
        }
      </div>

      {/* Expanded messages */}
      {expanded && (
        <div className="border-t border-[var(--mg-border)]">
          {detailQuery.isLoading ? (
            <div className="flex justify-center p-6">
              <Spinner />
            </div>
          ) : detailQuery.isError ? (
            <div className="p-4 text-[13px] text-[var(--mg-danger)]">
              {t('modelsHistory.error.loadDetail')}
            </div>
          ) : detailQuery.data ? (
            <div className="p-4 flex flex-col gap-2 max-h-[360px] overflow-y-auto">
              {detailQuery.data.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={cn(
                    "max-w-[75%] px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words shadow-sm",
                    msg.role === 'user'
                      ? "rounded-[12px_12px_4px_12px] bg-[var(--mg-primary)] text-white"
                      : "rounded-[12px_12px_12px_4px] bg-[var(--mg-fill-0)] text-[var(--mg-text-0)]"
                  )}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {detailQuery.data.messages.length === 0 && (
                <span className="text-[var(--mg-text-2)] text-[13px]">{t('modelsHistory.noMessages')}</span>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

const Spinner = () => (
  <svg className="animate-spin text-current h-6 w-6 text-[var(--brand-base)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
)

export default function ModelsChatHistoryPage() {
  const { t } = useTranslation()
  const conversationsQuery = useQuery({
    queryKey: ['agent', 'conversations'],
    queryFn: () => listConversations({ page: 1, page_size: 50 }),
  })

  const conversations = conversationsQuery.data?.items ?? []

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-[var(--mg-text-0)] m-0 mb-1.5 tracking-tight">
          {t('modelsHistory.title')}
        </h1>
        <p className="text-[13px] text-[var(--mg-text-1)] m-0">
          {t('modelsHistory.desc')}
        </p>
      </div>

      {conversationsQuery.isLoading ? (
        <div className="flex justify-center items-center h-[200px]">
          <Spinner />
        </div>
      ) : conversationsQuery.isError ? (
        <div className="text-[var(--mg-danger)] text-[13px] py-6">{t('modelsHistory.error.load')}</div>
      ) : conversations.length === 0 ? (
        <div className="text-center py-16">
          <LuMessageSquare size={36} className="text-[var(--mg-text-2)] mx-auto mb-3" />
          <span className="text-[var(--mg-text-2)] text-[13px] block">
            {t('modelsHistory.empty')}
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {conversations.map((conv) => (
            <ConversationRow key={conv.id} conv={conv} />
          ))}
        </div>
      )}
    </div>
  )
}
