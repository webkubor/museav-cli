import { LuChevronRight } from 'react-icons/lu'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Money } from '@/components/ui/Money'
import { Pagination } from '@/components/ui/Pagination'
import { StatusBadge, type StatusConfig } from '@/components/ui/StatusBadge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { formatDateTimeWithSeconds, formatDuration } from '@/lib/format-date'
import { cn, formatNumber } from '@/lib/utils'
import type { CallLogItem } from '@/types'

const STATUS_MAP: Record<string, StatusConfig> = {
  accepted: { label: '处理中', variant: 'secondary', dot: true },
  succeeded: { label: '成功', variant: 'success' },
  failed: { label: '失败', variant: 'destructive' },
  rejected: { label: '已拒绝', variant: 'warning' },
}

function formatMaybeDuration(ms: number | null | undefined) {
  if (!ms || ms <= 0) return '-'
  return formatDuration(ms)
}

function compactModelName(name: string) {
  return name.includes('/') ? name.split('/').pop() || name : name
}

function ownerLine(row: CallLogItem) {
  return row.account.display_name !== '—' ? row.account.display_name : row.api_key.name
}

export function LogsTable({
  hasMore,
  isFetching,
  isLoading,
  items,
  onNext,
  onPrev,
  onSelectLog,
  page,
  selectedLogId,
}: {
  hasMore: boolean
  isFetching: boolean
  isLoading: boolean
  items: CallLogItem[]
  onNext: () => void
  onPrev: () => void
  onSelectLog: (row: CallLogItem) => void
  page: number
  selectedLogId?: string
}) {
  if (isLoading) return <LogsTableSkeleton />

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-mg-border bg-mg-bg-0">
        <EmptyState title="没有匹配的调用日志" description="调整筛选条件，或使用完整 Request ID 精确检索。" />
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-md border border-mg-border bg-mg-bg-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[150px]">时间</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="min-w-[190px]">模型</TableHead>
            <TableHead className="min-w-[180px]">归属</TableHead>
            <TableHead>Token</TableHead>
            <TableHead>费用</TableHead>
            <TableHead>延迟</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((row) => (
            <TableRow
              key={row.call_log_id}
              aria-selected={selectedLogId === row.call_log_id}
              className={cn(
                'cursor-pointer outline-none hover:bg-mg-fill-0/70 focus-visible:bg-mg-fill-0/70',
                selectedLogId === row.call_log_id && 'bg-brand-selected-bg/70'
              )}
              onClick={() => onSelectLog(row)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelectLog(row)
                }
              }}
              tabIndex={0}
            >
              <TableCell className="whitespace-nowrap mg-text-caption text-mg-text-2">
                {formatDateTimeWithSeconds(row.started_at)}
              </TableCell>
              <TableCell>
                <StatusBadge status={row.status} statusMap={STATUS_MAP} />
              </TableCell>
              <TableCell>
                <div className="flex min-w-0 items-center gap-2">
                  <ModelIcon
                    model={{ display_name: row.model.display_name, vendor: row.provider.name }}
                    rounded="rounded-md"
                    size={20}
                  />
                  <div className="min-w-0">
                    <strong className="block truncate mg-text-body font-bold text-mg-text-1">
                      {compactModelName(row.model.display_name)}
                    </strong>
                    <span className="block truncate mg-text-caption text-mg-text-3">{row.provider.name}</span>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="min-w-0">
                  <strong className="block truncate mg-text-caption font-bold text-mg-text-1">
                    {ownerLine(row)}
                  </strong>
                  <span className="block truncate mg-text-caption text-mg-text-3">{row.api_key.name}</span>
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap font-mono text-mg-text-2 tabular-nums">
                {formatNumber(row.usage.total_tokens)}
              </TableCell>
              <TableCell>
                <Money amount={Number(row.cost.amount) > 0 ? row.cost.amount : null} currency={row.cost.currency} />
              </TableCell>
              <TableCell className="whitespace-nowrap font-mono text-mg-text-2 tabular-nums">
                {formatMaybeDuration(row.duration_ms)}
              </TableCell>
              <TableCell align="right">
                <LuChevronRight className="ml-auto h-4 w-4 text-mg-text-3" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination
        mode="cursor"
        page={page}
        hasMore={hasMore}
        total={items.length}
        onPrev={onPrev}
        onNext={onNext}
        loading={isFetching}
      />
    </div>
  )
}

function LogsTableSkeleton() {
  return (
    <div className="rounded-md border border-mg-border bg-mg-bg-0 p-[var(--mg-panel-padding-md)]">
      <div className="grid gap-3">
        {[0, 1, 2, 3, 4].map((item) => (
          <div key={item} className="grid grid-cols-[1.2fr_.8fr_1.4fr_1.2fr_.7fr_.7fr_.7fr] gap-4">
            <span className="h-5 animate-pulse rounded-sm bg-mg-fill-1" />
            <span className="h-5 animate-pulse rounded-sm bg-mg-fill-1" />
            <span className="h-5 animate-pulse rounded-sm bg-mg-fill-1" />
            <span className="h-5 animate-pulse rounded-sm bg-mg-fill-1" />
            <span className="h-5 animate-pulse rounded-sm bg-mg-fill-1" />
            <span className="h-5 animate-pulse rounded-sm bg-mg-fill-1" />
            <span className="h-5 animate-pulse rounded-sm bg-mg-fill-1" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function ActiveFilterChips({
  chips,
  onClear,
}: {
  chips: string[]
  onClear: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.length > 0 ? (
        chips.map((chip) => <Badge key={chip} variant="secondary">{chip}</Badge>)
      ) : (
        <span className="mg-text-caption text-mg-text-3">默认显示近 7 天全部请求</span>
      )}
      {chips.length > 0 && (
        <button type="button" onClick={onClear} className="mg-text-caption font-bold text-brand-base hover:text-brand-deep">
          清空筛选
        </button>
      )}
    </div>
  )
}
