/**
 * 消息列表渲染（单模型页 / 对比页每列共用），从 index.tsx 抽出避免重复。
 * 逐字对齐原型 App.tsx:20470-20510 的 playground-message 结构。
 */
import { useState } from 'react'
import { MarkdownContent } from '@/components/ui/MarkdownContent'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LuCheck, LuCopy, LuRefreshCcw } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { ModelIcon, type ModelIconLike } from '@/features/models/components/ModelIcon'
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
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="models-experience-icon-btn"
      aria-label={t('modelsExperience.copyReply')}
      title={t('modelsExperience.copyReply')}
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
  /** 当前任务是否媒体类（图像/音频/视频）——只有媒体结果失败才展示计费状态+重试（PRD §AC-13，
   *  对话结果失败无此要求，见 AC-12） */
  isMediaTask?: boolean
  /** 重试：传回失败结果对应的用户消息（含原始文本与附件 resource_id），由调用方重新发起同一请求 */
  onRetry?: (userMessage: ExperienceMessage) => void
  /** 当前媒体任务是否走异步（视频类）。异步任务提交后请求就返回了，结果要另行轮询/去调用日志看，
   *  等待态必须说清楚"任务还在跑"，否则跟同步生成长得一样，用户会以为卡死（#308） */
  isAsyncMediaTask?: boolean
  emptyState: React.ReactNode
  /** 助手消息头像用该模型的真实图标（ModelIcon 统一组件），不传时退回模型名首字母 */
  assistantModel?: ModelIconLike
}

export function ExperienceMessageList({ messages, isStreaming, showModelNameInMeta = true, isMediaTask = false, onRetry, emptyState, assistantModel, isAsyncMediaTask = false }: ExperienceMessageListProps) {
  const { t } = useTranslation()
  return (
    <div className="models-experience-messages">
      {messages.length === 0 && emptyState}
      {messages.map((message, index) => {
        const isThinking =
          message.role === 'assistant' &&
          message.content === '' &&
          isStreaming &&
          index === messages.length - 1
        // 媒体结果的状态徽标（#308）：对话结果没有"任务"概念，不挂徽标。
        // 生成中/任务执行中 由 isAsyncMediaTask 区分——异步任务提交后本地请求已结束，
        // 说"生成中"是错的，它是在队列里跑。
        const artifactStatus =
          !isMediaTask || message.role !== 'assistant'
            ? null
            : message.error
              ? 'failed'
              : isThinking
                ? (isAsyncMediaTask ? 'taskRunning' : 'generating')
                : message.media && message.media.length > 0
                  ? 'succeeded'
                  : null
        return (
          <div key={`${message.role}-${index}`} className={cn('models-experience-message', message.role === 'user' && 'is-user')}>
            {message.role === 'assistant' && assistantModel ? (
              <ModelIcon model={assistantModel} size={28} rounded="rounded-full" className="models-experience-message-avatar" />
            ) : (
              <span className="models-experience-message-avatar">
                {message.role === 'user' ? 'J' : (message.metrics?.model ?? 'AI').slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="models-experience-message-bubble">
              {artifactStatus && (
                <em className={cn('models-experience-artifact-status', `is-${artifactStatus}`)}>
                  {t(`modelsExperience.artifactStatus.${artifactStatus}`)}
                </em>
              )}
              {message.error ? (
                isMediaTask ? (
                  // 媒体结果失败（PRD §AC-13）：保留输入设置、展示计费状态（本次未计费）与重试
                  <div className="models-experience-media-error" role="alert">
                    <span className="models-experience-message-error">{message.error}</span>
                    <div className="models-experience-media-error-meta">
                      <em>{t('modelsExperience.notBilled')}</em>
                      {onRetry && messages[index - 1]?.role === 'user' && (
                        <button type="button" onClick={() => onRetry(messages[index - 1])}>
                          {t('modelsExperience.retryAfterAdjust')}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <span className="models-experience-message-error" role="alert">{message.error}</span>
                )
              ) : isThinking ? (
                isMediaTask ? (
                  // 媒体生成没有流式增量可看，三点动画（对话用的"正在打字"隐喻）在这里传达不了
                  // 任何进度，尤其视频异步任务一等好几分钟，用户会以为卡死（#308）
                  <div className="models-experience-media-loading" role="status">
                    <LuRefreshCcw size={22} className="models-experience-media-loading-icon" />
                    <strong>{t(isAsyncMediaTask ? 'modelsExperience.asyncTaskSubmitted' : 'modelsExperience.mediaGenerating')}</strong>
                    <span>{t(isAsyncMediaTask ? 'modelsExperience.asyncTaskHint' : 'modelsExperience.mediaGeneratingHint')}</span>
                  </div>
                ) : (
                  <span className="models-experience-thinking" aria-label={t('modelsExperience.modelThinking')}>
                    <i /><i /><i />
                  </span>
                )
              ) : (
                <>
                  {/* 用户消息附件预览（§7.5）与助手媒体结果（§7.10）都走这个渲染，
                      用户消息附带文本时两者一起展示，不是二选一 */}
                  {message.media && message.media.length > 0 && (
                    <div className="models-experience-media-result">
                      {message.media.map((m, mIdx) =>
                        m.kind === 'image' ? (
                          <img key={mIdx} src={m.url} alt={message.role === 'user' ? t('modelsExperience.attachmentPreview') : t('modelsExperience.generatedResult')} className="models-experience-media-image" />
                        ) : m.kind === 'audio' ? (
                          <audio key={mIdx} controls preload="metadata" src={m.url} className="models-experience-media-audio" />
                        ) : m.kind === 'video' ? (
                          <video key={mIdx} controls preload="metadata" src={m.url} className="models-experience-media-video" />
                        ) : null,
                      )}
                    </div>
                  )}
                  {message.role === 'assistant' && !message.media ? (
                    <MarkdownContent components={{ a: MessageLink }}>{message.content}</MarkdownContent>
                  ) : message.content ? (
                    message.content.split('\n').map((line, lineIndex) => <p key={`${index}-${lineIndex}`}>{line}</p>)
                  ) : null}
                </>
              )}
              {message.metrics && message.media ? (
                // 媒体结果卡（§7.10）：只展示运行状态/费用/下载，不展示对话专属的 Token/首Token
                <div className="models-experience-message-meta">
                  {showModelNameInMeta && <strong>{message.metrics.model}</strong>}
                  <span>{t('modelsExperience.totalLatency')} {message.metrics.totalLatency}</span>
                  <span>{formatPlaygroundSpend(message.metrics)}</span>
                  {message.media[0] && (
                    <a href={message.media[0].url} download className="models-experience-media-download">{t('modelsExperience.downloadResult')}</a>
                  )}
                </div>
              ) : message.metrics ? (
                <div className="models-experience-message-meta">
                  {showModelNameInMeta && <strong>{message.metrics.model}</strong>}
                  <span>{message.metrics.inputTokens} → {message.metrics.outputTokens} Tokens</span>
                  <span>{t('modelsExperience.firstToken')} {message.metrics.firstTokenLatency}</span>
                  <span>{t('modelsExperience.totalLatency')} {message.metrics.totalLatency}</span>
                  <span>{formatPlaygroundSpend(message.metrics)}</span>
                  {message.metrics.fastest && <em className="models-experience-winner-chip is-fast">{t('modelsExperience.fastest')}</em>}
                  {message.metrics.cheapest && <em className="models-experience-winner-chip is-cheap">{t('modelsExperience.cheapest')}</em>}
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
