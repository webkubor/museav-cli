import { LuChevronRight, LuInbox, LuSearch } from 'react-icons/lu'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
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
import { deriveLogStatus, isModelNotStarted, type DerivedLogStatus } from './guardrail'

/** 派生三态 → StatusBadge 配置。i18n 文案在 buildStatusMap 里注入。 */
function buildStatusMap(t: (key: string) => string): Record<DerivedLogStatus, StatusConfig> {
  return {
    success: { label: t('logs.status.success'), variant: 'success' },
    guarded: { label: t('logs.status.guarded'), variant: 'warning' },
    error: { label: t('logs.status.error'), variant: 'danger' },
  }
}

/** 延迟阈值着色：>3s 警告色，>6s 危险色，其余默认。让慢请求一眼可见。 */
function durationTone(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return 'text-mg-text-2'
  if (ms >= 6000) return 'text-mg-danger'
  if (ms >= 3000) return 'text-mg-warning'
  return 'text-mg-text-2'
}

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
  const key = row.api_key.name
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
  isFetching,
  isLoading,
  items,
  onClearFilters,
  onNext,
  onPrev,
  onSelectLog,
  page,
  selectedLogId,
  docsUrl,
  onGoCreateKey,
}: {
  hasActiveFilters?: boolean
  hasMore: boolean
  isFetching: boolean
  isLoading: boolean
  items: CallLogItem[]
  onClearFilters?: () => void
  onNext: () => void
  onPrev: () => void
  onSelectLog: (row: CallLogItem) => void
  page: number
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
            title="没有匹配的调用日志"
            description="当前筛选条件下没有记录，试试放宽条件，或用完整 Request ID 精确检索。"
            action={onClearFilters ? <Button variant="outline" size="sm" onClick={onClearFilters}>清除筛选</Button> : undefined}
          />
        ) : (
          <EmptyState
            icon={<LuInbox />}
            title="暂无调用日志"
            description="通过 API Key 发起模型调用后，请求会在这里按时间倒序展示。"
            action={
              (onGoCreateKey || docsUrl) ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {onGoCreateKey && (
                    <Button variant="brand" size="sm" onClick={onGoCreateKey}>创建 API Key</Button>
                  )}
                  {docsUrl && (
                    <Button variant="outline" size="sm" onClick={() => window.open(docsUrl, '_blank', 'noopener')}>查看接入文档</Button>
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
              <TableCell className="whitespace-nowrap mg-text-caption text-mg-text-2">
                {formatDateTimeWithSeconds(row.started_at)}
              </TableCell>
              <TableCell>
                <StatusBadge status={deriveLogStatus(row)} statusMap={statusMap} />
              </TableCell>
              <TableCell>
                <div className="flex min-w-0 items-center gap-2">
                  <ModelIcon
                    model={{ display_name: row.model.display_name, vendor: row.provider.name }}
                    rounded="rounded-md"
                    size={20}
                  />
                  <div className="min-w-0">
                    {/* 对齐 PRD 原型：模型列只显模型名，无副行（#50）。
                        原 provider.name 副行会把后端返回的内部实例 UUID 当文案露出来，PRD 无此行。 */}
                    <strong className="block truncate mg-text-body font-bold text-mg-text-1">
                      {compactModelName(row.model.display_name)}
                    </strong>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                {(() => {
                  const { primary, secondary } = ownerLines(row)
                  return (
                    <div className="min-w-0">
                      <strong className="block truncate mg-text-caption font-bold text-mg-text-1">{primary}</strong>
                      {secondary && (
                        <span className="block truncate mg-text-caption text-mg-text-3">{secondary}</span>
                      )}
                    </div>
                  )
                })()}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {isModelNotStarted(row) ? (
                  <div className="min-w-0">
                    <strong className="block text-mg-text-3">—</strong>
                    <span className="block mg-text-caption text-mg-text-3">{t('logs.metrics.notStarted')}</span>
                  </div>
                ) : row.usage.total_tokens > 0 ? (
                  <div className="min-w-0">
                    <strong className="block font-mono font-bold tabular-nums text-mg-text-1">
                      {formatNumber(row.usage.total_tokens)}
                    </strong>
                    <span className="block font-mono tabular-nums mg-text-caption text-mg-text-3">
                      输入 {formatNumber(row.usage.input_tokens)} · 输出 {formatNumber(row.usage.output_tokens)}
                    </span>
                  </div>
                ) : (
                  <div className="min-w-0">
                    <strong className="block text-mg-text-3">—</strong>
                    <span className="block mg-text-caption text-mg-text-3">{t('logs.metrics.noTokens')}</span>
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Money
                  amount={isModelNotStarted(row) ? null : Number(row.cost.amount) > 0 ? row.cost.amount : null}
                  currency={row.cost.currency}
                />
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {isModelNotStarted(row) ? (
                  <div className="min-w-0">
                    <strong className="block text-mg-text-3">—</strong>
                    <span className="block mg-text-caption text-mg-text-3">{t('logs.metrics.notStarted')}</span>
                  </div>
                ) : (
                  <div className="min-w-0">
                    <strong className={cn('block font-mono font-bold tabular-nums', durationTone(row.duration_ms))}>
                      {formatMaybeDuration(row.duration_ms)}
                    </strong>
                    <span className="block font-mono tabular-nums mg-text-caption text-mg-text-3">
                      首包 {row.speed.first_token_ms > 0 ? formatDuration(row.speed.first_token_ms) : '-'}
                    </span>
                  </div>
                )}
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

export function FilterField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="mg-text-label text-mg-text-3">{label}</span>
      {children}
    </label>
  )
}
