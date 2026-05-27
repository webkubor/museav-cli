import React from 'react'
import { Row, Col, Typography, Skeleton } from '@douyinfe/semi-ui'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { getBalance } from '@/services/billing'
import { getUsageSummary } from '@/services/usage'

const { Text } = Typography

interface KpiCardProps {
  title: string
  value: string | undefined
  loading: boolean
  color: string
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, loading, color }) => {
  return (
    <div
      style={{
        borderRadius: '14px',
        border: '1px solid var(--semi-color-border)',
        background: 'linear-gradient(135deg, rgba(248, 250, 252, 0.4) 0%, rgba(255, 255, 255, 0.9) 100%)',
        padding: '22px 24px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.01)',
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        minHeight: '96px',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)';
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(59, 130, 246, 0.25)';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 24px -10px rgba(15, 23, 42, 0.08), 0 4px 12px -5px rgba(59, 130, 246, 0.05)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = 'none';
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--semi-color-border)';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 2px rgba(0,0,0,0.01)';
      }}
    >
      <Text style={{ color: 'var(--semi-color-text-1)', fontSize: '12.5px', fontWeight: 500, letterSpacing: '0.01em' }}>
        {title}
      </Text>
      <div style={{ marginTop: '10px' }}>
        {loading ? (
          <Skeleton.Title style={{ width: '120px', height: '30px' }} />
        ) : (
          <span style={{
            fontSize: '30px',
            fontWeight: 800,
            color: color,
            letterSpacing: '-0.03em',
            display: 'block',
          }}>
            {value ?? '—'}
          </span>
        )}
      </div>
    </div>
  )
}

export const KpiSection: React.FC = () => {
  const activeTenantId = useAuthStore((s) => s.activeTenantId)

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

  const availableBalance = balance
    ? `${balance.available.currency} ${parseFloat(balance.available.amount).toFixed(2)}`
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
    { title: '本月请求数', value: monthlyRequests, loading: usageLoading, color: '#10b981' },
    { title: '本月 Token 用量', value: monthlyTokens, loading: usageLoading, color: '#3b82f6' },
  ]

  return (
    <Row gutter={20} style={{ marginBottom: '36px' }}>
      {cards.map((card) => (
        <Col span={8} key={card.title}>
          <KpiCard {...card} />
        </Col>
      ))}
    </Row>
  )
}
