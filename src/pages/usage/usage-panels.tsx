/**
 * 用量分析辅助面板
 * 路由：/usage
 * API 来源：GET /usage/summary、GET /usage/rankings/*（含 /usage/rankings/workspaces）
 */

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
  LuShieldCheck,
  LuTable2,
} from 'react-icons/lu'

export interface CostSourceSection {
  title: string
  items: UsageRankingItem[]
  emptyLabel: string
}

interface UsageHealthPanelProps {
  rangeLabel: string
  totalSpend: string
  totalRequests: string
  totalTokens: string
}

interface CostSourcePanelProps {
  sections: CostSourceSection[]
  currencySymbol: string
  isLoading: boolean
  isError: boolean
  onRetry: () => void
}

interface ModelDistributionPanelProps {
  items: UsageRankingItem[]
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  currencySymbol: string
}

interface ApiKeyRankingPanelProps {
  items: UsageRankingItem[]
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  currencySymbol: string
}

function displayRankingName(item: UsageRankingItem): string {
  return item.name || item.key || '—'
}

function rankingSharePercent(item: UsageRankingItem): number {
  if (typeof item.share_percent !== 'number') return 0
  return Math.max(0, Math.min(100, item.share_percent))
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

function ModelDistributionRow({
  item,
  index,
  currencySymbol,
}: {
  item: UsageRankingItem
  index: number
  currencySymbol: string
}) {
  const name = displayRankingName(item)
  const share = rankingSharePercent(item)
  return (
    <div className="grid grid-cols-[minmax(130px,180px)_minmax(120px,1fr)_72px_46px] items-center gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <ModelIcon model={{ display_name: name, vendor: item.name || item.key || '' }} size={22} rounded="rounded-md" />
        <span className="truncate text-sm font-medium text-mg-text-1" title={name}>
          {name}
        </span>
      </div>
      <ProgressBar 
        value={share} 
        variant={index === 0 ? 'brand' : 'blue'} 
        size="xs" 
        showGlow={index === 0} 
        className="w-full" 
      />
      <span className={cn('text-right text-sm tabular-nums', index === 0 ? 'font-bold text-brand-base' : 'text-mg-text-2')}>
        {formatRankingSpend(item, currencySymbol)}
      </span>
      <span className={cn('text-right text-sm tabular-nums', index === 0 ? 'font-bold text-mg-text-1' : 'text-mg-text-3')}>
        {share > 0 ? `${share.toFixed(0)}%` : '—'}
      </span>
    </div>
  )
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

/** 用量概览横条，只展示接口已返回的真实汇总数据。 */
export function UsageHealthPanel({
  rangeLabel,
  totalSpend,
  totalRequests,
  totalTokens,
}: UsageHealthPanelProps) {
  const { t } = useTranslation()

  return (
    <Card className="overflow-hidden border-brand-base/20 bg-mg-bg-0 p-0">
      <div className="grid gap-0 xl:grid-cols-[188px_repeat(3,minmax(0,1fr))]">
        <div className="flex items-center gap-3 border-b border-mg-border px-4 py-4 xl:border-b-0 xl:border-r">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-selected-bg text-brand-base">
            <LuShieldCheck size={17} />
          </span>
          <div>
            <div className="text-sm font-semibold text-mg-text-1">{t('usage.health.title')}</div>
            <div className="mt-1 text-[12px] text-mg-success">{t('usage.health.safe')}</div>
          </div>
        </div>

        <div className="border-b border-mg-border px-4 py-4 xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-mg-text-3">{t('usage.health.metric.spend')}</span>
            <strong className="font-mono text-mg-text-1">{totalSpend}</strong>
          </div>
          <div className="mt-1 text-[12px] text-mg-text-3">{rangeLabel}</div>
        </div>

        <div className="border-b border-mg-border px-4 py-4 xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-mg-text-3">{t('usage.health.metric.requests')}</span>
            <strong className="font-mono text-mg-text-1">{totalRequests}</strong>
          </div>
          <div className="mt-1 text-[12px] text-mg-text-3">{rangeLabel}</div>
        </div>

        <div className="px-4 py-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-mg-text-3">{t('usage.health.metric.tokens')}</span>
            <strong className="font-mono text-mg-text-1">{totalTokens}</strong>
          </div>
          <div className="mt-1 text-[12px] text-mg-text-3">{rangeLabel}</div>
        </div>
      </div>
    </Card>
  )
}

/**
 * 成本来源侧栏（对齐 PRD §9）：三类各展示「最高消费」的 Top 1
 * ——最高消费工作空间 / 最高消费模型 / 最高消费 API Key，同屏三张卡并列，
 * 每张给 名称 + 金额 · 占比%。不做 tab 排行列表（那是「排行榜」区的职责，避免重复）。
 */
export function CostSourcePanel({
  sections,
  currencySymbol,
  isLoading,
  isError,
  onRetry,
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
            return (
              <div key={section.title} className="rounded-lg border border-mg-border bg-mg-fill-0/40 p-3">
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
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

/** 模型消费分布卡。 */
export function ModelDistributionPanel({
  items,
  isLoading,
  isError,
  onRetry,
  currencySymbol,
}: ModelDistributionPanelProps) {
  const { t } = useTranslation()

  return (
    <Card className="min-w-0 p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-mg-text-1">{t('usage.distribution.title')}</div>
        <span className="rounded-lg border border-mg-border bg-mg-fill-0 px-2.5 py-1 text-[12px] text-mg-text-3">
          {t('usage.distribution.bySpend')}
        </span>
      </div>
      {isError ? (
        <ErrorBlock message={t('usage.error.rankings')} onRetry={onRetry} />
      ) : isLoading ? (
        <PanelSkeleton rows={5} />
      ) : items.length === 0 ? (
        <EmptyState title={t('usage.rankings.empty')} description={t('usage.rankings.emptyDesc')} />
      ) : (
        <div className="space-y-4">
          {items.slice(0, 5).map((item, index) => (
            <ModelDistributionRow
              key={item.key ?? `${displayRankingName(item)}-${index}`}
              item={item}
              index={index}
              currencySymbol={currencySymbol}
            />
          ))}
        </div>
      )}
    </Card>
  )
}

/** API Key 排行卡，保留表格扫描效率。 */
export function ApiKeyRankingPanel({
  items,
  isLoading,
  isError,
  onRetry,
  currencySymbol,
}: ApiKeyRankingPanelProps) {
  const { t } = useTranslation()

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
        <EmptyState title={t('usage.rankings.empty')} description={t('usage.rankings.emptyDesc')} />
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[620px]">
            <div className="grid grid-cols-[58px_minmax(120px,1fr)_100px_110px_96px] gap-3 border-b border-mg-border pb-3 text-[12px] font-semibold text-mg-text-3">
              <span>{t('usage.apiKeyRank.col.rank')}</span>
              <span>{t('usage.apiKeyRank.col.apiKey')}</span>
              <span>{t('usage.apiKeyRank.col.requests')}</span>
              <span>{t('usage.apiKeyRank.col.tokens')}</span>
              <span className="text-right">{t('usage.apiKeyRank.col.spend')}</span>
            </div>
            <div className="divide-y divide-mg-border">
              {items.slice(0, 5).map((item, index) => {
                const rank = item.rank ?? index + 1
                const name = displayRankingName(item)
                return (
                  <div
                    key={item.key ?? `${name}-${index}`}
                    className="grid grid-cols-[58px_minmax(120px,1fr)_100px_110px_96px] items-center gap-3 py-3 text-sm"
                  >
                    <ApiKeyRankBadge rank={rank} />
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-selected-bg text-brand-base">
                        <LuKey size={14} />
                      </span>
                      <span className="truncate font-medium text-mg-text-1" title={name}>{name}</span>
                    </div>
                    <span className="font-mono text-mg-text-2">{formatNumber(item.requests ?? 0)}</span>
                    <span className="font-mono text-mg-text-2">{formatNumber(item.tokens ?? 0)}</span>
                    <span className="text-right font-mono text-mg-text-1">{formatRankingSpend(item, currencySymbol)}</span>
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
