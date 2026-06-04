import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { getBalance } from '@/services/billing'
import { getUsageSummary, getUsageSeries } from '@/services/usage'
import { getBillingMoneyStats } from '@/services/overview'
import { useCurrency } from '@/hooks/use-platform-config'
import { KpiCard } from '@/components/ui/KpiCard'
import { LuWallet, LuTrendingUp, LuActivity, LuDatabase } from 'react-icons/lu'

export const KpiSection: React.FC = () => {
  const { t } = useTranslation()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const { symbol: currencySymbol } = useCurrency()

  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ['billing', 'balance', activeTenantId],
    queryFn: () => getBalance(activeTenantId!),
    enabled: !!activeTenantId,
    staleTime: 30_000,
  })

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
    from.setDate(from.getDate() - 7)
    return { from: from.toISOString(), to: to.toISOString(), granularity: 'day' as const }
  }, [])

  const { data: reqSeries } = useQuery({
    queryKey: ['usage', 'series', 'requests', 'kpi', activeTenantId],
    queryFn: () => getUsageSeries({ ...seriesParams, metric: 'requests' }),
    enabled: !!activeTenantId,
    staleTime: 60_000,
  })

  const { data: tokenSeries } = useQuery({
    queryKey: ['usage', 'series', 'tokens', 'kpi', activeTenantId],
    queryFn: () => getUsageSeries({ ...seriesParams, metric: 'tokens' }),
    enabled: !!activeTenantId,
    staleTime: 60_000,
  })

  function extractPoints(series: any, metric: 'requests' | 'tokens'): number[] {
    const raw = series as any
    if (raw?.groups?.[0]?.points) return raw.groups[0].points.map((p: any) => Number(p[metric] ?? 0))
    if (raw?.series) return raw.series.map((p: any) => Number(p.value ?? 0))
    return []
  }

  const reqSparkData = extractPoints(reqSeries, 'requests')
  const tokenSparkData = extractPoints(tokenSeries, 'tokens')

  const availableBalance = balance
    ? `${currencySymbol}${parseFloat(balance.available.amount).toFixed(2)}`
    : undefined

  const monthlySpend = billingStats
    ? `${currencySymbol}${parseFloat(billingStats.monthly_spend.amount).toFixed(4)}`
    : undefined

  const monthlyRequests = usage
    ? usage.total.requests.toLocaleString()
    : undefined

  const monthlyTokens = usage
    ? usage.total.tokens >= 1_000_000
      ? `${(usage.total.tokens / 1_000_000).toFixed(2)}M`
      : `${(usage.total.tokens / 1_000).toFixed(1)}K`
    : undefined

  const cards = [
    { 
      title: t('dashboard.kpi.balance'), 
      value: availableBalance, 
      loading: balanceLoading, 
      color: 'var(--mg-primary)', 
      glowColor: 'var(--brand-glow)', 
      hoverBorderClass: 'hover:border-brand-base/30',
      icon: <LuWallet size={16} /> 
    },
    { 
      title: t('dashboard.kpi.monthlySpend'), 
      value: monthlySpend, 
      loading: billingLoading, 
      color: 'var(--mg-warning)', 
      glowColor: 'rgba(245, 158, 11, 0.12)', 
      hoverBorderClass: 'hover:border-amber-500/30',
      icon: <LuTrendingUp size={16} /> 
    },
    {
      title: t('dashboard.kpi.monthlyRequests'),
      value: monthlyRequests,
      loading: usageLoading,
      color: 'var(--mg-success)',
      glowColor: 'rgba(16, 185, 129, 0.12)',
      hoverBorderClass: 'hover:border-emerald-500/30',
      icon: <LuActivity size={16} />,
      sparkData: reqSparkData,
    },
    {
      title: t('dashboard.kpi.monthlyTokens'),
      value: monthlyTokens,
      loading: usageLoading,
      color: '#3b82f6',
      glowColor: 'rgba(59, 130, 246, 0.12)',
      hoverBorderClass: 'hover:border-blue-500/30',
      icon: <LuDatabase size={16} />,
      sparkData: tokenSparkData,
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-9">
      {cards.map((card) => (
        <KpiCard key={card.title} {...card} />
      ))}
    </div>
  )
}
