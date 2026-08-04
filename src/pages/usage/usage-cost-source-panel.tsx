/**
 * 成本来源侧栏：最高消费工作空间 / 模型 / API Key 三卡并列（对齐 PRD §9）。
 * 路由：/usage
 * API 来源：GET /usage/rankings/*（含 /usage/rankings/workspaces）
 */

import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'
import type { UsageRankingItem } from '@/types'
import { ErrorBlock, PanelSkeleton } from './usage-panel-states'
import { displayRankingName, rankingSharePercent, formatRankingSpend } from './usage-panel-shared'

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
