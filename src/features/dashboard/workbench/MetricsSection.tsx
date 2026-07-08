import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { LuActivity, LuTrendingUp, LuDatabase, LuWallet } from 'react-icons/lu'
import { useAuthStore } from '@/store/auth'
import { useBalance } from '@/hooks/use-balance'
import { useTrackContext } from '@/hooks/use-track-context'
import { trackEvent } from '@/lib/track'
import { useRechargeStore } from '@/store/use-recharge-store'
import { useCurrency } from '@/hooks/use-platform-config'
import { getUsageSummary } from '@/services/usage'
import { KpiCard } from '@/components/ui/KpiCard'
import { formatMoney } from '@/lib/utils'
import { abbreviateNumber, rangeForGranularity, prevRangeForGranularity, computeDelta, type Granularity, type WorkbenchView } from './shared'

/**
 * 模块 4：核心指标 4 卡（总请求 / 总费用 / 总 Tokens / 账户余额）。
 * 请求/费用/Tokens 走 getUsageSummary(group_by:'none')；余额走 useBalance。
 * 我的视图传 account_id 裁剪到当前账号（后端 #328/#314 支持）；账户余额始终按租户不随视图变。
 */
export function MetricsSection({
  view,
  granularity,
  accountId,
}: {
  view: WorkbenchView
  granularity: Granularity
  accountId?: string
}) {
  const { t } = useTranslation()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const { symbol } = useCurrency()
  const trackCtx = useTrackContext()
  const onMetricCardClick = (metric: string) =>
    trackEvent('overview_metric_card_click', { ...trackCtx, view_mode: view, metric })

  const range = useMemo(() => rangeForGranularity(granularity), [granularity])
  const prevRange = useMemo(() => prevRangeForGranularity(granularity), [granularity])

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['workbench', 'summary', 'none', activeTenantId, granularity, view, accountId],
    queryFn: () => getUsageSummary({ from: range.from, to: range.to, group_by: 'none', account_id: accountId }),
    enabled: !!activeTenantId,
    staleTime: 60_000,
  })

  // 上一等长区间 → 指标卡「较上期」涨跌（请求/费用/Tokens；余额为时点值、后端无历史快照，不计）
  const { data: prevSummary } = useQuery({
    queryKey: ['workbench', 'summary', 'prev', activeTenantId, granularity, view, accountId],
    queryFn: () => getUsageSummary({ from: prevRange.from, to: prevRange.to, group_by: 'none', account_id: accountId }),
    enabled: !!activeTenantId,
    staleTime: 60_000,
  })

  const { data: balance, isLoading: balanceLoading } = useBalance(activeTenantId)
  const openRecharge = useRechargeStore((s) => s.open)

  // 低余额判定：后端已返回 low_balance_threshold，可用余额 <= 阈值即偏低（阈值 > 0 才有意义）。
  const lowBalance = (() => {
    if (!balance) return false
    const avail = Number.parseFloat(balance.available?.amount ?? '')
    const thr = Number.parseFloat(balance.low_balance_threshold?.amount ?? '')
    return Number.isFinite(avail) && Number.isFinite(thr) && thr > 0 && avail <= thr
  })()

  const requests = summary?.total.requests
  const tokens = summary?.total.tokens

  // 「较上期」涨跌（上一等长区间对比）；上期为 0/缺失则不显示徽章
  const trendLabel = t('dashboard.workbench.metrics.vsPrev')
  const withLabel = (d?: { value: string; up: boolean }) => (d ? { ...d, label: trendLabel } : undefined)
  const requestsTrend = withLabel(computeDelta(requests, prevSummary?.total.requests))
  const tokensTrend = withLabel(computeDelta(tokens, prevSummary?.total.tokens))
  const spendTrend = withLabel(computeDelta(
    summary ? Number.parseFloat(summary.total.spend.amount) : undefined,
    prevSummary ? Number.parseFloat(prevSummary.total.spend.amount) : undefined,
  ))

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
      iconLead: true,
      trend: requestsTrend,
      onClick: () => onMetricCardClick('requests'),
    },
    {
      title: t('dashboard.workbench.metrics.spend'),
      value: summary ? formatMoney(summary.total.spend.amount, symbol) : undefined,
      loading: summaryLoading,
      color: 'var(--mg-warning)',
      glowColor: 'rgba(245, 158, 11, 0.12)',
      hoverBorderClass: 'hover:border-amber-500/30',
      icon: <LuTrendingUp size={16} />,
      iconLead: true,
      trend: spendTrend,
      onClick: () => onMetricCardClick('spend'),
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
      iconLead: true,
      trend: tokensTrend,
      onClick: () => onMetricCardClick('tokens'),
    },
    {
      title: t('dashboard.workbench.metrics.balance'),
      value: balance ? formatMoney(balance.available.amount, symbol) : undefined,
      loading: balanceLoading,
      color: lowBalance ? 'var(--mg-warning)' : 'var(--mg-primary)',
      glowColor: lowBalance ? 'rgba(245, 158, 11, 0.12)' : 'var(--brand-glow)',
      hoverBorderClass: lowBalance ? 'hover:border-amber-500/30' : 'hover:border-brand-base/30',
      icon: <LuWallet size={16} />,
      iconLead: true,
      // 账户余额为时点值、后端无历史快照，不显示涨跌徽章（保持真实，不造假数据）
      // 低余额时：文字标签（颜色非唯一信息，§12.3）+ 充值入口（走全局充值弹窗）
      sub: lowBalance ? t('dashboard.workbench.metrics.balanceLow') : undefined,
      action: lowBalance ? { label: t('dashboard.workbench.metrics.recharge'), onClick: openRecharge } : undefined,
      onClick: () => onMetricCardClick('balance'),
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
