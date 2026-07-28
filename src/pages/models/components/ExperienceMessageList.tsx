/**
 * 消息列表渲染（单模型页 / 对比页每列共用），从 index.tsx 抽出避免重复。
 * 逐字对齐原型 App.tsx:20470-20510 的 playground-message 结构。
 */
import { useState } from 'react'
import Markdown from 'react-markdown'
import { useNavigate } from 'react-router-dom'
import { LuCheck, LuCopy } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { formatPlaygroundSpend, type ExperienceMessage } from '../model-experience-data'

/** 消息内容里的站内链接（如视频异步任务跳转调用日志）走 SPA 导航，外链原样新标签打开 */
function MessageLink({ href, children }: { href?: string; children?: React.ReactNode }) {
  const navigate = useNavigate()
  if (href?.startsWith('/')) {
    return (
      <a href={href} onClick={(e) => { e.preventDefault(); navigate(href) }}>
        {children}
      </a>
    )
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}

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
              ) : (
                <>
                  {/* 用户消息附件预览（§7.5）与助手媒体结果（§7.10）都走这个渲染，
                      用户消息附带文本时两者一起展示，不是二选一 */}
                  {message.media && message.media.length > 0 && (
                    <div className="models-experience-media-result">
                      {message.media.map((m, mIdx) =>
                        m.kind === 'image' ? (
                          <img key={mIdx} src={m.url} alt={message.role === 'user' ? '附件预览' : '生成结果'} className="models-experience-media-image" />
                        ) : m.kind === 'audio' ? (
                          <audio key={mIdx} controls preload="metadata" src={m.url} className="models-experience-media-audio" />
                        ) : m.kind === 'video' ? (
                          <video key={mIdx} controls preload="metadata" src={m.url} className="models-experience-media-video" />
                        ) : null,
                      )}
                    </div>
                  )}
                  {message.role === 'assistant' && !message.media ? (
                    <div className="cs-markdown"><Markdown components={{ a: MessageLink }}>{message.content}</Markdown></div>
                  ) : message.content ? (
                    message.content.split('\n').map((line, lineIndex) => <p key={`${index}-${lineIndex}`}>{line}</p>)
                  ) : null}
                </>
              )}
              {message.metrics && message.media ? (
                // 媒体结果卡（§7.10）：只展示运行状态/费用/下载，不展示对话专属的 Token/首Token
                <div className="models-experience-message-meta">
                  {showModelNameInMeta && <strong>{message.metrics.model}</strong>}
                  <span>总耗时 {message.metrics.totalLatency}</span>
                  <span>{formatPlaygroundSpend(message.metrics)}</span>
                  {message.media[0] && (
                    <a href={message.media[0].url} download className="models-experience-media-download">下载产物</a>
                  )}
                </div>
              ) : message.metrics ? (
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
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ExperienceMessageList
