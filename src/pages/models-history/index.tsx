import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Spin, Tag, Typography } from '@douyinfe/semi-ui'
import { LuMessageSquare, LuChevronDown, LuChevronUp } from 'react-icons/lu'
import { listConversations, getConversation } from '@/services/agent'
import type { AgentConversation } from '@/interfaces/agent'

const { Text } = Typography

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

interface ConversationRowProps {
  conv: AgentConversation
}

function ConversationRow({ conv }: ConversationRowProps) {
  const [expanded, setExpanded] = useState(false)

  const detailQuery = useQuery({
    queryKey: ['agent', 'conversation', conv.id],
    queryFn: () => getConversation(conv.id),
    enabled: expanded,
  })

  return (
    <div style={{
      border: '1px solid var(--semi-color-border)',
      borderRadius: '10px',
      overflow: 'hidden',
      background: 'var(--semi-color-bg-0)',
    }}>
      {/* Row header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '14px 16px',
          cursor: 'pointer',
          gap: '12px',
          transition: 'background 0.1s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--semi-color-fill-0)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = '')}
      >
        <LuMessageSquare size={16} style={{ color: 'var(--semi-color-text-2)', flexShrink: 0 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 500,
            fontSize: '14px',
            color: 'var(--semi-color-text-0)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginBottom: '2px',
          }}>
            {conv.title || '无标题对话'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--semi-color-text-2)' }}>
            <span>{formatDate(conv.created_at)}</span>
            <span>·</span>
            <span>更新于 {formatDate(conv.updated_at)}</span>
          </div>
        </div>

        <Tag size="small" color="blue">{conv.message_count} 条消息</Tag>

        {expanded
          ? <LuChevronUp size={14} style={{ color: 'var(--semi-color-text-2)', flexShrink: 0 }} />
          : <LuChevronDown size={14} style={{ color: 'var(--semi-color-text-2)', flexShrink: 0 }} />
        }
      </div>

      {/* Expanded messages */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--semi-color-fill-0)' }}>
          {detailQuery.isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
              <Spin size="small" />
            </div>
          ) : detailQuery.isError ? (
            <div style={{ padding: '16px', fontSize: '13px', color: '#ef4444' }}>
              加载对话消息失败
            </div>
          ) : detailQuery.data ? (
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '360px', overflowY: 'auto' }}>
              {detailQuery.data.messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div style={{
                    maxWidth: '75%',
                    padding: '8px 12px',
                    borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                    background: msg.role === 'user'
                      ? 'var(--semi-color-primary)'
                      : 'var(--semi-color-fill-0)',
                    color: msg.role === 'user'
                      ? '#fff'
                      : 'var(--semi-color-text-0)',
                    fontSize: '13px',
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {detailQuery.data.messages.length === 0 && (
                <Text style={{ color: 'var(--semi-color-text-2)', fontSize: '13px' }}>暂无消息</Text>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default function ModelsChatHistoryPage() {
  const conversationsQuery = useQuery({
    queryKey: ['agent', 'conversations'],
    queryFn: () => listConversations({ page: 1, page_size: 50 }),
  })

  const conversations = conversationsQuery.data?.items ?? []

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--semi-color-text-0)', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
          对话历史
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', margin: 0 }}>
          浏览历史对话记录，点击展开查看完整消息。
        </p>
      </div>

      {conversationsQuery.isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
          <Spin size="large" />
        </div>
      ) : conversationsQuery.isError ? (
        <div style={{ color: '#ef4444', fontSize: '13px', padding: '24px 0' }}>加载对话历史失败，请稍后重试。</div>
      ) : conversations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0' }}>
          <LuMessageSquare size={36} style={{ color: 'var(--semi-color-text-2)', marginBottom: '12px' }} />
          <Text style={{ color: 'var(--semi-color-text-2)', fontSize: '13px', display: 'block' }}>
            暂无对话历史
          </Text>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {conversations.map((conv) => (
            <ConversationRow key={conv.id} conv={conv} />
          ))}
        </div>
      )}
    </div>
  )
}
