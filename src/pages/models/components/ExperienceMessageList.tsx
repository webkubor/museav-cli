/**
 * 消息列表渲染（单模型页 / 对比页每列共用），从 index.tsx 抽出避免重复。
 * 逐字对齐原型 App.tsx:20470-20510 的 playground-message 结构。
 */
import { useEffect, useRef, useState } from 'react'
import { MarkdownContent } from '@/components/ui/MarkdownContent'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LuAudioLines, LuCheck, LuChevronRight, LuCopy, LuRefreshCcw } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { ModelIcon, type ModelIconLike } from '@/features/models/components/ModelIcon'
import { parseThinkContent } from '../experience-think-content'
import { useCurrency } from '@/hooks/use-platform-config'
import { fetchExperienceArtifactBlob, type ExperienceArtifactRef } from '@/services/experience-sessions'
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

/** 媒体产物下载（#310 → qa#580）。
 *
 *  `<a href={url} download>` 不行：**跨域时浏览器忽略 download 属性**，点击变成整页导航。
 *  直接 `fetch(url)` 也不行：url 指向 cdn.modelgo.com，该域名不返回任何 CORS 头，
 *  取不到响应体，只能退回 window.open —— 症状和没修一样（qa#580 实测）。
 *
 *  所以字节走 BFF 的中转端点（自家 API 域名，CORS 与会话鉴权都已就绪），拿到 blob 再用
 *  object URL 触发下载。展示/播放仍用原 url（边缘缓存），这里只负责「下载」这一下。
 *  中转失败时退回新标签打开，至少不把当前页顶掉。 */
function MediaDownloadLink({ url, downloadRef, label }: {
  url: string
  downloadRef?: ExperienceArtifactRef
  label: string
}) {
  const [busy, setBusy] = useState(false)
  const filename = (() => {
    try { return decodeURIComponent(new URL(url, window.location.href).pathname.split('/').pop() || 'download') }
    catch { return 'download' }
  })()
  return (
    <a
      href={url}
      className="models-experience-media-download"
      aria-busy={busy || undefined}
      onClick={(e) => {
        e.preventDefault()
        if (busy) return
        setBusy(true)
        const bytes = downloadRef
          ? fetchExperienceArtifactBlob(downloadRef)
          // 没有下载引用的只有用户自己刚上传的本地预览（blob: URL，同源可直取）。
          : fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
        void bytes
          .then((blob) => {
            const objectUrl = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = objectUrl
            a.download = filename
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(objectUrl)
          })
          .catch(() => { window.open(url, '_blank', 'noopener,noreferrer') })
          .finally(() => setBusy(false))
      }}
    >
      {label}
    </a>
  )
}

/** 思维链「思考过程」块（#334）：与正文分离的可折叠弱化区块。
 *  流式思考进行中（active）自动展开并显示「思考中…」，思考结束自动折叠；
 *  用户手动点过折叠开关后尊重用户选择、不再自动切换。 */
function ThinkSection({ think, active }: { think: string; active: boolean }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(active)
  const userToggledRef = useRef(false)
  useEffect(() => {
    if (!userToggledRef.current) setOpen(active)
  }, [active])
  return (
    <div className="models-experience-think">
      <button
        type="button"
        className="models-experience-think-toggle"
        aria-expanded={open}
        onClick={() => {
          userToggledRef.current = true
          setOpen((v) => !v)
        }}
      >
        <LuChevronRight size={12} aria-hidden="true" className={cn('models-experience-think-chevron', open && 'is-open')} />
        {t(active ? 'modelsExperience.thinkStreaming' : 'modelsExperience.thinkProcess')}
      </button>
      {open && think && <div className="models-experience-think-body">{think}</div>}
    </div>
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
  // 消耗金额符号走全局结算币种（platform-config.settlement_currency），不写死也不按语言猜（#372）
  const { symbol } = useCurrency()

  /** 新消息/流式增量到来时自动滚到底（#311）。此前两个页面都没有任何滚动逻辑，
   *  对比页多列各自独立滚动，聊到一屏以外就得手动往下拖才看得到最新内容。
   *
   *  只在"用户本来就贴着底部"时才滚——用户主动往上翻历史时不抢滚动位置，
   *  否则流式回复每来一个 chunk 就把人拽回底部，历史根本没法看。 */
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !stickToBottomRef.current) return
    el.scrollTop = el.scrollHeight
  })

  return (
    <div
      className="models-experience-messages"
      ref={scrollRef}
      onScroll={(e) => {
        const el = e.currentTarget
        // 容差 40px：贴底判定别太严，否则流式渲染时的亚像素抖动会误判成"用户翻上去了"
        stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      }}
    >
      {messages.length === 0 && emptyState}
      {messages.map((message, index) => {
        const isActiveStream = isStreaming && index === messages.length - 1 && message.role === 'assistant'
        // 思维链拆分（#334）：assistant 对话内容里的 <think>...</think> 拆成独立思考块，
        // 标签绝不外露。流式（含跨 chunk 半截标签）与历史恢复都汇入 content、在此统一解析。
        const parsed =
          message.role === 'assistant' && !message.media
            ? parseThinkContent(message.content, isActiveStream)
            : null
        const isThinking =
          message.role === 'assistant' &&
          (parsed ? parsed.answer === '' && parsed.think === '' && !parsed.thinkOpen : message.content === '') &&
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
                          <div key={mIdx} className="models-experience-artifact">
                            <img src={m.url} alt={message.role === 'user' ? t('modelsExperience.attachmentPreview') : t('modelsExperience.generatedResult')} className="models-experience-media-image" />
                            {/* 产物标题/规格明细（PRD §7.10 artifact.title/detail 逐字对齐），只有生成结果才有
                                （用户上传的附件预览没设 title/detail，天然不会显示这一行） */}
                            {m.title && (
                              <div className="models-experience-artifact-copy">
                                <strong>{m.title}</strong>
                                {m.detail && <span>{m.detail}</span>}
                              </div>
                            )}
                          </div>
                        ) : m.kind === 'audio' ? (
                          // 音频产物卡（#308，对齐原型 playground-audio-result）：裸 <audio> 在消息流里
                          // 只有一条细控件、看不出这是「生成结果」，补波形图标与标题把它立成一张产物卡
                          <div key={mIdx} className="models-experience-audio-result">
                            <LuAudioLines size={28} aria-hidden="true" />
                            {message.role === 'assistant' && message.content ? (
                              <strong>{message.content}</strong>
                            ) : null}
                            <audio controls preload="metadata" src={m.url} className="models-experience-media-audio" />
                          </div>
                        ) : m.kind === 'video' ? (
                          <div key={mIdx} className="models-experience-artifact">
                            {/* loop/muted/playsInline 对齐原型：静音自动可循环预览，iOS 上 playsInline
                                避免点开就强制全屏 */}
                            <video controls loop muted playsInline preload="metadata" src={m.url} className="models-experience-media-video" />
                            {m.title && (
                              <div className="models-experience-artifact-copy">
                                <strong>{m.title}</strong>
                                {m.detail && <span>{m.detail}</span>}
                              </div>
                            )}
                          </div>
                        ) : null,
                      )}
                    </div>
                  )}
                  {message.attachmentLoadFailed && (
                    <span className="models-experience-message-error" role="alert">
                      {t('modelsExperience.attachmentLoadFailed')}
                    </span>
                  )}
                  {parsed ? (
                    <>
                      {(parsed.think || parsed.thinkOpen) && (
                        <ThinkSection think={parsed.think} active={parsed.thinkOpen && isActiveStream} />
                      )}
                      <MarkdownContent components={{ a: MessageLink }}>{parsed.answer}</MarkdownContent>
                    </>
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
                  <span>{formatPlaygroundSpend(message.metrics, symbol)}</span>
                  {message.media[0] && (
                    <MediaDownloadLink
                      url={message.media[0].url}
                      downloadRef={message.media[0].downloadRef}
                      label={t('modelsExperience.downloadResult')}
                    />
                  )}
                </div>
              ) : message.metrics ? (
                <div className="models-experience-message-meta">
                  {showModelNameInMeta && <strong>{message.metrics.model}</strong>}
                  <span>{message.metrics.inputTokens} → {message.metrics.outputTokens} Tokens</span>
                  <span>{t('modelsExperience.firstToken')} {message.metrics.firstTokenLatency}</span>
                  <span>{t('modelsExperience.totalLatency')} {message.metrics.totalLatency}</span>
                  <span>{formatPlaygroundSpend(message.metrics, symbol)}</span>
                  {message.metrics.fastest && <em className="models-experience-winner-chip is-fast">{t('modelsExperience.fastest')}</em>}
                  {message.metrics.cheapest && <em className="models-experience-winner-chip is-cheap">{t('modelsExperience.cheapest')}</em>}
                  {/* 复制回复只复制正文，不带 <think> 标签与思考过程（#334） */}
                  <MessageCopyButton content={parsed ? parsed.answer : message.content} />
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
