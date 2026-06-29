import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { LuRefreshCw, LuReceipt, LuPlus } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { useBalance, useBalanceBreakdown } from '@/hooks/use-balance'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { useMouseGlow } from '@/hooks/use-mouse-glow'
import { TopUpModal } from './TopUpModal'
import { InvoiceModal } from './invoice/InvoiceModal'
import { formatBalance } from './formatBalance'

export type BalanceTab = 'main' | 'gift' | 'reward'

interface BalanceCardProps {
  tenantId: string
  currencySymbol: string
  activeTab: BalanceTab
  onTabChange: (tab: BalanceTab) => void
}

export function BalanceCard({ tenantId, currencySymbol, activeTab, onTabChange }: BalanceCardProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { hasPermission } = usePermissions()
  const canRecharge = hasPermission(PERMS.BILLING_RECHARGE_CREATE)
  const canInvoice = hasPermission(PERMS.BILLING_INVOICE_VIEW)

  const [topUpVisible, setTopUpVisible] = useState(false)
  const [invoiceVisible, setInvoiceVisible] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const { data: balance, isLoading: balanceLoading } = useBalance(tenantId)
  const { main: availableMain } = formatBalance(balance?.available.amount)
  const { data: breakdown } = useBalanceBreakdown(tenantId)

  const mainRef = useMouseGlow<HTMLButtonElement>()
  const giftRef = useMouseGlow<HTMLButtonElement>()
  const rewardRef = useMouseGlow<HTMLButtonElement>()

  const cardCls = (active: boolean) =>
    cn(
      'billing-glow-card p-4 space-y-1.5 text-left w-full cursor-pointer outline-none select-none mouse-glow-card magnetic-hover',
      active ? 'active' : ''
    )

  const handleRefresh = useCallback(async () => {
    if (!tenantId || refreshing) return
    setRefreshing(true)
    try {
      await Promise.all([
        qc.refetchQueries({ queryKey: ['balance', tenantId] }),
        qc.refetchQueries({ queryKey: ['balance', 'breakdown', tenantId] }),
        qc.refetchQueries({ queryKey: ['billing', 'recharges', tenantId] }),
        qc.refetchQueries({ queryKey: ['billing', 'gift-records', tenantId] }),
        qc.refetchQueries({ queryKey: ['referral', 'reward-records', tenantId] }),
      ])
    } finally {
      setRefreshing(false)
    }
  }, [qc, tenantId, refreshing])

  return (
    <>
      <TopUpModal visible={topUpVisible} onClose={() => setTopUpVisible(false)} tenantId={tenantId} />
      <InvoiceModal
        open={invoiceVisible}
        onClose={() => setInvoiceVisible(false)}
        tenantId={tenantId}
        currencySymbol={currencySymbol}
      />

      <div className="rounded-lg border border-mg-border bg-card-bg p-6 space-y-5 shadow-sm">
        {/* 顶部标题 + 操作按钮 */}
        <div className="flex justify-between items-center">
          <span className="text-sm font-bold text-mg-text-1">{t('billing.balance.title')}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              aria-label={t('common.refresh', { defaultValue: '刷新' })}
              title={t('billing.balance.refreshHint', { defaultValue: '刷新余额与列表' })}
              className="flex items-center justify-center h-9 w-9 rounded-md border border-mg-border text-mg-text-3 hover:text-mg-text-1 hover:bg-mg-fill-0 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <LuRefreshCw size={14} className={cn(refreshing && 'animate-spin')} />
            </button>
            {canInvoice && (
              <Button
                variant="outline"
                onClick={() => setInvoiceVisible(true)}
                className="rounded-md h-9 px-4 text-xs"
              >
                <LuReceipt size={14} className="mr-1.5" />
                {t('billing.invoice.title', { defaultValue: '发票' })}
              </Button>
            )}
            {canRecharge && (
              <Button
                variant="brand"
                onClick={() => setTopUpVisible(true)}
                className="rounded-md h-9 px-5 gap-1.5"
              >
                <LuPlus size={14} />
                {t('billing.balance.recharge')}
              </Button>
            )}
          </div>
        </div>

        {/* 可消费合计 */}
        <div className="space-y-1">
          <p className="text-xs text-mg-text-3">
            {t('billing.balance.spendableTotal')}
            <span className="ml-1 text-mg-text-4">({t('billing.balance.spendableHint')})</span>
          </p>
          <div className="flex items-baseline gap-3 flex-wrap">
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-medium text-mg-text-2">{currencySymbol}</span>
              <span className="text-4xl font-bold tracking-tight tabular-nums leading-none spendable-amount-glow">
                {balanceLoading ? '...' : availableMain}
              </span>
            </div>
          </div>
        </div>

        {/* 余额细分 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            ref={mainRef}
            type="button"
            onClick={() => onTabChange('main')}
            className={cn(cardCls(activeTab === 'main'), activeTab === 'main' && 'active-main')}
          >
            <div className="shimmer-light" />
            <div className={cn('text-xs transition-colors duration-300', activeTab === 'main' ? 'text-brand-base font-semibold' : 'text-mg-text-3')}>
              {t('billing.balance.mainBalance')}
            </div>
            <div className="flex items-baseline gap-0.5 mt-1 select-none">
              <span className="text-xs font-semibold text-mg-text-3">{currencySymbol}</span>
              <span className={cn('text-lg font-bold text-mg-text-1 tabular-nums balance-amount', activeTab === 'main' ? 'amount-main-active' : '')}>
                {formatBalance(breakdown?.main.amount).main}
              </span>
            </div>
            <div className="text-[10px] text-mg-text-3 leading-snug">{t('billing.balance.mainHint')}</div>
          </button>

          <button
            ref={giftRef}
            type="button"
            onClick={() => onTabChange('gift')}
            className={cn(cardCls(activeTab === 'gift'), activeTab === 'gift' && 'active-gift')}
          >
            <div className="shimmer-light" />
            <div className={cn('text-xs transition-colors duration-300', activeTab === 'gift' ? 'text-sky-600 font-semibold' : 'text-mg-text-3')}>
              {t('billing.balance.giftBalance')}
            </div>
            <div className="flex items-baseline gap-0.5 mt-1 select-none">
              <span className="text-xs font-semibold text-mg-text-3">{currencySymbol}</span>
              <span className={cn('text-lg font-bold text-mg-text-1 tabular-nums balance-amount', activeTab === 'gift' ? 'amount-gift-active' : '')}>
                {formatBalance(breakdown?.gift.amount).main}
              </span>
            </div>
            <div className="text-[10px] text-mg-text-3 leading-snug">{t('billing.balance.giftHint')}</div>
          </button>

          <button
            ref={rewardRef}
            type="button"
            onClick={() => onTabChange('reward')}
            className={cn(cardCls(activeTab === 'reward'), activeTab === 'reward' && 'active-reward')}
          >
            <div className="shimmer-light" />
            <div className={cn('text-xs transition-colors duration-300', activeTab === 'reward' ? 'text-amber-500 font-semibold' : 'text-mg-text-3')}>
              {t('billing.balance.rewardBalance')}
            </div>
            <div className="flex items-baseline gap-0.5 mt-1 select-none">
              <span className="text-xs font-semibold text-mg-text-3">{currencySymbol}</span>
              <span className={cn('text-lg font-bold text-mg-text-1 tabular-nums balance-amount', activeTab === 'reward' ? 'amount-reward-active' : '')}>
                {formatBalance(breakdown?.reward.amount).main}
              </span>
            </div>
            <div className="text-[10px] text-mg-text-3 leading-snug">{t('billing.balance.rewardHint')}</div>
          </button>
        </div>
      </div>
    </>
  )
}
