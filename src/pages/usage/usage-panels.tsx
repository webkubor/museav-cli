/**
 * 用量分析辅助面板
 * 路由：/usage
 * API 来源：GET /usage/summary、GET /usage/rankings/*（含 /usage/rankings/workspaces）
 */

import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import type { UsageRankingItem } from '@/types'
import { cn } from '@/lib/utils'
import { formatMoney, CHART_OTHER_COLOR } from './usage-utils'
import { ModelDonutChart, type DonutSlice } from './usage-charts'
import { ProgressBar } from '@/components/ui/ProgressBar'

/** 分布图 Top N，超出折叠成「其他」。 */
const DIST_TOP_N = 5

/**
 * 环形图专用「品牌靛蓝色阶」——按消费排名 深→浅 上色（Top1 最深）。
 * 饼图分片是排序过的,用单一品牌色的明度阶梯让「颜色本身编码排名」,
 * 比六色彩虹更和谐、更贴品牌;跨明暗主题随 --brand-* token 自动切。
 * 「其他」用中性灰做弱化。趋势图仍用 CHART_CAT_COLORS(多序列需可辨异色)。
 */
const DONUT_BRAND_RAMP = [
  'var(--brand-deep)',
  'var(--brand-base)',
  'var(--brand-mid)',
  'var(--brand-light)',
  'var(--brand-pale)',
] as const

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

interface DistributionDonutPanelProps {
  /** 卡标题（如「模型分布」「API Keys 分布」，按维度传入）。 */
  title: string
  /** 卡副标题（如「按模型消费占比」，按维度传入）。 */
  chartDesc: string
  items: UsageRankingItem[]
  totalSpendAmount?: string
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  currencySymbol: string
  emptyTitle: string
  emptyDesc: string
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
      <div className="mb-4">
        <div className="text-sm font-semibold text-mg-text-1">{t('usage.sources.title')}</div>
        <div className="mt-1 text-[12px] text-mg-text-3">{t('usage.sources.desc')}</div>
      </div>

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

/** 通用消费分布卡（Top5 + 「其他」聚合），模型/成员/API Key 三维共用。 */
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
}: DistributionPanelProps) {
  const { t } = useTranslation()

  const top = items.slice(0, DIST_TOP_N)
  const rest = items.slice(DIST_TOP_N)
  const otherSpend = rest.reduce((sum, it) => sum + spendAmount(it), 0)
  const otherShare = rest.reduce((sum, it) => sum + rankingSharePercent(it), 0)

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

/**
 * 从消费排行项构建环形图分片（Top5 + 「其他」聚合），配色沿用趋势分组的分类色槽。
 * 供「模型分布」饼图卡消费；返回空数组表示无数据。
 */
function buildDonutSlices(items: UsageRankingItem[], otherLabel: string): DonutSlice[] {
  const withSpend = items.filter((it) => spendAmount(it) > 0)
  if (withSpend.length === 0) return []
  const top = withSpend.slice(0, DIST_TOP_N)
  const rest = withSpend.slice(DIST_TOP_N)
  const slices: DonutSlice[] = top.map((it, index) => ({
    key: it.key ?? `${displayRankingName(it)}-${index}`,
    label: displayRankingName(it),
    value: spendAmount(it),
    share: rankingSharePercent(it),
    color: DONUT_BRAND_RAMP[index] ?? DONUT_BRAND_RAMP[DONUT_BRAND_RAMP.length - 1],
  }))
  if (rest.length > 0) {
    slices.push({
      key: '__other__',
      label: otherLabel,
      value: rest.reduce((sum, it) => sum + spendAmount(it), 0),
      share: rest.reduce((sum, it) => sum + rankingSharePercent(it), 0),
      color: CHART_OTHER_COLOR,
      subCount: rest.length,
    })
  }
  return slices
}

/**
 * 消费分布饼图卡（对齐 PRD 用量明细·分布）：环形图 + 中心总消费 + Top/「其他」图例（名称·金额·占比）。
 * 模型/成员/API Keys 三维共用，标题与副标题按维度传入。
 */
export function DistributionDonutPanel({
  title,
  chartDesc,
  items,
  totalSpendAmount,
  isLoading,
  isError,
  onRetry,
  currencySymbol,
  emptyTitle,
  emptyDesc,
}: DistributionDonutPanelProps) {
  const { t } = useTranslation()
  const [active, setActive] = useState<number | null>(null)
  const slices = buildDonutSlices(items, t('usage.distribution.other'))
  const totalAmount =
    totalSpendAmount != null ? parseFloat(totalSpendAmount) || 0 : items.reduce((s, it) => s + spendAmount(it), 0)

  return (
    <Card className="min-w-0 p-5 sm:p-6">
      <div className="mb-5">
        <div className="text-sm font-semibold text-mg-text-1">{title}</div>
        <div className="mt-1 text-[12px] text-mg-text-3">{chartDesc}</div>
      </div>
      {isError ? (
        <ErrorBlock message={t('usage.error.rankings')} onRetry={onRetry} />
      ) : isLoading ? (
        <PanelSkeleton rows={5} />
      ) : slices.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDesc} />
      ) : (
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <div className="w-full max-w-[210px] shrink-0">
            <ModelDonutChart
              slices={slices}
              centerLabel={t('usage.distribution.total')}
              centerValue={formatMoney(String(totalAmount), currencySymbol)}
              currencySymbol={currencySymbol}
              noDataLabel={emptyTitle}
              activeIndex={active}
              onActiveChange={setActive}
            />
          </div>
          <ul
            className="min-w-0 flex-1 space-y-1 self-stretch overflow-y-auto pr-1 sm:max-h-[210px]"
            onMouseLeave={() => setActive(null)}
          >
            {slices.map((s, i) => (
              <li
                key={s.key}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'cursor-default rounded-md px-2 py-1.5 transition-colors',
                  active === i ? 'bg-mg-bg-1' : 'bg-transparent',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-mg-text-1" title={s.label}>
                    {s.label}
                    {s.subCount ? <span className="ml-1 text-mg-text-3">·{s.subCount}</span> : null}
                  </span>
                  <span className="shrink-0 text-right text-sm tabular-nums text-mg-text-2">
                    {formatMoney(String(s.value), currencySymbol)}
                    <span className="ml-1 text-[12px] text-mg-text-3">{s.share.toFixed(1)}%</span>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-mg-bg-2">
                  <div
                    className="relative h-full overflow-hidden rounded-full transition-[width] duration-300"
                    style={{ width: `${Math.max(2, Math.min(100, s.share))}%`, background: s.color }}
                  >
                    {/* 流光扫过（"流动感"）：复用全局 shimmer-slide keyframe */}
                    <div
                      className="pointer-events-none absolute inset-0 rounded-full"
                      style={{
                        backgroundImage:
                          'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer-slide 2s ease-in-out infinite',
                      }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
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
              <ProgressBar value={r.pct ?? 0} variant={r.variant ?? 'brand'} size="xs" showGlow={false} flow />
            )}
          </div>
        ))}
        {pendingHint && <div className="pt-0.5 text-xs text-mg-text-3">{pendingHint}</div>}
      </div>
    </Card>
  )
}
