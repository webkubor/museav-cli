/**
 * 通用消费分布卡（Top5 + 「其他」聚合；#666 支持「查看更多」展开全部明细并本地分页），
 * 模型/成员/API Key 三维共用。
 * 路由：/usage
 * API 来源：GET /usage/rankings/*
 */

import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LuChevronDown, LuChevronUp } from 'react-icons/lu'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { cn } from '@/lib/utils'
import type { UsageRankingItem } from '@/types'
import { formatMoney } from './usage-utils'
import { ErrorBlock, PanelSkeleton } from './usage-panel-states'
import {
  DIST_TOP_N,
  DIST_PAGE_SIZE,
  DIST_ROW_GRID,
  displayRankingName,
  rankingSharePercent,
  spendAmount,
  formatRankingSpend,
} from './usage-panel-shared'

interface DistributionPanelProps {
  title: string
  items: UsageRankingItem[]
  /** 总消费金额（rankings.totals.spend.amount），缺省时按 items 求和兜底。 */
  totalSpendAmount?: string
  currencySymbol: string
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  emptyTitle: string
  emptyDesc: string
  /** 行首图标（模型用 ModelIcon，成员/Key 用通用徽标）。 */
  leading: (item: UsageRankingItem, index: number) => ReactNode
  /** 行内次级说明（如模型的工作空间归因）。 */
  secondary?: (item: UsageRankingItem) => ReactNode
  /** 点击行 → 下钻调用日志。 */
  onDrill?: (item: UsageRankingItem) => void
  /** 展开全部明细（#666 查看更多）；状态由父级持有，与左侧饼图联动。 */
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  /** 展开态当前页（从 1 开始）；由父级持有，切维度/筛选/收起时父级统一重置。 */
  page: number
  onPageChange: (page: number) => void
}

function DistributionBarRow({
  leading,
  name,
  secondary,
  share,
  spendText,
  highlight,
  muted,
  onClick,
}: {
  leading: ReactNode
  name: string
  secondary?: ReactNode
  share: number
  spendText: string
  highlight: boolean
  muted?: boolean
  onClick?: () => void
}) {
  const inner = (
    <>
      <div className="flex min-w-0 items-center gap-2">
        {leading}
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium text-mg-text-1" title={name}>
            {name}
          </span>
          {secondary != null && (
            <span className="block truncate text-[11px] text-mg-text-3">{secondary}</span>
          )}
        </div>
      </div>
      <ProgressBar
        value={share}
        variant={highlight ? 'brand' : 'blue'}
        size="xs"
        showGlow={highlight}
        flow
        className={cn('w-full', muted && 'opacity-60')}
      />
      <span className={cn('text-right text-sm tabular-nums', highlight ? 'font-bold text-brand-base' : 'text-mg-text-2')}>
        {spendText}
      </span>
      <span className={cn('text-right text-sm tabular-nums', highlight ? 'font-bold text-mg-text-1' : 'text-mg-text-3')}>
        {share > 0 ? `${share.toFixed(0)}%` : '—'}
      </span>
    </>
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(DIST_ROW_GRID, 'w-full rounded-md px-1 py-1 text-left transition-colors hover:bg-mg-fill-0')}>
        {inner}
      </button>
    )
  }
  return <div className={cn(DIST_ROW_GRID, 'px-1 py-1')}>{inner}</div>
}

/** 通用消费分布卡：默认 Top5 + 「其他」聚合，点「查看更多」展开全部并本地分页（#666）。 */
export function DistributionPanel({
  title,
  items,
  currencySymbol,
  isLoading,
  isError,
  onRetry,
  emptyTitle,
  emptyDesc,
  leading,
  secondary,
  onDrill,
  expanded,
  onExpandedChange,
  page,
  onPageChange,
}: DistributionPanelProps) {
  const { t } = useTranslation()
  // 数据重查后条数可能变少，页码就地钳到有效范围，不额外发 setState
  const totalPages = Math.max(1, Math.ceil(items.length / DIST_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)

  const top = items.slice(0, DIST_TOP_N)
  const rest = items.slice(DIST_TOP_N)
  const otherSpend = rest.reduce((sum, it) => sum + spendAmount(it), 0)
  const otherShare = rest.reduce((sum, it) => sum + rankingSharePercent(it), 0)
  // 展开态：全部明细本地分页；折叠态：Top5 + 「其他」聚合行
  const rows = expanded ? items.slice((safePage - 1) * DIST_PAGE_SIZE, safePage * DIST_PAGE_SIZE) : top
  const rowIndexBase = expanded ? (safePage - 1) * DIST_PAGE_SIZE : 0

  return (
    <Card className="min-w-0 p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-mg-text-1">{title}</div>
        <div className="flex items-center gap-2">
          {/* 用量明细卡不展示总费用，仅保留排序标签「按费用 · 降序」（需求方#179） */}
          <span className="rounded-lg border border-mg-border bg-mg-fill-0 px-2.5 py-1 text-[12px] text-mg-text-3">
            {t('usage.distribution.bySpend')}
          </span>
        </div>
      </div>
      {isError ? (
        <ErrorBlock message={t('usage.error.rankings')} onRetry={onRetry} />
      ) : isLoading ? (
        <PanelSkeleton rows={5} />
      ) : items.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDesc} />
      ) : (
        <div className="space-y-3">
          {rows.map((item, i) => {
            const index = rowIndexBase + i
            return (
              <DistributionBarRow
                key={item.key ?? `${displayRankingName(item)}-${index}`}
                leading={leading(item, index)}
                name={displayRankingName(item)}
                secondary={secondary?.(item)}
                share={rankingSharePercent(item)}
                spendText={formatRankingSpend(item, currencySymbol)}
                highlight={index === 0}
                onClick={onDrill ? () => onDrill(item) : undefined}
              />
            )
          })}
          {!expanded && rest.length > 0 && (
            <DistributionBarRow
              leading={<span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-md bg-mg-fill-1 text-[11px] font-bold text-mg-text-3">+{rest.length}</span>}
              name={t('usage.distribution.other')}
              share={Math.max(0, Math.min(100, otherShare))}
              spendText={formatMoney(String(otherSpend), currencySymbol)}
              highlight={false}
              muted
            />
          )}
          {expanded && items.length > DIST_PAGE_SIZE && (
            <Pagination mode="page" page={safePage} total={items.length} pageSize={DIST_PAGE_SIZE} onPageChange={onPageChange} />
          )}
          {(rest.length > 0 || expanded) && (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => onExpandedChange(!expanded)}>
                {expanded ? t('usage.distribution.collapse') : t('usage.distribution.viewMore')}
                {expanded ? <LuChevronUp size={14} /> : <LuChevronDown size={14} />}
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
