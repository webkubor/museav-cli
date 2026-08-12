import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { LuActivity, LuReceiptText, LuDatabase, LuWalletCards } from 'react-icons/lu'
import { useAuthStore } from '@/store/auth'
import { useBalance } from '@/hooks/use-balance'
import { useTrackContext } from '@/hooks/use-track-context'
import { trackEvent } from '@/lib/track'
import { useRechargeStore } from '@/store/use-recharge-store'
import { useCurrency } from '@/hooks/use-platform-config'
import { getUsageSummary } from '@/services/usage'
import { KpiCard } from '@/components/ui/KpiCard'
import { TiltCard } from '@/components/ui/TiltCard'
import { formatMoney } from '@/lib/utils'
import { abbreviateNumber, rangeForGranularity, type Granularity, type WorkbenchView } from './shared'

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
    trackEvent('overview_metric_card_click', { ...trackCtx, metric }, { view_mode: view })

  const range = useMemo(() => rangeForGranularity(granularity), [granularity])

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['workbench', 'summary', 'none', activeTenantId, granularity, view, accountId],
    queryFn: () => getUsageSummary({ from: range.from, to: range.to, group_by: 'none', account_id: accountId }),
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

  // PRD 总览指标卡：icon + label + value + hint（今日/本月随周期切换），无「较上期」涨跌徽章（原型未含）
  const isDay = granularity === 'day'
  const requestsSub = t(isDay ? 'dashboard.workbench.metrics.requestsSubDay' : 'dashboard.workbench.metrics.requestsSub')
  const spendSub = t(isDay ? 'dashboard.workbench.metrics.spendSubDay' : 'dashboard.workbench.metrics.spendSub')
  const tokensSub = t(isDay ? 'dashboard.workbench.metrics.tokensSubDay' : 'dashboard.workbench.metrics.tokensSub')
  // 我的视图下余额仍为租户级（后端无个人余额），hint 标注「租户可用余额」以正名口径（PRD balanceHint）
  const balanceSub = view === 'mine'
    ? t('dashboard.workbench.metrics.balanceSubTenant')
    : t('dashboard.workbench.metrics.balanceSub')

  const cards = [
    {
      title: t('dashboard.workbench.metrics.requests'),
      value: requests !== undefined ? requests.toLocaleString() : undefined,
      rawNumber: requests,
      formatter: (n: number) => Math.round(n).toLocaleString(),
      loading: summaryLoading,
      color: 'var(--mg-success)',
      glowColor: 'var(--mg-success-bg-hover)',
      hoverBorderClass: 'hover:border-[var(--mg-success-border)]',
      icon: <LuActivity size={16} />,
      iconLead: true,
      sub: requestsSub,
      onClick: () => onMetricCardClick('requests'),
    },
    {
      title: t('dashboard.workbench.metrics.spend'),
      value: summary ? formatMoney(summary.total.spend.amount, symbol) : undefined,
      loading: summaryLoading,
      sub: spendSub,
      color: 'var(--mg-warning)',
      glowColor: 'var(--mg-warning-bg-hover)',
      hoverBorderClass: 'hover:border-[var(--mg-warning-border)]',
      icon: <LuReceiptText size={16} />,
      iconLead: true,
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
      sub: tokensSub,
      onClick: () => onMetricCardClick('tokens'),
    },
    {
      title: t('dashboard.workbench.metrics.balance'),
      value: balance ? formatMoney(balance.available.amount, symbol) : undefined,
      loading: balanceLoading,
      color: lowBalance ? 'var(--mg-warning)' : 'var(--mg-primary)',
      glowColor: lowBalance ? 'var(--mg-warning-bg-hover)' : 'var(--brand-glow)',
      hoverBorderClass: lowBalance ? 'hover:border-[var(--mg-warning-border)]' : 'hover:border-brand-base/30',
      icon: <LuWalletCards size={16} />,
      iconLead: true,
      // 低余额时：文字标签（颜色非唯一信息，§12.3）+ 充值入口（走全局充值弹窗）；否则显介绍副文案
      sub: lowBalance ? t('dashboard.workbench.metrics.balanceLow') : balanceSub,
      action: lowBalance ? { label: t('dashboard.workbench.metrics.recharge'), onClick: openRecharge } : undefined,
      onClick: () => onMetricCardClick('balance'),
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <TiltCard key={card.title}>
          <KpiCard {...card} />
        </TiltCard>
      ))}
    </div>
  )
}
