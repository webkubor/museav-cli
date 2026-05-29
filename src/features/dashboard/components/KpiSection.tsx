import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { getBalance } from '@/services/billing'
import { getUsageSummary } from '@/services/usage'
import { getBillingMoneyStats } from '@/services/overview'
import { useCurrency } from '@/hooks/use-platform-config'
import { Card } from '@/components/ui/Card'

interface KpiCardProps {
  title: string
  value: string | undefined
  loading: boolean
  color: string
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, loading, color }) => {
  return (
    <Card
      hoverable
      className="p-6 min-h-[110px] flex flex-col justify-center border-none shadow-md bg-gradient-to-br from-semi-color-bg-1 to-semi-color-bg-0"
    >
      <span style={{ color: 'var(--semi-color-text-2)', fontSize: '13px', fontWeight: 600 }}>
        {title}
      </span>
      <div style={{ marginTop: '8px' }}>
        {loading ? (
          <div className="animate-pulse bg-gray-200 dark:bg-gray-800 rounded h-[32px] w-[80%]" />
        ) : (
          <span style={{
            fontSize: '32px',
            fontWeight: 800,
            color: color === 'var(--semi-color-text-0)' ? 'var(--semi-color-text-0)' : color,
            letterSpacing: '-0.04em',
            display: 'block',
          }}>
            {value ?? '—'}
          </span>
        )}
      </div>
    </Card>
  )
}

export const KpiSection: React.FC = () => {
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
    { title: '可用余额', value: availableBalance, loading: balanceLoading, color: 'var(--semi-color-text-0)' },
    { title: '本月消费', value: monthlySpend, loading: billingLoading, color: '#f59e0b' },
    { title: '本月请求数', value: monthlyRequests, loading: usageLoading, color: '#10b981' },
    { title: '本月 Token 用量', value: monthlyTokens, loading: usageLoading, color: '#3b82f6' },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-9">
      {cards.map((card) => (
        <KpiCard key={card.title} {...card} />
      ))}
    </div>
  )
}
