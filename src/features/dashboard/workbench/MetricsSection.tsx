import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { LuActivity, LuTrendingUp, LuDatabase, LuWallet } from 'react-icons/lu'
import { useAuthStore } from '@/store/auth'
import { useBalance } from '@/hooks/use-balance'
import { useCurrency } from '@/hooks/use-platform-config'
import { getUsageSummary } from '@/services/usage'
import { KpiCard } from '@/components/ui/KpiCard'
import { formatMoney } from '@/lib/utils'
import { abbreviateNumber, rangeForGranularity, type Granularity, type WorkbenchView } from './shared'

/**
 * 模块 4：核心指标 4 卡（总请求 / 总费用 / 总 Tokens / 账户余额）。
 * 请求/费用/Tokens 走 getUsageSummary(group_by:'none')；余额走 useBalance。
 * TODO(account_id 待后端): 「我的视图」暂无 summary 的成员过滤参数，仍取租户口径。
 */
export function MetricsSection({
  view,
  granularity,
}: {
  view: WorkbenchView
  granularity: Granularity
}) {
  const { t } = useTranslation()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const { symbol } = useCurrency()

  const range = useMemo(() => rangeForGranularity(granularity), [granularity])

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['workbench', 'summary', 'none', activeTenantId, granularity, view],
    queryFn: () => getUsageSummary({ from: range.from, to: range.to, group_by: 'none' }),
    enabled: !!activeTenantId,
    staleTime: 60_000,
  })

  const { data: balance, isLoading: balanceLoading } = useBalance(activeTenantId)

  const requests = summary?.total.requests
  const tokens = summary?.total.tokens

  const cards = [
    {
      title: t('dashboard.workbench.metrics.requests'),
      value: requests !== undefined ? requests.toLocaleString() : undefined,
      rawNumber: requests,
      formatter: (n: number) => Math.round(n).toLocaleString(),
      loading: summaryLoading,
      color: 'var(--mg-success)',
      glowColor: 'rgba(16, 185, 129, 0.12)',
      hoverBorderClass: 'hover:border-emerald-500/30',
      icon: <LuActivity size={16} />,
    },
    {
      title: t('dashboard.workbench.metrics.spend'),
      value: summary ? formatMoney(summary.total.spend.amount, symbol) : undefined,
      loading: summaryLoading,
      color: 'var(--mg-warning)',
      glowColor: 'rgba(245, 158, 11, 0.12)',
      hoverBorderClass: 'hover:border-amber-500/30',
      icon: <LuTrendingUp size={16} />,
    },
    {
      title: t('dashboard.workbench.metrics.tokens'),
      value: tokens !== undefined ? abbreviateNumber(tokens) : undefined,
      rawNumber: tokens,
      formatter: abbreviateNumber,
      loading: summaryLoading,
      color: 'var(--brand-base)',
      glowColor: 'var(--brand-glow)',
      hoverBorderClass: 'hover:border-brand-base/30',
      icon: <LuDatabase size={16} />,
    },
    {
      title: t('dashboard.workbench.metrics.balance'),
      value: balance ? formatMoney(balance.available.amount, symbol) : undefined,
      loading: balanceLoading,
      color: 'var(--mg-primary)',
      glowColor: 'var(--brand-glow)',
      hoverBorderClass: 'hover:border-brand-base/30',
      icon: <LuWallet size={16} />,
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <KpiCard key={card.title} {...card} />
      ))}
    </div>
  )
}
