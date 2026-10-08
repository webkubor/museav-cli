import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { LuArrowLeft, LuSearch, LuInbox, LuPaperclip, LuX } from 'react-icons/lu'
import { ModelGoApiError } from '@/lib/request'
import { appToast } from '@/lib/app-toast'
import { isNotFoundError } from '@/lib/request-error-message'
import { formatMonthDayTime } from '@/lib/format-date'
import { useAuthStore } from '@/store/auth'
import { attachSupportTicketAttachment, getTicketAttachment, listSupportTickets, listTicketAttachments, listTicketEvents, uploadSupportAttachment } from '@/services/support'
import { ticketAgentNameOf, ticketNoOf, ticketRatingOf, ticketSlaTextOf, ticketStatusTextOf, ticketUnreadOf } from '@/interfaces/support'
import type { SupplementResult, SupportEventItem, SupportTicketAttachment, SupportTicketDetail, SupportTicketFilter, SupportTicketSummary } from '@/interfaces/support'
import { ATTACHMENT_ACCEPT, ATTACHMENT_ALLOWED_MIME, ATTACHMENT_MAX_BYTES } from './feedback-attachment'
import type { ChatItem } from './use-support'

const FILTERS: SupportTicketFilter[] = ['all', 'processing', 'ended']

export interface TicketsListProps {
  onSelect: (id: string) => void
  onClose: () => void
}

/** 服务记录列表：游标分页 + filter + 搜索 */
export function TicketsList({ onSelect, onClose }: TicketsListProps) {
  const { t } = useTranslation()
  const account = useAuthStore((s) => s.account)
  const [filter, setFilter] = useState<SupportTicketFilter>('all')
  const [q, setQ] = useState('')
  const [items, setItems] = useState<SupportTicketSummary[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  // 加载失败单独成态：原先 catch 里只弹 toast，列表仍是空数组，于是渲染成「暂无服务记录」——
  // 用户会把加载失败读成「我没有记录」（#1150）。
  const [loadError, setLoadError] = useState<unknown>(null)
  // 空态文案要区分「本来就没有」与「搜不到」，按**发出请求时**的关键词判，不按输入框当前值
  const [searchedQ, setSearchedQ] = useState('')

  async function load(reset: boolean) {
    // 未登录不发请求：拿到的只会是 40101，列表空着渲染「暂无服务记录」，
    // 用户会以为自己确实没有记录。这里如实说「登录后查看」。
    if (!account) {
      setItems([])
      setHasMore(false)
      return
    }
    setLoading(true)
    const keyword = q.trim()
    try {
      const page = await listSupportTickets({ filter, q: keyword || undefined, cursor: reset ? undefined : cursor ?? undefined })
      setItems((prev) => (reset ? page.items : [...prev, ...page.items]))
      setCursor(page.next_cursor)
      setHasMore(page.has_more)
      setLoadError(null)
      if (reset) setSearchedQ(keyword)
    } catch (error) {
      // 翻页失败保留已拿到的记录，只有首屏失败才换成错误态
      if (reset) setItems([])
      setLoadError(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // 切换 filter 触发重新拉取列表，setLoading 是异步请求的必要前置状态
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, account])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-mg-fill-0">
        <button type="button" onClick={onClose} aria-label={t('common.customerService.tickets.back')} className="text-mg-text-2 hover:text-mg-text-1">
          <LuArrowLeft size={16} />
        </button>
        <p className="m-0 mg-text-body font-medium text-mg-text-1 flex-1">{t('common.customerService.tickets.title')}</p>
      </div>

      <div className="px-4 pt-3 flex flex-col gap-2">
        <Input
          prefix={<LuSearch size={14} />}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onEnterPress={() => load(true)}
          placeholder={t('common.customerService.tickets.searchPlaceholder')}
        />
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            // 选中态用 Button variant="brand"，不手写 bg-brand-*（DESIGN.md · Components）
            <Button
              key={f}
              size="small"
              variant={filter === f ? 'brand' : 'secondary'}
              onClick={() => setFilter(f)}
            >
              {t(`common.customerService.tickets.filters.${f}`)}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {!loading && loadError !== null && items.length === 0 && (
          <RecordsNotice
            title={t('common.customerService.tickets.loadFailed')}
            description={t('common.customerService.tickets.loadFailedHint', { code: errorIdOf(loadError) })}
            actionLabel={t('common.customerService.tickets.reload')}
            onAction={() => load(true)}
          />
        )}
        {!loading && loadError === null && items.length === 0 && (
          <EmptyState
            icon={<LuInbox />}
            title={account ? t('common.customerService.tickets.empty') : t('common.customerService.loginRequired.tickets')}
            description={account
              ? t(searchedQ ? 'common.customerService.tickets.emptySearch' : 'common.customerService.tickets.emptyHint')
              : undefined}
          />
        )}
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            // 字段与层级照 PRD 原型 CustomerSupportHistoryList.tsx 的 history-row：
            // 第一行「记录类型 + 状态」，第二行标题，第三行「编号 · 更新时间」+ 未读标记。
            // 原先漏了**记录类型**与**未读**两个字段（接口的 type / unread 都给了、没渲染），
            // 而 PRD §「记录类型」「未读来源」两节都明确要求展示，QA 会逐条验。
            <button
              key={ticketNoOf(item)}
              type="button"
              onClick={() => onSelect(ticketNoOf(item))}
              className="mg-tile text-left px-3 py-2 hover:border-brand-mid/50 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="mg-text-caption text-mg-text-3">
                  {/* 后端已下发本地化类型名（「人工服务 · 转异步」这种复合态前端拼不出来），优先用它 */}
                  {item.display_type
                    || t(`common.customerService.tickets.types.${item.ticket_type ?? item.type}`, { defaultValue: item.ticket_type ?? item.type ?? '' })}
                </span>
                <Badge variant="outline" size="sm">{ticketStatusTextOf(item)}</Badge>
              </div>
              {item.title && <p className="m-0 mt-1 mg-text-caption font-medium text-mg-text-1 line-clamp-2" title={item.title}>{item.title}</p>}
              {(item.latest_visible_message || item.latest_message_preview) && (
                <p className="m-0 mt-1 mg-text-caption text-mg-text-3 line-clamp-2" title={item.latest_visible_message || item.latest_message_preview}>
                  {item.latest_visible_message || item.latest_message_preview}
                </p>
              )}
              <div className="mt-1 flex items-center justify-between gap-2">
                <small className="min-w-0 truncate text-[10px] text-mg-text-3" title={ticketNoOf(item)}>
                  {ticketNoOf(item)} · {new Date(item.updated_at).toLocaleString()}
                </small>
                {ticketUnreadOf(item) && (
                  <b className="shrink-0 rounded-full bg-mg-primary-light px-1.5 py-0.5 text-[10px] font-medium text-brand-base">
                    {t('common.customerService.tickets.unread')}
                  </b>
                )}
              </div>
            </button>
          ))}
        </div>
        {loadError !== null && items.length > 0 && (
          <p role="alert" className="m-0 mt-3 mg-text-caption text-mg-danger text-center">
            {t('common.customerService.tickets.loadFailedHint', { code: errorIdOf(loadError) })}
          </p>
        )}
        {hasMore && (
          <div className="flex justify-center mt-3">
            <Button size="small" variant="secondary" loading={loading} onClick={() => load(false)}>
              {t('common.customerService.tickets.loadMore')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/** 错误编号给用户报给客服用：优先 request_id / trace_id（后端日志能直接搜到），没有再退回业务码。 */
function errorIdOf(error: unknown): string {
  if (error instanceof ModelGoApiError) return error.requestId || error.traceId || String(error.code)
  // 网关级 HTTP 5xx 抛的是 ky HTTPError，编号在响应头里（与 error-diagnostics 同口径）
  const resp = (error as { response?: Response } | null)?.response
  const headerId = resp?.headers?.get?.('x-request-id') || resp?.headers?.get?.('x-trace-id')
  if (headerId) return headerId
  return resp?.status ? `HTTP ${resp.status}` : 'NETWORK'
}

function isForbiddenError(error: unknown): boolean {
  if (error instanceof ModelGoApiError) return Math.floor(error.code / 100) === 403
  return (error as { response?: { status?: number } } | null)?.response?.status === 403
}

/** 服务记录的「出错了」提示块：role=alert 让读屏立刻播报，并给一个可执行的出路。 */
function RecordsNotice({ title, description, actionLabel, onAction }: {
  title: string
  description: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <section role="alert" className="py-12 flex flex-col items-center gap-1 text-center">
      <p className="m-0 mg-text-body font-medium text-mg-text-1">{title}</p>
      <p className="m-0 mg-text-caption text-mg-text-3">{description}</p>
      <Button size="small" variant="secondary" className="mt-3" onClick={onAction}>{actionLabel}</Button>
    </section>
  )
}

export interface TicketDetailViewProps {
  detail: SupportTicketDetail | null
  /** 取数失败的原始错误；null = 没出错（detail 仍为 null 即加载中） */
  error?: unknown
  onRetry?: () => void
  onBack: () => void
  onReopen: () => void
  onRate: (stars: number) => void
  /** 提交一条补充，结果见 SupplementResult。 */
  onSupplement: (content: string) => Promise<SupplementResult>
  /** 人工单的会话气泡；气泡长相由面板统一渲染（与主对话同一套），这里只管顺序与位置 */
  messages?: ChatItem[]
  /** 人工单的会话是否已拉回；拉回前不判已读（空气泡区会让可视区哨兵假「可见」）。缺省视为已就绪。 */
  messagesLoaded?: boolean
  renderMessage?: (msg: ChatItem) => ReactNode
  /** 最新一条消息滚进可视区时回调 —— 转异步单据此判已读 */
  onLatestVisible?: () => void
  /** 转异步单底部发消息；返回是否成功（失败保留输入） */
  onReply?: (content: string) => Promise<boolean>
}


export function TicketDetailView({
  detail, error = null, onRetry, onBack, onReopen, onRate, onSupplement,
  messages = [], messagesLoaded = true, renderMessage, onLatestVisible, onReply,
}: TicketDetailViewProps) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const latestRef = useRef<HTMLDivElement>(null)
  const [replyText, setReplyText] = useState('')
  const [replying, setReplying] = useState(false)
  const isHuman = detail?.ticket_type === 'human_support' || detail?.type === 'handoff'
  const isFeedback = detail?.ticket_type === 'feedback' || detail?.type === 'feedback'
  const rating = detail ? ticketRatingOf(detail) : undefined
  // 只有转异步单在详情里继续沟通；实时人工单的详情是那场会话的归档回看（工单类型 PRD）
  const canReply = Boolean(detail && isHuman && detail.service_mode === 'async' && detail.capabilities.can_reply && onReply)

  // 最新消息（或没有消息时的末尾）进入滚动容器可视区才算「看到了」：
  // 打开即已读会让用户没滚到底就丢了提醒（用例负控）。
  const latestKey = messages.at(-1)?.id ?? ''
  useEffect(() => {
    const el = latestRef.current
    if (!el || !onLatestVisible || !detail || !isHuman || !messagesLoaded) return
    if (typeof IntersectionObserver === 'undefined') { onLatestVisible(); return }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) onLatestVisible()
    }, { root: scrollRef.current, threshold: 0.6 })
    io.observe(el)
    return () => io.disconnect()
  }, [latestKey, detail, isHuman, messagesLoaded, onLatestVisible])

  async function submitReply() {
    const content = replyText.trim()
    if (!content || replying || !onReply) return
    setReplying(true)
    const ok = await onReply(content)
    setReplying(false)
    if (ok) setReplyText('')
  }
  const [supplementOpen, setSupplementOpen] = useState(false)
  const [supplementText, setSupplementText] = useState('')
  const [supplementing, setSupplementing] = useState(false)
  // 补充可只带附件（PRD §7.11「原地展开输入框与附件选择」，原型同：文字与附件有一即可提交）
  const [supplementFile, setSupplementFile] = useState<File | null>(null)
  const [supplementFileError, setSupplementFileError] = useState<string>()
  const [fileInputKey, setFileInputKey] = useState(0)
  // 附件挂到工单后要让「附件」行重新拉列表
  const [attachmentsVersion, setAttachmentsVersion] = useState(0)

  function clearSupplementFile() {
    setSupplementFile(null)
    setSupplementFileError(undefined)
    setFileInputKey((k) => k + 1)
  }

  function closeSupplement() {
    setSupplementText('')
    clearSupplementFile()
    setSupplementOpen(false)
  }

  function pickSupplementFile(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null
    if (!picked) return clearSupplementFile()
    if (!ATTACHMENT_ALLOWED_MIME.includes(picked.type)) {
      setSupplementFile(null)
      setSupplementFileError(t('common.customerService.feedback.attachmentInvalid'))
      return
    }
    if (picked.size > ATTACHMENT_MAX_BYTES) {
      setSupplementFile(null)
      setSupplementFileError(t('common.customerService.feedback.attachmentTooLarge'))
      return
    }
    setSupplementFile(picked)
    setSupplementFileError(undefined)
  }

  async function submitSupplement() {
    const content = supplementText.trim()
    if ((!content && !supplementFile) || supplementing || !detail) return
    setSupplementing(true)
    // 先传附件：附件失败时文字还没提交，用户改完重试不会把同一段补充发两遍
    if (supplementFile) {
      try {
        const uploaded = await uploadSupportAttachment(supplementFile)
        await attachSupportTicketAttachment(ticketNoOf(detail), {
          file_name: supplementFile.name,
          mime_type: supplementFile.type,
          object_ref: uploaded.object_ref,
          size_bytes: supplementFile.size,
        })
        setAttachmentsVersion((v) => v + 1)
        clearSupplementFile()
      } catch (error) {
        appToast.requestError(error)
        setSupplementing(false)
        return
      }
    }
    const result = content ? await onSupplement(content) : 'ok'
    setSupplementing(false)
    // closed 也要收起：否则工单被重开、入口回来时，旧表单会连同旧文字自己弹出来
    if (result !== 'failed') closeSupplement()
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-mg-fill-0">
        <button type="button" onClick={onBack} aria-label={t('common.customerService.tickets.back')} className="text-mg-text-2 hover:text-mg-text-1">
          <LuArrowLeft size={16} />
        </button>
        {/* 顶栏照原型：「工单详情」+ 编号 + 状态胶囊（prd46#1198 #4）；原先只有编号 */}
        <p className="m-0 mg-text-body font-medium text-mg-text-1 shrink-0">{t('common.customerService.ticket.title')}</p>
        <p className="m-0 min-w-0 flex-1 truncate mg-text-caption text-mg-text-3" title={detail ? ticketNoOf(detail) : undefined}>
          {detail ? ticketNoOf(detail) : ''}
        </p>
        {detail && <Badge variant="outline" size="sm">{ticketStatusTextOf(detail)}</Badge>}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
        {!detail && error === null && <p className="mg-text-caption text-mg-text-3">{t('common.customerService.tickets.loading')}</p>}
        {/* 404 / 403 = 这张单用户看不了（已归档、换了账号），重试没用，只给「返回服务记录」；
            其余（5xx / 超时 / 断网）是暂时性的，给「重新加载」 */}
        {!detail && error !== null && (isNotFoundError(error) || isForbiddenError(error) || !onRetry ? (
          <RecordsNotice
            title={t('common.customerService.tickets.unavailable')}
            description={t('common.customerService.tickets.unavailableHint')}
            actionLabel={t('common.customerService.tickets.backToList')}
            onAction={onBack}
          />
        ) : (
          <RecordsNotice
            title={t('common.customerService.tickets.loadFailed')}
            description={t('common.customerService.tickets.loadFailedHint', { code: errorIdOf(error) })}
            actionLabel={t('common.customerService.tickets.reload')}
            onAction={onRetry}
          />
        ))}
        {detail && (
          <div className="flex flex-col gap-3">
            {/* 反馈单的 title 是后端写死的「问题反馈」，原型的反馈单没有标题行（prd46#1198 #3） */}
            {detail.title && !isFeedback && <p className="m-0 mg-text-body font-medium text-mg-text-1">{detail.title}</p>}
            {/* 头部属性表照 PRD 原型 CustomerSupportTicketDetail.tsx：类型 / 编号 /
                提交时间 / 最近更新（有客服再加一行）。原实现只渲染了描述和「客服名·工号」，
                **编号、类型、时间三个字段全缺** —— 用户在详情里看不到自己的工单号，
                没法拿去跟客服核对。 */}
            <dl className="m-0 flex flex-col gap-1 text-[11px]">
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-mg-text-3">{t('common.customerService.tickets.detail.typeLabel')}</dt>
                <dd className="m-0 text-mg-text-2">
                  {/* detail.type 后端不下发，直接插值会把 i18n key 原样打到屏上
                      （实测「common.customerService.tickets.types.undefined」）。 */}
                  {detail.display_type
                    || t(`common.customerService.tickets.types.${detail.ticket_type ?? detail.type}`, { defaultValue: detail.ticket_type ?? detail.type ?? '' })}
                </dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-mg-text-3">{t('common.customerService.tickets.detail.idLabel')}</dt>
                <dd className="m-0 min-w-0 truncate font-medium text-mg-text-2" title={ticketNoOf(detail)}>{ticketNoOf(detail)}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-mg-text-3">{t('common.customerService.tickets.detail.createdLabel')}</dt>
                <dd className="m-0 text-mg-text-2">{new Date(detail.created_at).toLocaleString()}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-mg-text-3">{t('common.customerService.tickets.detail.updatedLabel')}</dt>
                <dd className="m-0 text-mg-text-2">{new Date(detail.updated_at).toLocaleString()}</dd>
              </div>
              {(ticketAgentNameOf(detail) || detail.agent_no) && (
                <div className="flex gap-1.5">
                  <dt className="shrink-0 text-mg-text-3">{t('common.customerService.tickets.detail.agentLabel')}</dt>
                  <dd className="m-0 min-w-0 truncate text-mg-text-2">{[ticketAgentNameOf(detail), detail.agent_no].filter(Boolean).join(' · ')}</dd>
                </div>
              )}
            </dl>
            {/* 问题反馈按 PRD 问题单顺序逐行带标签：问题类型 → 问题描述（补充续写其后）→
                发生时间 / Request ID / 附件（prd46#1198 #2/#7）。其它工单仍是描述 + 补充平铺。 */}
            {isFeedback ? (
              <FeedbackIssueFields detail={detail} attachmentsVersion={attachmentsVersion} />
            ) : (
              <>
                {detail.description && <p className="m-0 mg-text-body text-mg-text-1 whitespace-pre-wrap">{detail.description}</p>}
                <TicketSupplements items={detail.supplements} />
              </>
            )}
            {isHuman && renderMessage && messages.length > 0 && (
              <div className="flex flex-col pt-2 border-t border-mg-fill-0" aria-label={t('common.customerService.tickets.detail.conversation')}>
                {messages.map((m) => <div key={m.id}>{renderMessage(m)}</div>)}
              </div>
            )}
            {isHuman && <div ref={latestRef} aria-hidden className="h-px" />}
            {/* 后端对反馈单无条件下发「我们将在 1 个工作日内联系你。」，处理中 / 已解决还挂着
                就成了错误承诺；只在待处理时展示（prd46#1198 #5） */}
            {detail.status === 'pending' && ticketSlaTextOf(detail) && (
              <p className="m-0 mg-text-caption text-mg-text-3">{ticketSlaTextOf(detail)}</p>
            )}
            {detail.status === 'resolved' && detail.resolution && (
              <div className="flex flex-col gap-1 border-t border-mg-fill-0 pt-3">
                <span className="mg-text-caption font-medium text-mg-text-1">{t('common.customerService.ticket.resolution')}</span>
                <p className="m-0 mg-text-caption text-mg-text-2 whitespace-pre-wrap break-words">{detail.resolution}</p>
              </div>
            )}
            <TicketHandlingLog ticketId={ticketNoOf(detail)} refreshKey={`${detail.version ?? ''}|${detail.updated_at}`} />
            {typeof rating === 'number' && (
              <p className="m-0 mg-text-caption text-mg-warning">{'★'.repeat(rating)}{'☆'.repeat(5 - rating)}</p>
            )}

            {detail.capabilities.can_supplement && supplementOpen && (
              <div className="flex flex-col gap-2 mt-2">
                <Textarea
                  autoFocus
                  rows={3}
                  aria-label={t('common.customerService.ticket.supplement')}
                  placeholder={t('common.customerService.ticket.supplementPlaceholder')}
                  value={supplementText}
                  onChange={(e) => setSupplementText(e.target.value)}
                  // 提交中锁住：成功后会清空输入框，点提交之后再打的字不会被发出去，不能静默吞掉
                  disabled={supplementing}
                />
                <div className="flex items-center gap-2">
                  <label className="mg-tile flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 px-3 py-1.5 mg-text-caption text-mg-text-3 hover:border-brand-mid/50">
                    <LuPaperclip size={13} aria-hidden className="shrink-0" />
                    <span className="truncate">{supplementFile ? supplementFile.name : t('common.customerService.feedback.attachmentPlaceholder')}</span>
                    <input
                      key={fileInputKey}
                      type="file"
                      className="hidden"
                      accept={ATTACHMENT_ACCEPT}
                      aria-label={t('common.customerService.feedback.attachment')}
                      onChange={pickSupplementFile}
                      disabled={supplementing}
                    />
                  </label>
                  {supplementFile && !supplementing && (
                    <button
                      type="button"
                      aria-label={t('common.customerService.feedback.attachmentClear')}
                      onClick={clearSupplementFile}
                      className="p-1 text-mg-text-2 hover:text-mg-text-1"
                    >
                      <LuX size={14} />
                    </button>
                  )}
                </div>
                {supplementFileError && <span className="mg-text-caption text-mg-danger">{supplementFileError}</span>}
                <div className="flex justify-end gap-2">
                  <Button size="small" variant="secondary" onClick={closeSupplement} disabled={supplementing}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    size="small"
                    variant="brand"
                    loading={supplementing}
                    disabled={!supplementText.trim() && !supplementFile}
                    onClick={submitSupplement}
                  >
                    {t('common.customerService.ticket.supplementSubmit')}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-2">
              {detail.capabilities.can_supplement && !supplementOpen && (
                <Button size="small" variant="secondary" onClick={() => setSupplementOpen(true)}>
                  {t('common.customerService.ticket.supplement')}
                </Button>
              )}
              {detail.capabilities.can_reopen && (
                <Button size="small" variant="secondary" onClick={onReopen}>{t('common.customerService.tickets.reopen')}</Button>
              )}
              {/* 后端的人工单是 ticket_type:'human_support'（PRD 措辞是 handoff），两种都认 */}
              {(detail.ticket_type === 'human_support' || detail.type === 'handoff') && typeof rating !== 'number' && detail.status !== 'processing' && (
                <RateInline onRate={onRate} />
              )}
            </div>
          </div>
        )}
      </div>
      {canReply && (
        <div className="flex items-end gap-2 border-t border-mg-fill-0 px-4 py-3">
          <Textarea
            rows={2}
            className="flex-1"
            aria-label={t('common.customerService.tickets.detail.replyAria')}
            placeholder={t('common.customerService.tickets.detail.replyPlaceholder')}
            value={replyText}
            disabled={replying}
            onChange={(e) => setReplyText(e.target.value)}
          />
          <Button size="small" variant="brand" loading={replying} disabled={!replyText.trim()} onClick={submitReply}>
            {t('common.customerService.tickets.detail.replySend')}
          </Button>
        </div>
      )}
    </div>
  )
}

const fieldRow = 'flex gap-1.5'

/**
 * 问题反馈的「问题单」区（工单类型 PRD：问题类型、问题描述、发生时间、Request ID（如有）、
 * 附件（如有，支持下载））。空字段整行隐藏，避免再把固定标题当问题描述。
 */
function FeedbackIssueFields({ detail, attachmentsVersion }: { detail: SupportTicketDetail; attachmentsVersion: number }) {
  const { t } = useTranslation()
  const [attachments, setAttachments] = useState<SupportTicketAttachment[]>([])
  const ticketId = detail.ticket_id
  const hasSupplements = (detail.supplements?.length ?? 0) > 0

  useEffect(() => {
    let cancelled = false
    listTicketAttachments(ticketId)
      .then((resp) => { if (!cancelled) setAttachments(resp?.items ?? []) })
      // 附件是「如有」的附属信息：拉失败不打断详情，只是不显示这一行
      .catch(() => { if (!cancelled) setAttachments([]) })
    return () => { cancelled = true }
  }, [ticketId, attachmentsVersion])

  async function download(item: SupportTicketAttachment) {
    if (item.download_url) {
      window.open(item.download_url, '_blank', 'noopener,noreferrer')
      return
    }
    // 本地存储的附件没有直链，字节随单条接口的 content_base64 下发
    try {
      const full = await getTicketAttachment(ticketId, item.id)
      if (!full?.content_base64) throw new Error('empty attachment')
      const bytes = Uint8Array.from(atob(full.content_base64), (c) => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: full.mime_type || 'application/octet-stream' }))
      const a = document.createElement('a')
      a.href = url
      a.download = full.file_name || item.file_name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (error) {
      appToast.requestError(error, t('common.customerService.tickets.detail.downloadFailed'))
    }
  }

  if (!detail.category && !detail.description && !hasSupplements && !detail.occurred_at && !detail.request_id && attachments.length === 0) return null
  return (
    <dl className="m-0 flex flex-col gap-1 text-[11px]">
      {detail.category && (
        <div className={fieldRow}>
          <dt className="shrink-0 text-mg-text-3">{t('common.customerService.tickets.detail.categoryLabel')}</dt>
          <dd className="m-0 text-mg-text-2">
            {t(`common.customerService.feedback.categoryOptions.${detail.category}`, { defaultValue: detail.category })}
          </dd>
        </div>
      )}
      {(detail.description || hasSupplements) && (
        <div className={fieldRow}>
          <dt className="shrink-0 text-mg-text-3">{t('common.customerService.tickets.detail.descriptionLabel')}</dt>
          <dd className="m-0 flex min-w-0 flex-col gap-1.5">
            {detail.description && <span className="whitespace-pre-wrap break-words text-mg-text-2">{detail.description}</span>}
            {/* 补充续写在问题描述之后、用虚线隔开（PRD §7.11，prd46#1198 #7） */}
            <TicketSupplements items={detail.supplements} dashed />
          </dd>
        </div>
      )}
      {detail.occurred_at && (
        <div className={fieldRow}>
          <dt className="shrink-0 text-mg-text-3">{t('common.customerService.tickets.detail.occurredLabel')}</dt>
          <dd className="m-0 text-mg-text-2">{new Date(detail.occurred_at).toLocaleString()}</dd>
        </div>
      )}
      {detail.request_id && (
        <div className={fieldRow}>
          <dt className="shrink-0 text-mg-text-3">{t('common.customerService.tickets.detail.requestIdLabel')}</dt>
          <dd className="m-0 min-w-0 truncate font-mono text-mg-text-2" title={detail.request_id}>{detail.request_id}</dd>
        </div>
      )}
      {attachments.length > 0 && (
        <div className={fieldRow}>
          <dt className="shrink-0 text-mg-text-3">{t('common.customerService.tickets.detail.attachmentsLabel')}</dt>
          <dd className="m-0 min-w-0 flex flex-col gap-0.5">
            {attachments.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => download(item)}
                aria-label={t('common.customerService.tickets.detail.downloadAria', { name: item.file_name })}
                className="min-w-0 truncate text-left text-brand-base hover:underline"
                title={item.file_name}
              >
                {item.file_name}
              </button>
            ))}
          </dd>
        </div>
      )}
    </dl>
  )
}

/** 建单后追加的补充：按「补充 · MM-DD HH:mm」前缀逐条追加，不当作沟通消息（PRD §7.11）。 */
function TicketSupplements({ items, dashed = false }: { items?: SupportTicketDetail['supplements']; dashed?: boolean }) {
  const { t } = useTranslation()
  if (!items?.length) return null
  return (
    <>
      {items.map((item) => (
        <div key={item.id} className={`flex flex-col gap-0.5${dashed ? ' border-t border-dashed border-mg-fill-1 pt-1.5' : ''}`}>
          <span className="mg-text-caption text-mg-text-3">
            {t('common.customerService.ticket.supplementAt', { time: formatMonthDayTime(item.created_at) })}
          </span>
          <p className="m-0 whitespace-pre-wrap break-words text-mg-text-2">{item.content}</p>
        </div>
      ))}
    </>
  )
}

/**
 * 处理记录（PRD §7.11：问题反馈与转异步展示后台处理记录，按时间正序，每条含描述 / 操作人 / 时间）。
 * 原先前端完全没接 `GET /support/tickets/:id/events`（prd46#1198 #1）。后端只回 visible_to_user
 * 的事件；拉取失败（如旧版后端没有该路由）只是不显示这一块，不打断详情。
 * refreshKey 跟着工单 version/updated_at 走，状态流转后自动重拉。
 */
function TicketHandlingLog({ ticketId, refreshKey }: { ticketId: string; refreshKey: string }) {
  const { t } = useTranslation()
  const [events, setEvents] = useState<SupportEventItem[]>([])

  useEffect(() => {
    if (!ticketId) return
    let cancelled = false
    listTicketEvents(ticketId)
      .then((items) => { if (!cancelled) setEvents(items.filter((e) => e.visible_to_user !== false)) })
      .catch(() => { if (!cancelled) setEvents([]) })
    return () => { cancelled = true }
  }, [ticketId, refreshKey])

  if (events.length === 0) return null
  return (
    <section className="flex flex-col gap-2 border-t border-mg-fill-0 pt-3" aria-label={t('common.customerService.ticket.handlingTitle')}>
      <h3 className="m-0 mg-text-caption font-medium text-mg-text-1">{t('common.customerService.ticket.handlingTitle')}</h3>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {events.map((event) => (
          <li key={event.id} className="flex flex-col gap-0.5">
            <p className="m-0 mg-text-caption text-mg-text-2">{event.summary || event.type}</p>
            <p className="m-0 mg-text-caption text-mg-text-3">
              {[event.created_at ? formatMonthDayTime(event.created_at) : '', event.actor_name].filter(Boolean).join(' · ')}
            </p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function RateInline({ onRate }: { onRate: (stars: number) => void }) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState(0)
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          aria-label={t('common.customerService.handoff.starAria', { star })}
          onClick={() => { setSelected(star); onRate(star) }}
          className={selected >= star ? 'text-mg-warning' : 'text-mg-text-4'}
        >
          ★
        </button>
      ))}
    </div>
  )
}
