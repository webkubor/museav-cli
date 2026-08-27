import { LuInbox, LuSearch } from 'react-icons/lu'
import { currencySymbol, isZhLang } from '@/features/models/model-format'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Money } from '@/components/ui/Money'
import { Pagination } from '@/components/ui/Pagination'
import { StatusBadge } from '@/components/ui/StatusBadge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table'
import { formatDateTimeWithSeconds, formatDuration } from '@/lib/format-date'
import { cn } from '@/lib/utils'
import type { CallLogItem } from '@/types'
import { deriveLogStatus, isModelNotStarted } from './guardrail'
import { TokenUsageCell } from '@/features/logs/TokenUsageCell'
import { buildStatusMap } from './status-map'

function formatMaybeDuration(ms: number | null | undefined) {
  if (!ms || ms <= 0) return '-'
  return formatDuration(ms)
}

function compactModelName(name: string) {
  return name.includes('/') ? name.split('/').pop() || name : name
}

/** 归属列：工作空间为主，成员 · API Key 为辅（对齐原型）。
 *  名称直接用后端按行返回的名字字段（workspace/account/api_key）；名字缺失即留空，绝不拿 id 顶替。 */
function ownerLines(row: CallLogItem) {
  const workspace = row.workspace?.name ?? ''
  const member = row.account.display_name
  // API Key 归属（需求方#132）：优先名称，无名回退 masked（PRD 允许「名称或 masked」）；
  // 两者皆空 = 后端 model-logs 未回该字段（api_key.name 现被填为 id/空，见 services/logs.ts #50），归后端补。
  const key = row.api_key.name || row.api_key.masked
  if (workspace) {
    // 主行=工作空间，副行=成员 · Key
    return { primary: workspace, secondary: [member, key].filter(Boolean).join(' · ') }
  }
  // 无工作空间名时降级：主行=成员，副行=Key
  return { primary: member || key || '—', secondary: member ? key : '' }
}

export function LogsTable({
  hasActiveFilters,
  hasMore,
  total,
  isFetching,
  isLoading,
  items,
  onClearFilters,
  onNext,
  onPrev,
  onSelectLog,
  page,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
  selectedLogId,
  docsUrl,
  onGoCreateKey,
}: {
  hasActiveFilters?: boolean
  hasMore: boolean
  /** 当前筛选命中总数（后端首页返回，qa#510）；未知时不展示「共 N 条」 */
  total?: number
  isFetching: boolean
  isLoading: boolean
  items: CallLogItem[]
  onClearFilters?: () => void
  onNext: () => void
  onPrev: () => void
  onSelectLog: (row: CallLogItem) => void
  page: number
  pageSize?: number
  pageSizeOptions?: number[]
  onPageSizeChange?: (size: number) => void
  selectedLogId?: string
  docsUrl?: string
  onGoCreateKey?: () => void
}) {
  const { t } = useTranslation()
  const statusMap = buildStatusMap(t)
  if (isLoading) return <LogsTableSkeleton />

  if (items.length === 0) {
    // 空态分型：有筛选=筛选无结果（给清除入口）；无筛选=真正暂无日志
    return (
      <div className="rounded-md border border-mg-border bg-mg-bg-0">
        {hasActiveFilters ? (
          <EmptyState
            icon={<LuSearch />}
            title={t('logs.emptyState.filteredTitle')}
            description={t('logs.emptyState.filteredDesc')}
            action={onClearFilters ? <Button variant="outline" size="sm" onClick={onClearFilters}>{t('logs.filter.clear')}</Button> : undefined}
          />
        ) : (
          <EmptyState
            icon={<LuInbox />}
            title={t('logs.emptyState.noLogsTitle')}
            description={t('logs.emptyState.noLogsDesc')}
            action={
              (onGoCreateKey || docsUrl) ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {onGoCreateKey && (
                    <Button variant="brand" size="sm" onClick={onGoCreateKey}>{t('logs.emptyState.createApiKey')}</Button>
                  )}
                  {docsUrl && (
                    <Button variant="outline" size="sm" onClick={() => window.open(docsUrl, '_blank', 'noopener')}>{t('logs.emptyState.viewDocs')}</Button>
                  )}
                </div>
              ) : undefined
            }
          />
        )}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-md border border-mg-border bg-mg-bg-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[150px]">{t('logs.table.time')}</TableHead>
            <TableHead>{t('logs.table.status')}</TableHead>
            <TableHead className="min-w-[190px]">{t('logs.table.model')}</TableHead>
            <TableHead className="min-w-[180px]">{t('logs.table.owner')}</TableHead>
            <TableHead>{t('logs.table.token')}</TableHead>
            <TableHead>{t('logs.table.cost')}</TableHead>
            <TableHead>{t('logs.table.latency')}</TableHead>
            <TableHead>{t('logs.table.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((row) => (
            <TableRow
              key={row.call_log_id}
              data-track="logs:row"
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
              {/* 需求方#161：列表主值统一 mg-text-body（对齐 Table/Money 行内基准），
                  次行/辅助文案统一 mg-text-caption；避免各列主值大小不一。 */}
              <TableCell className="whitespace-nowrap mg-text-body text-mg-text-2">
                {formatDateTimeWithSeconds(row.started_at)}
              </TableCell>
              <TableCell>
                <StatusBadge status={deriveLogStatus(row)} statusMap={statusMap} />
              </TableCell>
              <TableCell>
                {/* 对齐 PRD 原型 LogTable：模型列只显模型名纯文本，无图标、无副行（#50）。
                    控制台自身「最近调用」表同样纯文本，此处与之统一。 */}
                <div className="min-w-0">
                  <strong className="block truncate mg-text-body font-bold text-mg-text-1">
                    {compactModelName(row.model.display_name)}
                  </strong>
                </div>
              </TableCell>
              <TableCell>
                {(() => {
                  const { primary, secondary } = ownerLines(row)
                  return (
                    <div className="min-w-0">
                      <strong className="block truncate mg-text-body font-bold text-mg-text-1">{primary}</strong>
                      {secondary && (
                        <span className="block truncate mg-text-caption text-mg-text-3">{secondary}</span>
                      )}
                    </div>
                  )
                })()}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <TokenUsageCell row={row} />
              </TableCell>
              <TableCell>
                {(() => {
                  const val = Number(row.cost.amount)
                  const shown = isModelNotStarted(row) ? null : val > 0 ? row.cost.amount : null
                  // 仅极小额(显示为「< 0.0001」的近似值)才 hover 提示精确原值，普通费用保持干净（需求方·细节）
                  const tiny = shown != null && val > 0 && val < 0.0001
                  const sym = currencySymbol(row.cost.currency, isZhLang())
                  return tiny ? (
                    <span title={t('logs.table.exactCost', { amount: `${sym}${row.cost.amount}` })} className="cursor-help border-b border-dashed border-mg-border/60">
                      <Money amount={shown} currency={row.cost.currency} />
                    </span>
                  ) : (
                    <Money amount={shown} currency={row.cost.currency} />
                  )
                })()}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {isModelNotStarted(row) ? (
                  <div className="min-w-0">
                    <strong className="block text-mg-text-3">—</strong>
                    <span className="block mg-text-caption text-mg-text-3">{t('logs.metrics.noResponse')}</span>
                  </div>
                ) : (
                  <div className="min-w-0 cursor-help" title={t('logs.table.latencyTooltip')}>
                    <strong className="block font-mono font-bold tabular-nums text-mg-text-2">
                      {t('logs.table.firstTokenLatency', { value: row.speed.first_token_ms > 0 ? formatDuration(row.speed.first_token_ms) : '—' })}
                    </strong>
                    <span className="block font-mono tabular-nums mg-text-caption text-mg-text-3">
                      {t('logs.table.totalLatency', { value: formatMaybeDuration(row.duration_ms) })}
                    </span>
                  </div>
                )}
              </TableCell>
              <TableCell>
                {/* 对齐 PRD 原型：操作列为「详情」按钮（整行也可点开）。 */}
                <Button
                  variant="outline"
                  size="xs"
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelectLog(row)
                  }}
                >
                  {t('logs.table.detail')}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination
        mode="cursor"
        page={page}
        hasMore={hasMore}
        total={total}
        pageSize={pageSize}
        pageSizeOptions={pageSizeOptions}
        onPageSizeChange={onPageSizeChange}
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
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.length > 0 ? (
        chips.map((chip) => <Badge key={chip} variant="secondary">{chip}</Badge>)
      ) : (
        <span className="mg-text-caption text-mg-text-3">{t('logs.filter.defaultHint')}</span>
      )}
      {chips.length > 0 && (
        <button type="button" onClick={onClear} className="mg-text-caption font-bold text-brand-base hover:text-brand-deep">
          {t('logs.filter.clear')}
        </button>
      )}
    </div>
  )
}

export function FilterField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="mg-text-label text-mg-text-3">{label}</span>
      {children}
    </label>
  )
}
