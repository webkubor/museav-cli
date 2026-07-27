/**
 * 消息列表渲染（单模型页 / 对比页每列共用），从 index.tsx 抽出避免重复。
 * 逐字对齐原型 App.tsx:20470-20510 的 playground-message 结构。
 */
import { useState } from 'react'
import Markdown from 'react-markdown'
import { LuCheck, LuCopy } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { formatPlaygroundSpend, type ExperienceMessage } from '../model-experience-data'

/** 复制回复内容按钮，逐字对齐原型 App.tsx:20475-20481/20504-20508（复制态 1.6s 后复位） */
function MessageCopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="models-experience-icon-btn"
      aria-label="复制回复内容"
      title="复制回复内容"
      onClick={() => {
        void navigator.clipboard?.writeText(content)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1600)
      }}
    >
      {copied ? <LuCheck size={12} /> : <LuCopy size={12} />}
    </button>
  )
}

export interface ExperienceMessageListProps {
  messages: ExperienceMessage[]
  isStreaming: boolean
  /** 对比列内不重复展示模型名称（列头已表达身份），单模型页展示（§7.10） */
  showModelNameInMeta?: boolean
  emptyState: React.ReactNode
}

export function ExperienceMessageList({ messages, isStreaming, showModelNameInMeta = true, emptyState }: ExperienceMessageListProps) {
  return (
    <div className="models-experience-messages">
      {messages.length === 0 && emptyState}
      {messages.map((message, index) => {
        const isThinking =
          message.role === 'assistant' &&
          message.content === '' &&
          isStreaming &&
          index === messages.length - 1
        return (
          <div key={`${message.role}-${index}`} className={cn('models-experience-message', message.role === 'user' && 'is-user')}>
            <span className="models-experience-message-avatar">
              {message.role === 'user' ? 'J' : (message.metrics?.model ?? 'AI').slice(0, 1).toUpperCase()}
            </span>
            <div className="models-experience-message-bubble">
              {message.error ? (
                <span className="models-experience-message-error" role="alert">{message.error}</span>
              ) : isThinking ? (
                <span className="models-experience-thinking" aria-label="模型思考中">
                  <i /><i /><i />
                </span>
              ) : message.role === 'assistant' ? (
                <div className="cs-markdown"><Markdown>{message.content}</Markdown></div>
              ) : (
                message.content.split('\n').map((line, lineIndex) => <p key={`${index}-${lineIndex}`}>{line}</p>)
              )}
              {message.metrics && (
                <div className="models-experience-message-meta">
                  {showModelNameInMeta && <strong>{message.metrics.model}</strong>}
                  <span>{message.metrics.inputTokens} → {message.metrics.outputTokens} Tokens</span>
                  <span>首Token {message.metrics.firstTokenLatency}</span>
                  <span>总耗时 {message.metrics.totalLatency}</span>
                  <span>{formatPlaygroundSpend(message.metrics)}</span>
                  {message.metrics.fastest && <em className="models-experience-winner-chip is-fast">最快</em>}
                  {message.metrics.cheapest && <em className="models-experience-winner-chip is-cheap">成本最低</em>}
                  <MessageCopyButton content={message.content} />
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ExperienceMessageList
