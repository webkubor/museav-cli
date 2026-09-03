/**
 * 服务记录列表（PRD §7.8）。
 *
 * 每行展示类型标签、当前状态、标题、最新消息和更新时间；三个筛选页签；按编号与标题搜索；
 * 增量加载。**排序不在前端**：「有新消息的工单置顶，其余按最近更新时间倒序」由服务端给，
 * 这里原样渲染 —— 前端再排一次就会和分页游标打架。
 *
 * 「有新消息」标记按 §7.9：转异步的状态变更/客服回复与问题反馈的状态变更都算，
 * 两种触发条件在展示上不作区分；人工服务不产生未读，所以它的行永远没有这个标记。
 */

import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { LuLoaderCircle, LuSearch } from 'react-icons/lu'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/format-date'
import type { SupportTicketFilter, SupportTicketStatus, SupportTicketSummary } from '@/interfaces/support'

const FILTERS: SupportTicketFilter[] = ['all', 'processing', 'ended']

/** 四态 → Badge 变体。语义色不改色相（DESIGN.md），已取消用中性灰而非红 */
const STATUS_VARIANT: Record<SupportTicketStatus, 'warning' | 'info' | 'success' | 'secondary'> = {
  pending: 'warning',
  processing: 'info',
  resolved: 'success',
  cancelled: 'secondary',
}

export interface RecordsPanelProps {
  filter: SupportTicketFilter
  query: string
  items: SupportTicketSummary[]
  total: number
  hasMore: boolean
  loading: boolean
  loadingMore: boolean
  error: boolean
  onFilterChange: (filter: SupportTicketFilter) => void
  onQueryChange: (query: string) => void
  onLoadMore: () => void
  onOpenTicket: (ticketId: string) => void
  onRetry: () => void
}

export function RecordsPanel(props: RecordsPanelProps) {
  const { t } = useTranslation()
  const sentinelRef = useRef<HTMLButtonElement | null>(null)
  const { hasMore, loadingMore, onLoadMore } = props

  // 增量加载：滚到「加载更多」附近就自动续载，按钮同时保留给键盘用户
  useEffect(() => {
    const target = sentinelRef.current
    if (!target || !hasMore || loadingMore) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) onLoadMore()
    }, { rootMargin: '80px 0px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, onLoadMore])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-col gap-2.5 border-b border-mg-fill-0 px-4 py-3">
        <Input
          aria-label={t('common.customerService.records.searchAria')}
          onChange={(event) => props.onQueryChange(event.target.value)}
          placeholder={t('common.customerService.records.searchPlaceholder')}
          prefix={<LuSearch aria-hidden="true" size={14} />}
          value={props.query}
        />
        <Tabs onValueChange={(value) => props.onFilterChange(value as SupportTicketFilter)} value={props.filter}>
          <TabsList variant="pills">
            {FILTERS.map((filter) => (
              <TabsTrigger key={filter} value={filter} variant="pills">
                {t(`common.customerService.records.filters.${filter}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {props.error ? (
          <ResultBlock
            action={<Button onClick={props.onRetry} size="small" variant="outline">{t('common.customerService.records.retry')}</Button>}
            description={t('common.customerService.records.errorDesc')}
            role="alert"
            title={t('common.customerService.records.errorTitle')}
          />
        ) : props.loading ? (
          <div className="flex items-center justify-center gap-1.5 py-8 mg-text-caption text-mg-text-2">
            <LuLoaderCircle aria-hidden="true" className="animate-spin" size={14} />
            {t('common.customerService.records.loading')}
          </div>
        ) : props.items.length === 0 ? (
          <ResultBlock
            description={props.query
              ? t('common.customerService.records.emptySearch')
              : t('common.customerService.records.emptyDesc')}
            title={t('common.customerService.records.emptyTitle')}
          />
        ) : (
          <div aria-label={t('common.customerService.records.countAria', { count: props.total })} className="flex flex-col gap-2">
            {props.items.map((ticket) => (
              <RecordRow key={ticket.ticket_id} onOpen={props.onOpenTicket} ticket={ticket} />
            ))}
            {props.hasMore ? (
              <button
                className={cn(
                  'mt-1 inline-flex items-center justify-center gap-1.5 rounded-sm py-2 mg-text-caption text-mg-text-2',
                  'hover:bg-mg-fill-0 hover:text-mg-text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-glow',
                )}
                disabled={props.loadingMore}
                onClick={props.onLoadMore}
                ref={sentinelRef}
                type="button"
              >
                {props.loadingMore ? (
                  <>
                    <LuLoaderCircle aria-hidden="true" className="animate-spin" size={13} />
                    {t('common.customerService.records.loadingMore')}
                  </>
                ) : t('common.customerService.records.loadMore')}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

function RecordRow({
  ticket,
  onOpen,
}: {
  ticket: SupportTicketSummary
  onOpen: (ticketId: string) => void
}) {
  const { t } = useTranslation()
  const hasUnread = (ticket.unread_count ?? 0) > 0
  return (
    <button
      className={cn(
        'mg-tile mg-tile-hover flex w-full flex-col gap-1.5 px-3 py-2.5 text-left',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-glow',
      )}
      onClick={() => onOpen(ticket.ticket_id)}
      type="button"
    >
      <span className="flex items-center gap-1.5">
        <span className="mg-cs-meta text-mg-text-2">{ticket.display_type}</span>
        <Badge size="xs" variant={STATUS_VARIANT[ticket.status]}>{ticket.status_label}</Badge>
        {hasUnread ? (
          <Badge className="ml-auto" size="xs" variant="brand">
            {t('common.customerService.records.hasNew')}
          </Badge>
        ) : null}
      </span>
      <strong className="truncate mg-text-body font-semibold text-mg-text-1">{ticket.title}</strong>
      {ticket.latest_visible_message ? (
        <span className="truncate mg-cs-meta text-mg-text-2">{ticket.latest_visible_message}</span>
      ) : null}
      <span className="mg-cs-micro text-mg-text-3">
        <span className="font-mono">{ticket.ticket_id}</span>
        {' · '}
        {formatDateTime(ticket.updated_at)}
      </span>
    </button>
  )
}

function ResultBlock({
  title,
  description,
  action,
  role,
}: {
  title: string
  description: string
  action?: React.ReactNode
  role?: 'alert'
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-8 text-center" role={role}>
      <strong className="mg-text-body font-semibold text-mg-text-1">{title}</strong>
      <p className="m-0 max-w-[80%] mg-cs-meta leading-relaxed text-mg-text-2">{description}</p>
      {action ? <div className="mt-1.5">{action}</div> : null}
    </div>
  )
}
