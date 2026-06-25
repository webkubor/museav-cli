import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { useBalance } from '@/hooks/use-balance'
import { getUsageSummary, getUsageSeries } from '@/services/usage'
import { getBillingMoneyStats } from '@/services/overview'
import { useCurrency } from '@/hooks/use-platform-config'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { KpiCard } from '@/components/ui/KpiCard'
import { TopUpModal } from '@/pages/billing/TopUpModal'
import { LuWallet, LuTrendingUp, LuActivity, LuDatabase } from 'react-icons/lu'
import { formatMoney } from '@/lib/utils'
import type { UsageSeries } from '@/types'

export const KpiSection: React.FC = () => {
  const { t } = useTranslation()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const { symbol: currencySymbol } = useCurrency()
  const { hasPermission } = usePermissions()
  const canRecharge = hasPermission(PERMS.BILLING_RECHARGE_CREATE)
  const [topUpVisible, setTopUpVisible] = useState(false)

  const { data: balance, isLoading: balanceLoading } = useBalance(activeTenantId)

  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ['usage', 'summary', activeTenantId],
    queryFn: () => getUsageSummary(),
    enabled: !!activeTenantId,
    staleTime: 60_000,
  })

  const { data: billingStats, isLoading: billingLoading } = useQuery({
    queryKey: ['billing', 'money-stats', activeTenantId],
    queryFn: () => getBillingMoneyStats(activeTenantId!),
    enabled: !!activeTenantId,
    staleTime: 60_000,
  })

  const seriesParams = useMemo(() => {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - 5)
    return { from: from.toISOString(), to: to.toISOString(), granularity: 'day' as const }
  }, [])

  const { data: reqSeries } = useQuery({
    queryKey: ['usage', 'series', 'requests', activeTenantId],
    queryFn: () => getUsageSeries({ ...seriesParams, metric: 'requests' }),
    enabled: !!activeTenantId,
    staleTime: 60_000,
  })

  const { data: tokenSeries } = useQuery({
    queryKey: ['usage', 'series', 'tokens', activeTenantId],
    queryFn: () => getUsageSeries({ ...seriesParams, metric: 'tokens' }),
    enabled: !!activeTenantId,
    staleTime: 60_000,
  })

  function extractPoints(series: UsageSeries | undefined, metric: 'requests' | 'tokens'): number[] {
    if (series?.groups?.[0]?.points) return series.groups[0].points.map((p) => Number(p[metric] ?? 0))
    // 旧版接口兼容：扁平 series 数组（无 groups 包装）
    const legacy = (series as unknown as { series?: Array<{ value?: number | string }> } | undefined)?.series
    if (legacy) return legacy.map((p) => Number(p.value ?? 0))
    return []
  }

  const reqSparkData = extractPoints(reqSeries, 'requests')
  const tokenSparkData = extractPoints(tokenSeries, 'tokens')

  const rawRequests = usage?.total.requests
  const rawTokens = usage?.total.tokens

  const cards = [
    {
      title: t('dashboard.kpi.balance'),
      // 余额按后端原值显示，不舍入小数（不走数字滚动，避免长小数滚动）
      value: balance ? formatMoney(balance.available.amount, currencySymbol) : undefined,
      loading: balanceLoading,
      color: 'var(--mg-primary)',
      glowColor: 'var(--brand-glow)',
      hoverBorderClass: 'hover:border-brand-base/30',
      icon: <LuWallet size={16} />,
      action: canRecharge ? { label: t('billing.balance.recharge'), onClick: () => setTopUpVisible(true) } : undefined,
    },
    {
      title: t('dashboard.kpi.monthlySpend'),
      // 本月消费按后端原值显示，不舍入小数
      value: billingStats ? formatMoney(billingStats.monthly_spend.amount, currencySymbol) : undefined,
      loading: billingLoading,
      color: 'var(--mg-warning)',
      glowColor: 'rgba(245, 158, 11, 0.12)',
      hoverBorderClass: 'hover:border-amber-500/30',
      icon: <LuTrendingUp size={16} />,
    },
    {
      title: t('dashboard.kpi.monthlyRequests'),
      value: rawRequests !== undefined ? rawRequests.toLocaleString() : undefined,
      rawNumber: rawRequests,
      formatter: (n: number) => Math.round(n).toLocaleString(),
      loading: usageLoading,
      color: 'var(--mg-success)',
      glowColor: 'rgba(16, 185, 129, 0.12)',
      hoverBorderClass: 'hover:border-emerald-500/30',
      icon: <LuActivity size={16} />,
      sparkData: reqSparkData,
    },
    {
      title: t('dashboard.kpi.monthlyTokens'),
      value: rawTokens !== undefined
        ? rawTokens >= 1_000_000
          ? `${(rawTokens / 1_000_000).toFixed(2)}M`
          : `${(rawTokens / 1_000).toFixed(1)}K`
        : undefined,
      rawNumber: rawTokens,
      formatter: (n: number) => n >= 1_000_000
        ? `${(n / 1_000_000).toFixed(2)}M`
        : `${(n / 1_000).toFixed(1)}K`,
      loading: usageLoading,
      color: '#3b82f6',
      glowColor: 'rgba(59, 130, 246, 0.12)',
      hoverBorderClass: 'hover:border-blue-500/30',
      icon: <LuDatabase size={16} />,
      sparkData: tokenSparkData,
    },
  ]

  return (
    <>
      <TopUpModal visible={topUpVisible} onClose={() => setTopUpVisible(false)} tenantId={activeTenantId ?? ''} />
      <div className="no-canvas-blur grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-9">
        {cards.map((card) => (
          <KpiCard key={card.title} {...card} />
        ))}
      </div>
    </>
  )
}
