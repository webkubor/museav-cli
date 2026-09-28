import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { LuArrowLeft, LuSearch, LuInbox } from 'react-icons/lu'
import { ModelGoApiError } from '@/lib/request'
import { isNotFoundError } from '@/lib/request-error-message'
import { formatMonthDayTime } from '@/lib/format-date'
import { useAuthStore } from '@/store/auth'
import { listSupportTickets } from '@/services/support'
import { ticketAgentNameOf, ticketNoOf, ticketSlaTextOf, ticketStatusTextOf, ticketUnreadOf } from '@/interfaces/support'
import type { SupplementResult, SupportTicketDetail, SupportTicketFilter, SupportTicketSummary } from '@/interfaces/support'

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
  const status = (error as { response?: { status?: number } } | null)?.response?.status
  return status ? `HTTP ${status}` : 'NETWORK'
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
}


export function TicketDetailView({ detail, error = null, onRetry, onBack, onReopen, onRate, onSupplement }: TicketDetailViewProps) {
  const { t } = useTranslation()
  const [supplementOpen, setSupplementOpen] = useState(false)
  const [supplementText, setSupplementText] = useState('')
  const [supplementing, setSupplementing] = useState(false)

  function closeSupplement() {
    setSupplementText('')
    setSupplementOpen(false)
  }

  async function submitSupplement() {
    const content = supplementText.trim()
    if (!content || supplementing) return
    setSupplementing(true)
    const result = await onSupplement(content)
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
        <p className="m-0 mg-text-body font-medium text-mg-text-1 flex-1">{detail ? ticketNoOf(detail) : ''}</p>
        {detail && <Badge variant="outline" size="sm">{ticketStatusTextOf(detail)}</Badge>}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
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
            {detail.title && <p className="m-0 mg-text-body font-medium text-mg-text-1">{detail.title}</p>}
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
            {detail.description && <p className="m-0 mg-text-body text-mg-text-1 whitespace-pre-wrap">{detail.description}</p>}
            {/* 建单后的补充照 PRD 原型 CustomerSupportTicketDetail.tsx 挂在描述区块里、
                按「补充 · MM-DD HH:mm」前缀逐条追加，不当作沟通消息（PRD §7.11）。 */}
            {detail.supplements?.map((item) => (
              <div key={item.id} className="flex flex-col gap-0.5">
                <span className="mg-text-caption text-mg-text-3">
                  {t('common.customerService.ticket.supplementAt', { time: formatMonthDayTime(item.created_at) })}
                </span>
                <p className="m-0 mg-text-body text-mg-text-1 whitespace-pre-wrap break-words">{item.content}</p>
              </div>
            ))}
            {ticketSlaTextOf(detail) && <p className="m-0 mg-text-caption text-mg-text-3">{ticketSlaTextOf(detail)}</p>}
            {typeof detail.rating === 'number' && (
              <p className="m-0 mg-text-caption text-mg-warning">{'★'.repeat(detail.rating)}{'☆'.repeat(5 - detail.rating)}</p>
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
                <div className="flex justify-end gap-2">
                  <Button size="small" variant="secondary" onClick={closeSupplement} disabled={supplementing}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    size="small"
                    variant="brand"
                    loading={supplementing}
                    disabled={!supplementText.trim()}
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
              {(detail.ticket_type === 'human_support' || detail.type === 'handoff') && typeof detail.rating !== 'number' && detail.status !== 'processing' && (
                <RateInline onRate={onRate} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
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
