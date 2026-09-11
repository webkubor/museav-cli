import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { LuArrowLeft, LuSearch, LuInbox } from 'react-icons/lu'
import { appToast } from '@/lib/app-toast'
import { listSupportTickets } from '@/services/support'
import type { SupportTicketDetail, SupportTicketFilter, SupportTicketSummary } from '@/interfaces/support'

const FILTERS: SupportTicketFilter[] = ['all', 'processing', 'ended']

export interface TicketsListProps {
  onSelect: (id: string) => void
  onClose: () => void
}

/** 服务记录列表：游标分页 + filter + 搜索 */
export function TicketsList({ onSelect, onClose }: TicketsListProps) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<SupportTicketFilter>('all')
  const [q, setQ] = useState('')
  const [items, setItems] = useState<SupportTicketSummary[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)

  async function load(reset: boolean) {
    setLoading(true)
    try {
      const page = await listSupportTickets({ filter, q: q.trim() || undefined, cursor: reset ? undefined : cursor ?? undefined })
      setItems((prev) => (reset ? page.items : [...prev, ...page.items]))
      setCursor(page.next_cursor)
      setHasMore(page.has_more)
    } catch (error) {
      appToast.requestError(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // 切换 filter 触发重新拉取列表，setLoading 是异步请求的必要前置状态
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

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
        {!loading && items.length === 0 && (
          <EmptyState icon={<LuInbox />} title={t('common.customerService.tickets.empty')} />
        )}
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            // 字段与层级照 PRD 原型 CustomerSupportHistoryList.tsx 的 history-row：
            // 第一行「记录类型 + 状态」，第二行标题，第三行「编号 · 更新时间」+ 未读标记。
            // 原先漏了**记录类型**与**未读**两个字段（接口的 type / unread 都给了、没渲染），
            // 而 PRD §「记录类型」「未读来源」两节都明确要求展示，QA 会逐条验。
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className="mg-tile text-left px-3 py-2 hover:border-brand-mid/50 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="mg-text-caption text-mg-text-3">
                  {t(`common.customerService.tickets.types.${item.type}`, { defaultValue: item.type })}
                </span>
                <Badge variant="outline" size="sm">{item.status}</Badge>
              </div>
              {item.title && <p className="m-0 mt-1 mg-text-caption font-medium text-mg-text-1 line-clamp-2" title={item.title}>{item.title}</p>}
              <div className="mt-1 flex items-center justify-between gap-2">
                <small className="min-w-0 truncate text-[10px] text-mg-text-3" title={item.ticket_no}>
                  {item.ticket_no} · {new Date(item.updated_at).toLocaleString()}
                </small>
                {item.unread && (
                  <b className="shrink-0 rounded-full bg-mg-primary-light px-1.5 py-0.5 text-[10px] font-medium text-brand-base">
                    {t('common.customerService.tickets.unread')}
                  </b>
                )}
              </div>
            </button>
          ))}
        </div>
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

export interface TicketDetailViewProps {
  detail: SupportTicketDetail | null
  onBack: () => void
  onReopen: () => void
  onRate: (stars: number) => void
}

export function TicketDetailView({ detail, onBack, onReopen, onRate }: TicketDetailViewProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-mg-fill-0">
        <button type="button" onClick={onBack} aria-label={t('common.customerService.tickets.back')} className="text-mg-text-2 hover:text-mg-text-1">
          <LuArrowLeft size={16} />
        </button>
        <p className="m-0 mg-text-body font-medium text-mg-text-1 flex-1">{detail?.ticket_no ?? ''}</p>
        {detail && <Badge variant="outline" size="sm">{detail.status}</Badge>}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {!detail && <p className="mg-text-caption text-mg-text-3">{t('common.customerService.tickets.loading')}</p>}
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
                  {t(`common.customerService.tickets.types.${detail.type}`, { defaultValue: detail.type })}
                </dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-mg-text-3">{t('common.customerService.tickets.detail.idLabel')}</dt>
                <dd className="m-0 min-w-0 truncate font-medium text-mg-text-2" title={detail.ticket_no}>{detail.ticket_no}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-mg-text-3">{t('common.customerService.tickets.detail.createdLabel')}</dt>
                <dd className="m-0 text-mg-text-2">{new Date(detail.created_at).toLocaleString()}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-mg-text-3">{t('common.customerService.tickets.detail.updatedLabel')}</dt>
                <dd className="m-0 text-mg-text-2">{new Date(detail.updated_at).toLocaleString()}</dd>
              </div>
              {(detail.agent_name || detail.agent_no) && (
                <div className="flex gap-1.5">
                  <dt className="shrink-0 text-mg-text-3">{t('common.customerService.tickets.detail.agentLabel')}</dt>
                  <dd className="m-0 min-w-0 truncate text-mg-text-2">{[detail.agent_name, detail.agent_no].filter(Boolean).join(' · ')}</dd>
                </div>
              )}
            </dl>
            {detail.description && <p className="m-0 mg-text-body text-mg-text-1 whitespace-pre-wrap">{detail.description}</p>}
            {detail.sla_text && <p className="m-0 mg-text-caption text-mg-text-3">{detail.sla_text}</p>}
            {typeof detail.rating === 'number' && (
              <p className="m-0 mg-text-caption text-mg-warning">{'★'.repeat(detail.rating)}{'☆'.repeat(5 - detail.rating)}</p>
            )}

            <div className="flex gap-2 mt-2">
              {detail.capabilities.can_reopen && (
                <Button size="small" variant="secondary" onClick={onReopen}>{t('common.customerService.tickets.reopen')}</Button>
              )}
              {detail.type === 'handoff' && typeof detail.rating !== 'number' && detail.status !== 'processing' && (
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
