/**
 * 消费分布饼图卡：环形图 + 中心总消费 + Top/「其他」图例（对齐 PRD 用量明细·分布）。
 * #666：支持展开态——「其他」聚合拆开为全部分片，与右侧排行卡「查看更多」联动。
 * 路由：/usage
 * API 来源：GET /usage/rankings/*
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils'
import type { UsageRankingItem } from '@/types'
import { formatMoney, CHART_CAT_COLORS, CHART_OTHER_COLOR } from './usage-utils'
import { ModelDonutChart, type DonutSlice } from './usage-charts'
import { ErrorBlock, PanelSkeleton } from './usage-panel-states'
import { DONUT_TOP_N, displayRankingName, rankingSharePercent, spendAmount } from './usage-panel-shared'

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
  /** 展开全部分片（#666 查看更多）：不聚合「其他」，全部明细单列。 */
  expanded: boolean
}

/**
 * 从消费排行项构建环形图分片。
 * 折叠态：Top4 + 「其他」聚合（品牌色阶 + 灰）——比排行卡少一档，对齐原型
 * usageRankingDomain.buildUsageDistributionRows 的 rows.slice(0, 4)；
 * 展开态（#666）：全部单列，分类色循环——brand ramp 只有 5 档，循环会让相邻分片同色难辨。
 * 供「模型分布」饼图卡消费；返回空数组表示无数据。
 */
function buildDonutSlices(items: UsageRankingItem[], otherLabel: string, expanded: boolean): DonutSlice[] {
  const withSpend = items.filter((it) => spendAmount(it) > 0)
  if (withSpend.length === 0) return []
  if (expanded) {
    return withSpend.map((it, index) => ({
      key: it.key ?? `${displayRankingName(it)}-${index}`,
      label: displayRankingName(it),
      value: spendAmount(it),
      share: rankingSharePercent(it),
      color: CHART_CAT_COLORS[index % CHART_CAT_COLORS.length],
    }))
  }
  const top = withSpend.slice(0, DONUT_TOP_N)
  const rest = withSpend.slice(DONUT_TOP_N)
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
 * 模型/成员/API Keys 三维共用，标题与副标题按维度传入；expanded 时展开「其他」全部分片（#666）。
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
  expanded,
}: DistributionDonutPanelProps) {
  const { t } = useTranslation()
  const [active, setActive] = useState<number | null>(null)
  const slices = buildDonutSlices(items, t('usage.distribution.other'), expanded)
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
            className={cn(
              // space-y-3 与右侧排行卡的行间距同源（那边也是 space-y-3）：两侧行距一致，
              // 同一个模型在左图例与右排行里才横向对得齐。此前图例是 space-y-1，每行比右侧
              // 少 8px，越往下越错开。
              'min-w-0 flex-1 space-y-3 self-stretch pr-1',
              // 收起态行数是定死的（DONUT_TOP_N=4 条 + 「其他」= 5 行），不会失控，所以
              // 不设高度上限、也不要滚动条——原先 210px 装不下 5 行，把最后一条切掉一半
              // （需求方#715：不需要滚动条，直接展示所有模型含「其他」）。
              // 展开态才可能是几十行，那时仍限高滚动，并与右侧排行卡齐高：展开后是
              // 10 行 + 分页条 ≈ 470px（需求方#666 要求左右齐高）。
              expanded && 'overflow-y-auto sm:max-h-[470px]',
            )}
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
                          'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)', // allow-raw-color 白色高光流光叠在系列色之上、明暗主题都是白；无主题无关的白色 token（--mg-bg-*-rgb 暗色会变暗）
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
