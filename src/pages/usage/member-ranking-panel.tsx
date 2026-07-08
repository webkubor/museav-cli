import { useTranslation } from 'react-i18next'
import { LuUsers } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import type { UsageRankingItem } from '@/types'
import { cn } from '@/lib/utils'
import { formatMoney, formatNumber } from './usage-utils'

interface MemberRankingPanelProps {
  items: UsageRankingItem[]
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  currencySymbol: string
}

function displayRankingName(item: UsageRankingItem): string {
  return item.name || item.key || '-'
}

function formatRankingSpend(item: UsageRankingItem, currencySymbol: string): string {
  return item.spend?.amount ? formatMoney(item.spend.amount, currencySymbol) : '-'
}

function PanelSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, idx) => (
        <div key={idx} className="h-9 animate-pulse rounded-lg bg-mg-fill-1" />
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

function RankBadge({ rank }: { rank: number }) {
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

/** 成员消费排行，展示真实 account 维度数据。 */
export function MemberRankingPanel({
  items,
  isLoading,
  isError,
  onRetry,
  currencySymbol,
}: MemberRankingPanelProps) {
  const { t } = useTranslation()

  return (
    <Card className="min-w-0 p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-mg-text-1">
        <LuUsers size={15} className="text-brand-base" />
        {t('usage.member.title')}
      </div>
      {isError ? (
        <ErrorBlock message={t('usage.error.rankings')} onRetry={onRetry} />
      ) : isLoading ? (
        <PanelSkeleton />
      ) : items.length === 0 ? (
        <EmptyState title={t('usage.rankings.empty')} description={t('usage.rankings.emptyDesc')} />
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[620px]">
            <div className="grid grid-cols-[58px_minmax(120px,1fr)_100px_110px_96px] gap-3 border-b border-mg-border pb-3 text-[12px] font-semibold text-mg-text-3">
              <span>{t('usage.apiKeyRank.col.rank')}</span>
              <span>{t('usage.member.col.member')}</span>
              <span>{t('usage.apiKeyRank.col.requests')}</span>
              <span>{t('usage.apiKeyRank.col.tokens')}</span>
              <span className="text-right">{t('usage.apiKeyRank.col.spend')}</span>
            </div>
            <div className="divide-y divide-mg-border">
              {items.slice(0, 10).map((item, index) => {
                const rank = item.rank ?? index + 1
                const name = displayRankingName(item)
                return (
                  <div
                    key={item.key ?? `${name}-${index}`}
                    className="grid grid-cols-[58px_minmax(120px,1fr)_100px_110px_96px] items-center gap-3 py-3 text-sm"
                  >
                    <RankBadge rank={rank} />
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-selected-bg text-brand-base">
                        <LuUsers size={14} />
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
