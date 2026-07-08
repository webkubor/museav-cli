import { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { LuRefreshCw, LuReceipt, LuPlus } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { trackAction } from '@/lib/track'
import { appToast } from '@/lib/app-toast'
import { useBalance, useBalanceBreakdown } from '@/hooks/use-balance'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { useMouseGlow } from '@/hooks/use-mouse-glow'
import { transferRewardToBalance } from '@/services/referral'
import { TopUpModal } from './TopUpModal'
import { InvoiceModal } from './invoice/InvoiceModal'
import { formatBalance } from './formatBalance'

const MIN_TRANSFER = 100

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

  // 转入主余额（奖励余额 → 主余额，单次 ≥100）；逻辑对齐推荐页转入流程
  const rewardBalance = Number(breakdown?.reward.amount ?? 0)
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferAmount, setTransferAmount] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState('')
  const transferNum = Number(transferAmount)
  const transferValid = transferNum >= MIN_TRANSFER && transferNum <= rewardBalance

  const openTransfer = () => {
    if (rewardBalance < MIN_TRANSFER) {
      appToast.info(`奖励余额满 ${currencySymbol}${MIN_TRANSFER} 才可转入`)
      return
    }
    setIdempotencyKey(crypto.randomUUID())
    setTransferAmount(String(rewardBalance))
    setTransferOpen(true)
  }
  // 金额一改就重铸幂等键：同键不同额会被后端按原额重放，必须避免
  const onTransferAmountChange = (v: string) => {
    setIdempotencyKey(crypto.randomUUID())
    setTransferAmount(v)
  }

  const transferMutation = useMutation({
    mutationFn: () => transferRewardToBalance(tenantId, { amount: String(transferNum), idempotency_key: idempotencyKey }),
    onSuccess: () => {
      appToast.success('已转入主余额')
      setTransferOpen(false)
      setTransferAmount('')
      void qc.invalidateQueries({ queryKey: ['balance', tenantId] })
      void qc.invalidateQueries({ queryKey: ['balance', 'breakdown', tenantId] })
      void qc.invalidateQueries({ queryKey: ['referral', 'reward-records', tenantId] })
    },
    onError: (err: Error) => appToast.requestError(err, '转入失败'),
  })

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
                onClick={() => { trackAction(PERMS.BILLING_RECHARGE_CREATE); setTopUpVisible(true) }}
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
            <div className="text-xs text-mg-text-3 leading-snug">{t('billing.balance.mainHint')}</div>
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
            <div className="text-xs text-mg-text-3 leading-snug">{t('billing.balance.giftHint')}</div>
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
            <div className="text-xs text-mg-text-3 leading-snug">{t('billing.balance.rewardHint')}</div>
          </button>
        </div>

        {/* 转入主余额：奖励余额 → 主余额（PRD 账单余额面板） */}
        {rewardBalance > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-mg-border/40 pt-3 text-xs">
            <span className="text-mg-text-3">
              奖励余额满 {currencySymbol}{MIN_TRANSFER} 可转入主余额继续消费
            </span>
            <button
              type="button"
              onClick={openTransfer}
              className="shrink-0 font-semibold text-brand-base hover:text-brand-base/80 bg-transparent border-none p-0 cursor-pointer transition-colors"
            >
              转入主余额
            </button>
          </div>
        )}
      </div>

      <Modal
        open={transferOpen}
        onClose={() => {
          if (transferMutation.isPending) return
          setTransferOpen(false)
          setTransferAmount('')
        }}
        size="md"
        title="转入主余额"
        description={`将奖励余额转入主余额继续消费（单次 ≥ ${currencySymbol}${MIN_TRANSFER}）`}
        footer={(
          <>
            <Button
              variant="outline"
              disabled={transferMutation.isPending}
              className="h-8 rounded-lg px-3 text-xs"
              onClick={() => { setTransferOpen(false); setTransferAmount('') }}
            >
              取消
            </Button>
            <Button
              variant="brand"
              loading={transferMutation.isPending}
              disabled={!transferValid}
              className="h-8 rounded-lg px-4 text-xs font-semibold"
              onClick={() => transferMutation.mutate()}
            >
              确认转入
            </Button>
          </>
        )}
      >
        <div className="space-y-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-mg-text-2">转入金额</label>
          <Input
            value={transferAmount}
            disabled={transferMutation.isPending}
            onChange={(e) => onTransferAmountChange(e.target.value)}
            placeholder={String(MIN_TRANSFER)}
            className="h-9 text-xs rounded-lg"
          />
          <span className="block text-xs text-mg-text-3">可转入奖励余额 {currencySymbol}{rewardBalance}</span>
        </div>
      </Modal>
    </>
  )
}
