/**
 * 用量分析辅助面板
 * 路由：/usage
 * API 来源：GET /usage/summary、GET /usage/rankings/*（含 /usage/rankings/workspaces）
 */

import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import type { UsageRankingItem } from '@/types'
import { cn } from '@/lib/utils'
import { formatMoney, formatNumber } from './usage-utils'
import { ProgressBar } from '@/components/ui/ProgressBar'
import {
  LuKey,
  LuTable2,
} from 'react-icons/lu'

/** 分布图 Top N，超出折叠成「其他」。 */
const DIST_TOP_N = 5

export interface CostSourceSection {
  title: string
  items: UsageRankingItem[]
  emptyLabel: string
  /** 下钻归属：点击卡片跳调用日志时用哪种上下文过滤。 */
  drillKind?: 'workspace' | 'apiKey' | 'model'
}

interface CostSourcePanelProps {
  sections: CostSourceSection[]
  currencySymbol: string
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  /** 点击某来源卡 → 携带该来源的 top 项跳调用日志。 */
  onDrill?: (kind: CostSourceSection['drillKind'], item: UsageRankingItem) => void
}

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
}

interface ModelDistributionPanelProps {
  items: UsageRankingItem[]
  totalSpendAmount?: string
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  currencySymbol: string
  emptyTitle: string
  emptyDesc: string
  onDrill?: (item: UsageRankingItem) => void
}

interface RankingPanelProps {
  items: UsageRankingItem[]
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  currencySymbol: string
  emptyTitle: string
  emptyDesc: string
  onDrill?: (item: UsageRankingItem) => void
}

function displayRankingName(item: UsageRankingItem): string {
  return item.name || item.key || '—'
}

function rankingSharePercent(item: UsageRankingItem): number {
  if (typeof item.share_percent !== 'number') return 0
  return Math.max(0, Math.min(100, item.share_percent))
}

function spendAmount(item: UsageRankingItem): number {
  return parseFloat(item.spend?.amount || '0') || 0
}

function formatRankingSpend(item: UsageRankingItem, currencySymbol: string): string {
  return item.spend?.amount ? formatMoney(item.spend.amount, currencySymbol) : '—'
}

function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, idx) => (
        <div key={idx} className="h-9 rounded-lg bg-mg-fill-1 animate-pulse" />
      ))}
    </div>
  )
}

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 text-center text-sm text-mg-danger">
      {message}
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t('usage.retry')}
      </Button>
    </div>
  )
}

const DIST_ROW_GRID = 'grid grid-cols-[minmax(130px,180px)_minmax(120px,1fr)_72px_46px] items-center gap-3'

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

function ApiKeyRankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
        rank <= 3 ? 'bg-brand-selected-bg text-brand-base' : 'bg-mg-fill-1 text-mg-text-3',
      )}
    >
      {rank.toString().padStart(2, '0')}
    </span>
  )
}

/**
 * 成本来源侧栏（对齐 PRD §9）：三类各展示「最高消费」的 Top 1
 * ——最高消费工作空间 / 最高消费模型 / 最高消费 API Key，同屏三张卡并列，
 * 每张给 名称 + 金额 · 占比%。卡片可点击下钻到调用日志（onDrill）。
 */
export function CostSourcePanel({
  sections,
  currencySymbol,
  isLoading,
  isError,
  onRetry,
  onDrill,
}: CostSourcePanelProps) {
  const { t } = useTranslation()

  return (
    <Card className="min-w-0 p-5 sm:p-6">
      <div className="mb-4 text-sm font-semibold text-mg-text-1">{t('usage.sources.title')}</div>

      {isError ? (
        <ErrorBlock message={t('usage.error.rankings')} onRetry={onRetry} />
      ) : isLoading ? (
        <PanelSkeleton rows={3} />
      ) : (
        <div className="space-y-3">
          {sections.map((section) => {
            const top = section.items[0]
            const canDrill = !!onDrill && !!top
            const body = (
              <>
                <div className="truncate text-[12px] text-mg-text-3">{section.title}</div>
                {top ? (
                  <>
                    <div className="mt-1 truncate text-sm font-bold text-mg-text-1">{displayRankingName(top)}</div>
                    <div className="mt-0.5 flex items-baseline gap-1.5 text-[12px]">
                      <span className="font-semibold tabular-nums text-brand-base">{formatRankingSpend(top, currencySymbol)}</span>
                      <span className="text-mg-text-3">·</span>
                      <span className="tabular-nums text-mg-text-2">{rankingSharePercent(top).toFixed(1)}%</span>
                    </div>
                  </>
                ) : (
                  <div className="mt-1 text-[12px] text-mg-text-3">{section.emptyLabel}</div>
                )}
              </>
            )
            const cls = 'rounded-lg border border-mg-border bg-mg-fill-0/40 p-3'
            return canDrill ? (
              <button
                key={section.title}
                type="button"
                onClick={() => onDrill?.(section.drillKind, top)}
                className={cn(cls, 'block w-full text-left transition-colors hover:border-brand-base/40 hover:bg-mg-fill-0')}
              >
                {body}
              </button>
            ) : (
              <div key={section.title} className={cls}>
                {body}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

/** 通用消费分布卡（Top5 + 「其他」聚合 + 总消费），模型/成员/API Key 三维共用。 */
export function DistributionPanel({
  title,
  items,
  totalSpendAmount,
  currencySymbol,
  isLoading,
  isError,
  onRetry,
  emptyTitle,
  emptyDesc,
  leading,
  secondary,
  onDrill,
}: DistributionPanelProps) {
  const { t } = useTranslation()

  const top = items.slice(0, DIST_TOP_N)
  const rest = items.slice(DIST_TOP_N)
  const otherSpend = rest.reduce((sum, it) => sum + spendAmount(it), 0)
  const otherShare = rest.reduce((sum, it) => sum + rankingSharePercent(it), 0)
  const totalAmount = totalSpendAmount != null ? parseFloat(totalSpendAmount) || 0 : items.reduce((s, it) => s + spendAmount(it), 0)

  return (
    <Card className="min-w-0 p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-mg-text-1">{title}</div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <span className="text-[12px] text-mg-text-3">
              {t('usage.distribution.total')}
              <span className="ml-1 font-semibold tabular-nums text-mg-text-1">{formatMoney(String(totalAmount), currencySymbol)}</span>
            </span>
          )}
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
          {top.map((item, index) => (
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
          ))}
          {rest.length > 0 && (
            <DistributionBarRow
              leading={<span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-md bg-mg-fill-1 text-[11px] font-bold text-mg-text-3">+{rest.length}</span>}
              name={t('usage.distribution.other')}
              share={Math.max(0, Math.min(100, otherShare))}
              spendText={formatMoney(String(otherSpend), currencySymbol)}
              highlight={false}
              muted
            />
          )}
        </div>
      )}
    </Card>
  )
}

/** 模型消费分布卡（含工作空间归因次级行 + Top5 折叠「其他」）。 */
export function ModelDistributionPanel({
  items,
  totalSpendAmount,
  isLoading,
  isError,
  onRetry,
  currencySymbol,
  emptyTitle,
  emptyDesc,
  onDrill,
}: ModelDistributionPanelProps) {
  const { t } = useTranslation()

  return (
    <DistributionPanel
      title={t('usage.distribution.title')}
      items={items}
      totalSpendAmount={totalSpendAmount}
      currencySymbol={currencySymbol}
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      emptyTitle={emptyTitle}
      emptyDesc={emptyDesc}
      leading={(item) => (
        <ModelIcon model={{ display_name: displayRankingName(item), vendor: item.vendor || item.name || item.key || '' }} size={22} rounded="rounded-md" />
      )}
      secondary={(item) => {
        // 归因：使用该模型的工作空间（Swagger usage.RankingItem.workspaces 数组，或单值 workspace_name）。
        // TODO(#447): 后端未返回归因时显示占位「—」。
        const ws = item.workspaces?.length ? item.workspaces.join('、') : item.workspace_name
        return `${t('usage.attr.workspace')}: ${ws || '—'}`
      }}
      onDrill={onDrill}
    />
  )
}

/** API Key 排行卡，保留表格扫描效率；含「归属人」归因列（#447 未返回时「—」），行可下钻。 */
export function ApiKeyRankingPanel({
  items,
  isLoading,
  isError,
  onRetry,
  currencySymbol,
  emptyTitle,
  emptyDesc,
  onDrill,
}: RankingPanelProps) {
  const { t } = useTranslation()
  const grid = 'grid grid-cols-[58px_minmax(120px,1fr)_120px_100px_110px_96px] gap-3'

  return (
    <Card className="min-w-0 p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-mg-text-1">
        <LuTable2 size={15} className="text-brand-base" />
        {t('usage.apiKeyRank.title')}
      </div>
      {isError ? (
        <ErrorBlock message={t('usage.error.rankings')} onRetry={onRetry} />
      ) : isLoading ? (
        <PanelSkeleton rows={5} />
      ) : items.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDesc} />
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[740px]">
            <div className={cn(grid, 'border-b border-mg-border pb-3 text-[12px] font-semibold text-mg-text-3')}>
              <span>{t('usage.apiKeyRank.col.rank')}</span>
              <span>{t('usage.apiKeyRank.col.apiKey')}</span>
              <span>{t('usage.apiKeyRank.col.owner')}</span>
              <span>{t('usage.apiKeyRank.col.requests')}</span>
              <span>{t('usage.apiKeyRank.col.tokens')}</span>
              <span className="text-right">{t('usage.apiKeyRank.col.spend')}</span>
            </div>
            <div className="divide-y divide-mg-border">
              {items.slice(0, 10).map((item, index) => {
                const rank = item.rank ?? index + 1
                const name = displayRankingName(item)
                const row = (
                  <>
                    <ApiKeyRankBadge rank={rank} />
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-selected-bg text-brand-base">
                        <LuKey size={14} />
                      </span>
                      <span className="truncate font-medium text-mg-text-1" title={name}>{name}</span>
                    </div>
                    {/* TODO(#447): owner 后端返回后直接显示，缺省「—」 */}
                    <span className="truncate text-mg-text-2" title={item.owner ?? undefined}>{item.owner || '—'}</span>
                    <span className="font-mono text-mg-text-2">{formatNumber(item.requests ?? 0)}</span>
                    <span className="font-mono text-mg-text-2">{formatNumber(item.tokens ?? 0)}</span>
                    <span className="text-right font-mono text-mg-text-1">{formatRankingSpend(item, currencySymbol)}</span>
                  </>
                )
                return onDrill ? (
                  <button
                    key={item.key ?? `${name}-${index}`}
                    type="button"
                    onClick={() => onDrill(item)}
                    className={cn(grid, 'w-full items-center py-3 text-left text-sm transition-colors hover:bg-mg-fill-0')}
                  >
                    {row}
                  </button>
                ) : (
                  <div key={item.key ?? `${name}-${index}`} className={cn(grid, 'items-center py-3 text-sm')}>
                    {row}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

// ─── 用量统计三大卡：头部指标 + 分解进度条（对齐 PRD 原型）────────────────
export type UsageStatTone = 'emerald' | 'amber' | 'blue' | 'brand'

export interface UsageStatRow {
  label: string
  value: string
  /** 进度条占比 0-100 */
  pct?: number
  variant?: UsageStatTone
  /** 是否画进度条；false = 只显数值（如平均延迟） */
  bar?: boolean
}

interface UsageStatCardProps {
  icon: React.ReactNode
  label: string
  value: string
  suffix?: string
  loading?: boolean
  breakdownTitle: string
  rows: UsageStatRow[]
  /** 数据暂缺时的占位提示（如费用分项待后端支持） */
  pendingHint?: string
}

/** 单个用量统计大卡（复用 Card + ProgressBar）。总费用/请求总量/总Tokens 各一张。 */
export function UsageStatCard({ icon, label, value, suffix, loading, breakdownTitle, rows, pendingHint }: UsageStatCardProps) {
  return (
    <Card className="space-y-4 p-5 sm:p-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-mg-fill-1 text-mg-text-2">{icon}</span>
          <span className="text-xs font-bold uppercase tracking-wider text-mg-text-2">{label}</span>
        </div>
        {loading ? (
          <div className="h-8 w-28 animate-pulse rounded bg-mg-fill-1" />
        ) : (
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-mg-text-1">{value}</span>
            {suffix && <span className="text-xs font-medium text-mg-text-3">{suffix}</span>}
          </div>
        )}
      </div>

      <div className="space-y-2.5 border-t border-mg-border/50 pt-4">
        <div className="text-xs font-bold uppercase tracking-wider text-mg-text-2">{breakdownTitle}</div>
        {rows.map((r) => (
          <div key={r.label} className="space-y-1">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-mg-text-2">{r.label}</span>
              <span className="font-mono font-semibold text-mg-text-1">{r.value}</span>
            </div>
            {r.bar !== false && (
              <ProgressBar value={r.pct ?? 0} variant={r.variant ?? 'brand'} size="xs" showGlow={false} />
            )}
          </div>
        ))}
        {pendingHint && <div className="pt-0.5 text-xs text-mg-text-3">{pendingHint}</div>}
      </div>
    </Card>
  )
}
