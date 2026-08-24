import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { LuBot, LuKeyRound, LuUsers, LuArrowUpRight } from 'react-icons/lu'
import { getUsageRankingsModels, getUsageRankingsApiKeys, getUsageRankingsAccounts } from '@/services/usage'
import { useAuthStore } from '@/store/auth'
import { useTrackContext } from '@/hooks/use-track-context'
import { trackEvent } from '@/lib/track'
import { Card } from '@/components/ui/Card'
import { Money } from '@/components/ui/Money'
import { ModelIcon, type ModelIconLike } from '@/features/models/components/ModelIcon'
import { abbreviateNumber, metricsRangeForGranularity, timeRangeForGranularity, type Granularity, type WorkbenchView } from './shared'
import type { UsageRankingItem } from '@/types'

function RankingRow({ index, name, meta, metaTitle, spend, model }: { index: number; name: string; meta: string; metaTitle?: string; spend?: { amount?: string; currency?: string }; model?: ModelIconLike }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="w-4 shrink-0 text-center font-mono text-xs font-bold text-mg-text-3">{String(index + 1)}</span>
      {model && <ModelIcon model={model} variant="compact" className="border border-mg-border/40" />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-mg-text-1">{name}</div>
        {/* 缩写数字悬浮显精确值（原生 title，不引入 Tooltip） */}
        <div className="mt-0.5 truncate text-xs text-mg-text-3 font-mono cursor-help" title={metaTitle}>{meta}</div>
      </div>
      <Money amount={spend?.amount} currency={spend?.currency} className="shrink-0" />
    </div>
  )
}

function RankingCard({
  icon,
  title,
  periodLabel,
  items,
  isLoading,
  emptyHint,
  onViewMore,
  withModelIcon = false,
}: {
  icon: React.ReactNode
  title: string
  periodLabel: string
  items: UsageRankingItem[] | null
  isLoading?: boolean
  emptyHint?: string
  onViewMore?: () => void
  withModelIcon?: boolean
}) {
  const { t } = useTranslation()
  return (
    <Card className="p-5 flex flex-col h-full">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-base/10 text-brand-base">{icon}</span>
          <h3 className="text-sm font-bold text-mg-text-1 m-0">{title}</h3>
          {/* PRD 排行卡头右显统计周期（今日/本月） */}
          <span className="text-xs text-mg-text-3">{periodLabel}</span>
        </div>
        {onViewMore && (
          <button
            type="button"
            onClick={onViewMore}
            className="inline-flex items-center gap-1 text-xs font-bold text-brand-base hover:text-brand-deep cursor-pointer"
          >
            {t('dashboard.workbench.rankings.viewMore')}
            <LuArrowUpRight size={12} />
          </button>
        )}
      </div>

      <div className="flex-1">
        {isLoading ? (
          <div className="flex flex-col gap-2 pt-1">
            {[0, 1, 2].map((i) => <div key={i} className="animate-pulse bg-mg-fill-2 rounded-sm h-8 w-full" />)}
          </div>
        ) : items && items.length > 0 ? (
          <div className="flex flex-col divide-y divide-mg-border">
            {items.map((item, i) => (
              <RankingRow
                key={item.key ?? i}
                index={i}
                name={item.name || item.key || '—'}
                meta={`${abbreviateNumber(item.tokens ?? 0)} tokens · ${abbreviateNumber(item.requests ?? 0)} calls`}
                metaTitle={`${(item.tokens ?? 0).toLocaleString()} tokens · ${(item.requests ?? 0).toLocaleString()} calls`}
                spend={item.spend}
                model={withModelIcon ? { display_name: item.name || item.key || '—', vendor: item.key || item.name || '' } : undefined}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-xs font-medium text-mg-text-3">{t('dashboard.workbench.rankings.empty')}</p>
            {emptyHint && <p className="mt-1 text-xs text-mg-text-3 max-w-[240px]">{emptyHint}</p>}
          </div>
        )}
      </div>
    </Card>
  )
}

/**
 * 模块 7：排行卡（模型 / 成员 / API Keys，各 Top3 + 查看更多）。
 * 成员排行走 usage/rankings/accounts；我的视图隐藏成员排行，避免重复展示“我”。
 */
export function RankingsSection({ view, granularity, accountId }: { view: WorkbenchView; granularity: Granularity; accountId?: string }) {
  const { t } = useTranslation()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const navigate = useNavigate()
  const trackCtx = useTrackContext()
  // 三张排行卡的标题旁标的是「今日/本月」(periodLabel)，取数窗口必须与之一致；
  // 用趋势图的 30 天/12 个月窗口会让「今日」榜单实际统计近 30 天（prd#634）
  const range = useMemo(() => metricsRangeForGranularity(granularity), [granularity])
  const showMembers = view === 'enterprise'
  const periodLabel = t(`dashboard.workbench.periodLabel.${granularity}`)
  // 深链时间口径：/usage 不读 granularity，按 PRD §9.2 用 time_range（#617）
  const timeRange = timeRangeForGranularity(granularity)

  const handleRankingMore = (dimension: 'models' | 'members' | 'apiKeys', target: string) => {
    trackEvent('overview_ranking_more_click', { ...trackCtx, dimension }, { view_mode: view })
    trackEvent('destination_page_view', { ...trackCtx, destination: '/usage' }, { source: 'ranking' })
    navigate(target)
  }

  const { data: models, isLoading: modelsLoading } = useQuery({
    queryKey: ['workbench', 'rankings', 'models', activeTenantId, granularity, accountId],
    queryFn: () => getUsageRankingsModels({ from: range.from, to: range.to, limit: 3, account_id: accountId }),
    enabled: !!activeTenantId,
    staleTime: 5 * 60_000,
  })

  const { data: apiKeys, isLoading: apiKeysLoading } = useQuery({
    queryKey: ['workbench', 'rankings', 'api-keys', activeTenantId, granularity, accountId],
    queryFn: () => getUsageRankingsApiKeys({ from: range.from, to: range.to, limit: 3, account_id: accountId }),
    enabled: !!activeTenantId,
    staleTime: 5 * 60_000,
  })

  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ['workbench', 'rankings', 'accounts', activeTenantId, granularity],
    queryFn: () => getUsageRankingsAccounts({ from: range.from, to: range.to, limit: 3 }),
    enabled: !!activeTenantId && showMembers,
    staleTime: 5 * 60_000,
  })

  return (
    <div className={`grid grid-cols-1 gap-4 ${showMembers ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
      <RankingCard
        icon={<LuBot size={15} />}
        title={t(showMembers ? 'dashboard.workbench.rankings.models' : 'dashboard.workbench.rankings.myModels')}
        periodLabel={periodLabel}
        items={models?.items ?? null}
        isLoading={modelsLoading}
        emptyHint={t('dashboard.workbench.rankings.emptyHint')}
        onViewMore={() => handleRankingMore('models', `/usage?view=${view}&time_range=${timeRange}&dimension=model`)}
        withModelIcon
      />

      {showMembers && (
        <RankingCard
          icon={<LuUsers size={15} />}
          title={t('dashboard.workbench.rankings.members')}
          periodLabel={periodLabel}
          items={members?.items ?? null}
          isLoading={membersLoading}
          emptyHint={t('dashboard.workbench.rankings.emptyHint')}
          onViewMore={() => handleRankingMore('members', `/usage?view=${view}&time_range=${timeRange}&dimension=member`)}
        />
      )}

      <RankingCard
        icon={<LuKeyRound size={15} />}
        title={t(showMembers ? 'dashboard.workbench.rankings.apiKeys' : 'dashboard.workbench.rankings.myApiKeys')}
        periodLabel={periodLabel}
        items={apiKeys?.items ?? null}
        isLoading={apiKeysLoading}
        emptyHint={t('dashboard.workbench.rankings.emptyHint')}
        onViewMore={() => handleRankingMore('apiKeys', `/usage?view=${view}&time_range=${timeRange}&dimension=apiKey`)}
      />
    </div>
  )
}
