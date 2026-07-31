import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuPlus, LuTicket } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { InfoTip } from '@/components/ui/InfoTip'
import { cn } from '@/lib/utils'
import { trackAction, trackEvent } from '@/lib/track'
import { useBalance, useBalanceBreakdown } from '@/hooks/use-balance'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { TopUpModal } from './TopUpModal'
import { PromoRedeemForm } from './PromoRedeemForm'
import { calculateSpendableBalance, formatBalance } from './formatBalance'
import { amountBand } from './billing-tracking'

export type BalanceTab = 'all' | 'main' | 'gift' | 'reward'

interface BalanceCardProps {
  tenantId: string
  currencySymbol: string
  activeTab: BalanceTab
  onTabChange: (tab: BalanceTab) => void
}

export function BalanceCard({ tenantId, currencySymbol, activeTab, onTabChange }: BalanceCardProps) {
  const { t } = useTranslation()
  const { hasPermission } = usePermissions()
  const canRecharge = hasPermission(PERMS.BILLING_RECHARGE_CREATE)
  const canRedeem = hasPermission(PERMS.BILLING_PROMO_REDEEM)

  const [topUpVisible, setTopUpVisible] = useState(false)
  const [redeemVisible, setRedeemVisible] = useState(false)

  const { data: balance, isLoading: balanceLoading } = useBalance(tenantId)
  const { data: breakdown, isLoading: breakdownLoading } = useBalanceBreakdown(tenantId)
  const spendableBalance = calculateSpendableBalance(
    balance?.available.amount,
    breakdown?.gift.amount,
    breakdown?.reward.amount,
  )
  const { main: spendableTotal } = formatBalance(
    spendableBalance === undefined ? undefined : String(spendableBalance),
  )

  const cardCls = (active: boolean) =>
    cn(
      'billing-balance-bucket p-4 space-y-2 text-left w-full cursor-pointer outline-none select-none',
      active ? 'active' : ''
    )

  return (
    <>
      <TopUpModal visible={topUpVisible} onClose={() => setTopUpVisible(false)} tenantId={tenantId} />

      {/* 兑换优惠码弹窗：表单自带 BILLING_PROMO_REDEEM 权限门控，兑换成功后自动关闭 */}
      <Modal
        open={redeemVisible}
        onClose={() => setRedeemVisible(false)}
        size="sm"
        title={t('billing.promo.title')}
        description={t('billing.promo.subtitle', { defaultValue: '线下收款 / 促销码自助到账' })}
      >
        <PromoRedeemForm tenantId={tenantId} onSuccess={() => setRedeemVisible(false)} />
      </Modal>

      <div className="rounded-lg border border-mg-border bg-card-bg p-6 space-y-5 shadow-sm">
        {/* 顶部标题 + 操作按钮 */}
        <div className="billing-balance-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="billing-balance-title text-sm font-bold text-mg-text-1">{t('billing.balance.title')}</span>
          <div className="billing-balance-actions flex items-center gap-2">
            {/* qa#277 二轮反馈：刷新按钮去掉——原型 billing-balance-actions 只有充值/兑换优惠码两个按钮 */}
            {canRecharge && (
              <Button
                variant="brand"
                onClick={() => {
                  trackAction(PERMS.BILLING_RECHARGE_CREATE)
                  trackEvent('billing_recharge_open', {
                    entry_position: 'balance_card',
                    balance_total_band: amountBand(spendableBalance),
                  })
                  setTopUpVisible(true)
                }}
                className="rounded-md h-9 px-5 gap-1.5"
              >
                <LuPlus size={14} />
                {t('billing.balance.recharge')}
              </Button>
            )}
            {canRedeem && (
              <Button
                variant="outline"
                onClick={() => {
                  trackAction(PERMS.BILLING_PROMO_REDEEM)
                  trackEvent('billing_redeem_open', { entry_position: 'balance_card' })
                  setRedeemVisible(true)
                }}
                className="rounded-md h-9 px-4 gap-1.5"
              >
                <LuTicket size={14} />
                {t('billing.promo.title')}
              </Button>
            )}
          </div>
        </div>

        {/* 可消费合计 */}
        <div className="space-y-1">
          <p className="flex items-center gap-1 text-xs text-mg-text-3">
            {t('billing.balance.spendableTotal')}
            <InfoTip text="调用消费时按 赠送 → 奖励 → 主余额 的顺序扣减。" />
          </p>
          <div className="flex items-baseline gap-3 flex-wrap">
            <div className="billing-spendable-line flex items-baseline gap-1">
              <span className="text-lg font-medium text-mg-text-2">{currencySymbol}</span>
              <span className="billing-spendable-amount text-4xl font-bold tabular-nums leading-none text-mg-text-1">
                {balanceLoading || breakdownLoading ? '...' : spendableTotal}
              </span>
            </div>
          </div>
        </div>

        {/* 余额细分：赠送→奖励→主依次自动扣减，不再需要手动转入主余额（PRD 已移除该操作） */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => onTabChange('main')}
            className={cn(cardCls(activeTab === 'main'), activeTab === 'main' && 'active-main')}
          >
            <div className={cn('text-xs transition-colors duration-300', activeTab === 'main' ? 'text-brand-base font-semibold' : 'text-mg-text-3')}>
              {t('billing.balance.mainBalance')}
            </div>
            <div className="flex items-baseline gap-0.5 mt-1 select-none">
              <span className="text-xs font-semibold text-mg-text-3">{currencySymbol}</span>
              <span className={cn('text-lg font-bold text-mg-text-1 tabular-nums balance-amount', activeTab === 'main' ? 'amount-main-active' : '')}>
                {formatBalance(breakdown?.main.amount).main}
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('gift')}
            className={cn(cardCls(activeTab === 'gift'), activeTab === 'gift' && 'active-gift')}
          >
            <div className={cn('flex items-center gap-1 text-xs transition-colors duration-300', activeTab === 'gift' ? 'text-brand-base font-semibold' : 'text-mg-text-3')}>
              {t('billing.balance.giftBalance')}
              <InfoTip text="活动、兑换码等赠送额度，调用消费时优先扣减。" />
            </div>
            <div className="flex items-baseline gap-0.5 mt-1 select-none">
              <span className="text-xs font-semibold text-mg-text-3">{currencySymbol}</span>
              <span className={cn('text-lg font-bold text-mg-text-1 tabular-nums balance-amount', activeTab === 'gift' ? 'amount-gift-active' : '')}>
                {formatBalance(breakdown?.gift.amount).main}
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('reward')}
            className={cn(cardCls(activeTab === 'reward'), activeTab === 'reward' && 'active-reward')}
          >
            <div className={cn('flex items-center gap-1 text-xs transition-colors duration-300', activeTab === 'reward' ? 'text-brand-base font-semibold' : 'text-mg-text-3')}>
              {t('billing.balance.rewardBalance')}
              <InfoTip text="推荐返佣等产生的奖励，调用消费时在主余额前扣减。" />
            </div>
            <div className="flex items-baseline gap-0.5 mt-1 select-none">
              <span className="text-xs font-semibold text-mg-text-3">{currencySymbol}</span>
              <span className={cn('text-lg font-bold text-mg-text-1 tabular-nums balance-amount', activeTab === 'reward' ? 'amount-reward-active' : '')}>
                {formatBalance(breakdown?.reward.amount).main}
              </span>
            </div>
          </button>
        </div>
      </div>
    </>
  )
}
