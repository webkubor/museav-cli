import { LuReceipt, LuHistory, LuGift } from 'react-icons/lu'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import './billing.css'
import { useTranslation } from 'react-i18next'
import {
  listRecharges,
  cancelRecharge,
  redeemPromoCode,
} from '@/services/billing'
import { useBalance, useBalanceBreakdown } from '@/hooks/use-balance'
import { listRewardRecords } from '@/services/referral'
import { listGiftRecords } from '@/services/billing'
import { useCurrency, useSite } from '@/hooks/use-platform-config'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState } from '@/components/ui/EmptyState'
import type { StatusConfig } from '@/components/ui/StatusBadge'
import { appToast } from '@/lib/app-toast'
import { formatDateTime } from '@/lib/format-date'
import { cn } from '@/lib/utils'
import { referralCopy } from '@/pages/referral/referral-data'
import type { RechargeOrder } from '@/types'
import { formatBalance } from './formatBalance'
import { TopUpModal } from './TopUpModal'
import { InvoiceModal } from './invoice/InvoiceModal'
import { renderTierBadge } from './renderTierBadge'
import { OrderBarcode } from './OrderBarcode'

export { PromoRedeemForm } from './PromoRedeemForm'
export { OrderReceiptDrawer } from './OrderReceiptDrawer'

// ─── Main Component ─────────────────────────────────────────────────────────

type BalanceTab = 'main' | 'gift' | 'reward'

export default function BillingPage() {
  const { t, i18n } = useTranslation()
  const tenantId = useAuthStore((s) => s.activeTenantId) ?? ''
  const site = useSite()
  const { hasPermission } = usePermissions()
  const canRecharge = hasPermission(PERMS.BILLING_RECHARGE_CREATE)
  const canCancel   = hasPermission(PERMS.BILLING_RECHARGE_CANCEL)
  const canInvoice  = hasPermission(PERMS.BILLING_INVOICE_VIEW)
  const [topUpVisible, setTopUpVisible] = useState(false)
  const [invoiceVisible, setInvoiceVisible] = useState(false)
  const [activeTab, setActiveTab] = useState<BalanceTab>('main')
  const [selectedOrderNo, setSelectedOrderNo] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)
  const observedTenantRef = useRef<string | null>(null)
  const hasHydratedOrderStatusesRef = useRef(false)
  const orderStatusRef = useRef<Map<string, RechargeOrder['status']>>(new Map())

  const rc = i18n.language.startsWith('zh') ? referralCopy.zh : referralCopy.en

  const cardCls = (active: boolean) =>
    cn(
      'billing-glow-card p-4 space-y-1.5 text-left w-full cursor-pointer outline-none select-none',
      active ? 'active' : ''
    )

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [underlineStyle, setUnderlineStyle] = useState({ left: 0, width: 0 })

  const tabs = useMemo(() => [
    { key: 'main' as const, label: t('billing.orders.tab.recharge', { defaultValue: '充值记录' }) },
    { key: 'gift' as const, label: t('billing.orders.tab.gift', { defaultValue: '赠送余额明细' }) },
    { key: 'reward' as const, label: t('billing.orders.tab.reward', { defaultValue: '奖励记录' }) },
  ], [t])

  useEffect(() => {
    const handleResize = () => {
      const activeIndex = tabs.findIndex((tab) => tab.key === activeTab)
      const activeEl = tabRefs.current[activeIndex]
      if (activeEl) {
        setUnderlineStyle({
          left: activeEl.offsetLeft,
          width: activeEl.offsetWidth,
        })
      }
    }

    const timer = setTimeout(handleResize, 50)
    window.addEventListener('resize', handleResize)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', handleResize)
    }
  }, [activeTab, tabs])

  const { symbol: currencySymbol } = useCurrency()
  const qc = useQueryClient()

  const refreshBalanceViews = useCallback(() => {
    if (!tenantId) return
    void qc.invalidateQueries({ queryKey: ['balance', tenantId] })
    void qc.invalidateQueries({ queryKey: ['balance', 'breakdown', tenantId] })
  }, [qc, tenantId])

  const { data: balance, isLoading: balanceLoading } = useBalance(tenantId)
  const { main: availableMain } = formatBalance(balance?.available.amount)
  const { data: breakdown } = useBalanceBreakdown(tenantId)

  // 奖励记录（即推荐计划返佣流水）
  const { data: rewardRecords = [] } = useQuery({
    queryKey: ['referral', 'reward-records', tenantId],
    queryFn: () => listRewardRecords(tenantId),
    enabled: !!tenantId && activeTab === 'reward',
  })

  // 赠送明细（grant 桶入账 journal，#93）
  const { data: giftRecordsPage } = useQuery({
    queryKey: ['billing', 'gift-records', tenantId],
    queryFn: () => listGiftRecords(tenantId),
    enabled: !!tenantId && activeTab === 'gift',
  })
  const giftRecords = giftRecordsPage?.items ?? []

  const ordersQuery = useInfiniteQuery({
    queryKey: ['billing', 'recharges', tenantId],
    queryFn: ({ pageParam }) => listRecharges(tenantId, { cursor: pageParam as string | undefined, page_size: 15 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor || undefined,
    enabled: !!tenantId,
    refetchInterval: (query) => {
      const pages = query.state.data?.pages ?? []
      const hasPendingOrder = pages.some((page) => page.items.some((order) => order.status === 'pending'))
      return hasPendingOrder ? 3000 : false
    },
    refetchIntervalInBackground: true,
  })

  const orders = useMemo(() => ordersQuery.data?.pages.flatMap((page) => page.items) ?? [], [ordersQuery.data])
  const refetchOrders = ordersQuery.refetch

  const cancelMutation = useMutation({
    mutationFn: (orderNo: string) => cancelRecharge(tenantId, orderNo),
    onSuccess: () => {
      appToast.success(t('billing.orders.cancelSuccess'))
      qc.invalidateQueries({ queryKey: ['billing', 'recharges', tenantId] })
    },
    onError: (err: Error) => appToast.error(err.message || t('billing.orders.cancelError')),
  })

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refetchOrders()
        refreshBalanceViews()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [refetchOrders, refreshBalanceViews])

  useEffect(() => {
    if (!tenantId) {
      observedTenantRef.current = null
      hasHydratedOrderStatusesRef.current = false
      orderStatusRef.current.clear()
      return
    }
    if (observedTenantRef.current !== tenantId) {
      observedTenantRef.current = tenantId
      hasHydratedOrderStatusesRef.current = false
      orderStatusRef.current.clear()
    }

    const nextStatuses = new Map<string, RechargeOrder['status']>()
    const paidOrders: RechargeOrder[] = []
    for (const order of orders) {
      nextStatuses.set(order.order_no, order.status)
      const previousStatus = orderStatusRef.current.get(order.order_no)
      if (hasHydratedOrderStatusesRef.current && previousStatus === 'pending' && order.status === 'paid') {
        paidOrders.push(order)
      }
    }

    orderStatusRef.current = nextStatuses
    if (!hasHydratedOrderStatusesRef.current) {
      hasHydratedOrderStatusesRef.current = true
      return
    }
    if (paidOrders.length === 0) return

    refreshBalanceViews()
    void qc.invalidateQueries({ queryKey: ['billing', 'recharges', tenantId] })

    const order = paidOrders[0]
    const paidAmount = order.credited_amount || order.amount
    appToast.success(t('billing.orders.paymentSuccess', {
      amount: `${order.currency} ${paidAmount}`,
      count: paidOrders.length,
    }))
  }, [orders, qc, refreshBalanceViews, t, tenantId])

  const selectedOrder = orders.find((o) => o.order_no === selectedOrderNo)
  const labels = t('billing.orders.status', { returnObjects: true }) as Record<string, string>

  const rechargeStatusMap = useMemo<Record<string, StatusConfig>>(() => ({
    paid:      { label: labels['paid']      ?? 'paid',      variant: 'success',   dot: true },
    pending:   { label: labels['pending']   ?? 'pending',   variant: 'warning',   dot: true },
    failed:    { label: labels['failed']    ?? 'failed',    variant: 'danger',    dot: true },
    cancelled: { label: labels['cancelled'] ?? 'cancelled', variant: 'secondary', dot: true },
  }), [labels])

  // Inline promo redeem state (reuses redeemPromoCode service)
  const [promoCode, setPromoCode] = useState('')
  const redeemMutation = useMutation({
    mutationFn: (code: string) => redeemPromoCode(tenantId, { code }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['balance', tenantId] })
      qc.invalidateQueries({ queryKey: ['balance', 'breakdown', tenantId] })
      appToast.success(t('billing.promo.success', { amount: data.credited.amount, currency: data.credited.currency }))
      setPromoCode('')
    },
    onError: (err: Error) => {
      appToast.error(err.message || t('billing.promo.error'))
    },
  })

  const handlePromoSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!promoCode.trim()) {
      appToast.warning(t('billing.promo.emptyWarning'))
      return
    }
    redeemMutation.mutate(promoCode.trim())
  }

  return (
    <div className="space-y-6">
      {/* 1. 页头 */}
      <PageHeader
        title={t('billing.title')}
        description={t('billing.desc')}
        className="mb-0"
      />

      <TopUpModal visible={topUpVisible} onClose={() => setTopUpVisible(false)} tenantId={tenantId} />

      <InvoiceModal
        open={invoiceVisible}
        onClose={() => setInvoiceVisible(false)}
        tenantId={tenantId}
        currencySymbol={currencySymbol}
      />

      <Modal
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        size="sm"
        title={t('billing.orders.cancelConfirm.title')}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              className="h-9 px-4 text-xs rounded-xl"
              onClick={() => setCancelTarget(null)}
            >
              {t('billing.orders.cancelConfirm.no')}
            </Button>
            <Button
              variant="destructive"
              disabled={cancelMutation.isPending}
              className="h-9 px-4 text-xs rounded-xl bg-mg-danger/10 hover:bg-mg-danger/20 text-mg-danger border border-mg-danger/20"
              onClick={() => {
                if (cancelTarget) {
                  cancelMutation.mutate(cancelTarget)
                  setSelectedOrderNo(null)
                }
                setCancelTarget(null)
              }}
            >
              {cancelMutation.isPending ? t('billing.rechargeModal.submitting') : t('billing.orders.cancelConfirm.yes')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-mg-text-1">{t('billing.orders.cancelConfirm.message')}</p>
      </Modal>

      {/* 2. 账户余额卡 */}
      <div className="rounded-2xl border border-mg-border bg-card-bg p-6 space-y-5 shadow-sm">
        {/* 顶部标题 + 充值按钮 */}
        <div className="flex justify-between items-center">
          <span className="text-sm font-bold text-mg-text-0">
            {t('billing.balance.title')}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setInvoiceVisible(true)}
              className="rounded-xl h-9 px-4 text-xs"
            >
              <LuReceipt size={14} className="mr-1" />
              发票
            </Button>
            {canRecharge && (
              <Button
                variant="brand"
                onClick={() => setTopUpVisible(true)}
                className="rounded-xl h-9 px-5 text-xs"
              >
                {t('billing.balance.recharge')}
              </Button>
            )}
          </div>
        </div>

        {/* 可消费合计 */}
        <div className="space-y-1">
          <p className="text-xs text-mg-text-2">
            {t('billing.balance.spendableTotal')}
            <span className="ml-1 text-mg-text-3">({t('billing.balance.spendableHint')})</span>
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-medium text-mg-text-1">{currencySymbol}</span>
            <span className="text-4xl font-bold tracking-tight tabular-nums leading-none spendable-amount-glow">
              {balanceLoading ? '...' : availableMain}
            </span>
          </div>
        </div>

        {/* 余额细分（可点击切换下方列表） */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* 主余额 → 充值记录 */}
          <button
            type="button"
            onClick={() => setActiveTab('main')}
            className={cn(cardCls(activeTab === 'main'), activeTab === 'main' && 'active-main')}
          >
            <div className="shimmer-light" />
            <div className={cn(
              "text-xs transition-colors duration-300",
              activeTab === 'main' ? "text-brand-base font-semibold" : "text-mg-text-2"
            )}>
              {t('billing.balance.mainBalance')}
            </div>
            <div className="flex items-baseline gap-0.5 mt-1 select-none">
              <span className="text-xs font-semibold text-mg-text-2">{currencySymbol}</span>
              <span className={cn(
                "text-lg font-bold text-mg-text-0 tabular-nums balance-amount",
                activeTab === 'main' ? "amount-main-active" : ""
              )}>
                {formatBalance(breakdown?.main.amount).main}
              </span>
            </div>
            <div className="text-[10px] text-mg-text-2 leading-snug">{t('billing.balance.mainHint')}</div>
          </button>

          {/* 赠送余额 → 赠送明细 */}
          <button
            type="button"
            onClick={() => setActiveTab('gift')}
            className={cn(cardCls(activeTab === 'gift'), activeTab === 'gift' && 'active-gift')}
          >
            <div className="shimmer-light" />
            <div className={cn(
              "text-xs transition-colors duration-300",
              activeTab === 'gift' ? "text-sky-600 font-semibold" : "text-mg-text-2"
            )}>
              {t('billing.balance.giftBalance')}
            </div>
            <div className="flex items-baseline gap-0.5 mt-1 select-none">
              <span className="text-xs font-semibold text-mg-text-2">{currencySymbol}</span>
              <span className={cn(
                "text-lg font-bold text-mg-text-0 tabular-nums balance-amount",
                activeTab === 'gift' ? "amount-gift-active" : ""
              )}>
                {formatBalance(breakdown?.gift.amount).main}
              </span>
            </div>
            <div className="text-[10px] text-mg-text-2 leading-snug">{t('billing.balance.giftHint')}</div>
          </button>

          {/* 奖励余额 → 奖励记录 */}
          <button
            type="button"
            onClick={() => setActiveTab('reward')}
            className={cn(cardCls(activeTab === 'reward'), activeTab === 'reward' && 'active-reward')}
          >
            <div className="shimmer-light" />
            <div className={cn(
              "text-xs transition-colors duration-300",
              activeTab === 'reward' ? "text-amber-500 font-semibold" : "text-mg-text-2"
            )}>
              {t('billing.balance.rewardBalance')}
            </div>
            <div className="flex items-baseline gap-0.5 mt-1 select-none">
              <span className="text-xs font-semibold text-mg-text-2">{currencySymbol}</span>
              <span className={cn(
                "text-lg font-bold text-mg-text-0 tabular-nums balance-amount",
                activeTab === 'reward' ? "amount-reward-active" : ""
              )}>
                {formatBalance(breakdown?.reward.amount).main}
              </span>
            </div>
            <div className="text-[10px] text-mg-text-2 leading-snug">{t('billing.balance.rewardHint')}</div>
          </button>
        </div>
      </div>

      {/* 3. 兑换码充值卡 */}
      <div className="rounded-2xl border border-mg-border bg-card-bg p-5 shadow-sm">
        <form onSubmit={handlePromoSubmit} className="flex items-center gap-4 flex-wrap">
          {/* 左侧图标 + 标题 */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-base/15 to-brand-base/5 border border-brand-base/20 flex items-center justify-center shrink-0 shadow-sm">
              <span className="text-[20px] leading-none" role="img" aria-label="gift">🎁</span>
            </div>
            <div>
              <div className="text-sm font-bold text-mg-text-0">{t('billing.promo.title')}</div>
              <div className="text-[11px] text-mg-text-2 mt-0.5">{t('billing.promo.subtitle', { defaultValue: '线下收款 / 促销码自助到账' })}</div>
            </div>
          </div>

          {/* 输入框 */}
          <input
            type="text"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value)}
            placeholder={t('billing.promo.placeholder')}
            disabled={redeemMutation.isPending}
            className="flex-1 min-w-[180px] h-9 px-3 rounded-xl border border-mg-border bg-mg-fill-0/30 hover:bg-mg-fill-0 focus:bg-mg-fill-0 text-xs focus:outline-none focus:ring-1 focus:ring-brand-glow focus:border-brand-base transition-all font-medium text-mg-text-0"
          />

          {/* 立即兑换 */}
          <Button
            type="submit"
            variant="outline"
            disabled={redeemMutation.isPending || !promoCode.trim()}
            className="h-9 px-4 text-xs font-semibold rounded-xl border border-mg-border shrink-0 hover:bg-mg-fill-0 transition-all text-mg-text-1"
          >
            {redeemMutation.isPending ? t('billing.rechargeModal.submitting') : t('billing.promo.submit')}
          </Button>
        </form>
      </div>

      {/* 4. Tab 切换（与上方余额卡片联动，点卡片和点 Tab 都可切换） */}
      <div className="relative p-1 bg-mg-fill-0/50 border border-mg-border/30 rounded-xl flex gap-1 w-fit select-none">
        {/* 滑动背景胶囊 (联动对应的专属氛围阴影和边框) */}
        <div
          className={cn(
            "absolute top-1 bottom-1 bg-card-bg rounded-lg transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] z-0 border",
            activeTab === 'main'
              ? "border-brand-base/20 shadow-[0_2px_10px_var(--brand-glow)]"
              : activeTab === 'gift'
              ? "border-sky-500/20 shadow-[0_2px_10px_rgba(14,165,233,0.15)]"
              : "border-amber-500/20 shadow-[0_2px_10px_rgba(245,158,11,0.15)]"
          )}
          style={{
            left: underlineStyle.left,
            width: underlineStyle.width,
          }}
        />
        {tabs.map((tab, idx) => (
          <button
            key={tab.key}
            ref={(el) => {
              tabRefs.current[idx] = el
            }}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-1.5 text-xs font-bold rounded-lg transition-all duration-300 cursor-pointer outline-none z-10 select-none',
              activeTab === tab.key
                ? (tab.key === 'main'
                    ? 'text-brand-base'
                    : tab.key === 'gift'
                    ? 'text-sky-600'
                    : 'text-amber-500')
                : 'text-mg-text-2 hover:text-mg-text-1'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 5. 列表区 */}
      <div key={activeTab} className="animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out">
        {activeTab === 'main' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* 左：订单表格 */}
          <div className="lg:col-span-2 rounded-2xl border border-mg-border bg-card-bg shadow-sm overflow-hidden">
            {ordersQuery.isLoading ? (
              <div className="py-20 flex justify-center items-center">
                <div className="w-8 h-8 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
              </div>
            ) : orders.length === 0 ? (
              <EmptyState
                icon={<LuHistory />}
                title={t('billing.orders.empty')}
                description={t('billing.orders.emptyHint', { defaultValue: '您的账户当前尚无历史充值或兑换交易流水，可在上方进行快速充值。' })}
                className="py-20"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-mg-border bg-mg-fill-0/20">
                      <th className="py-3 px-4 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">{t('billing.orders.table.orderNo')}</th>
                      <th className="py-3 px-4 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">{t('billing.orders.table.status')}</th>
                      <th className="py-3 px-4 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">{t('billing.orders.table.channel')}</th>
                      <th className="py-3 px-4 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">{t('billing.orders.table.amount')}</th>
                      <th className="py-3 px-4 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">{t('billing.orders.table.paidAt')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((record) => {
                      const isPending = record.status === 'pending'
                      const isPaid = record.status === 'paid'
                      return (
                        <tr
                          key={record.order_no}
                          onClick={() => setSelectedOrderNo(record.order_no === selectedOrderNo ? null : record.order_no)}
                          className={cn(
                            'border-b border-mg-border/40 cursor-pointer billing-table-row',
                            selectedOrderNo === record.order_no ? 'active' : ''
                          )}
                        >
                          <td className="py-3.5 px-4 font-mono text-xs text-mg-text-1 max-w-[140px] truncate">{record.order_no}</td>
                          <td className="py-3.5 px-4">
                            <StatusBadge
                              status={record.status}
                              statusMap={rechargeStatusMap}
                              fallback={record.status}
                            />
                          </td>
                          <td className="py-3.5 px-4 text-xs text-mg-text-1 font-semibold whitespace-nowrap">
                            {record.channel_label || record.channel || '-'}
                          </td>
                          <td className={cn(
                            'py-3.5 px-4 text-xs font-bold font-mono',
                            isPaid ? 'text-mg-success' : isPending ? 'text-mg-warning' : 'text-mg-text-0'
                          )}>
                            {record.currency} {record.amount}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-mg-text-2 font-mono">{formatDateTime(record.paid_at)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {ordersQuery.hasNextPage && (
                  <div className="p-3 border-t border-mg-border/40">
                    <Button
                      variant="outline"
                      className="w-full h-9 rounded-xl font-bold text-xs border border-mg-border hover:bg-mg-fill-0 transition-all text-mg-text-1"
                      onClick={() => ordersQuery.fetchNextPage()}
                    >
                      {t('billing.orders.loadMore')}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 右：订单详情常驻侧栏 */}
          <div className="lg:col-span-1 rounded-2xl border border-mg-border bg-card-bg shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <LuReceipt size={14} className="text-brand-base" />
              <span className="text-xs font-bold text-mg-text-0">{t('billing.orders.detailTitle')}</span>
            </div>
            {!selectedOrder ? (
              <EmptyState
                icon={<LuReceipt />}
                title={t('billing.orders.detailPlaceholder', { defaultValue: '点击左侧订单查看详情' })}
              />
            ) : (
              <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
                {/* 仿真发票小票 */}
                <div className="receipt-container-mini relative p-5 space-y-4">
                  {/* 顶部齿线 */}
                  <div className="absolute top-0 left-0 right-0 h-1 bg-[linear-gradient(to_right,var(--mg-border)_50%,transparent_50%)] bg-[size:10px_100%]" />

                  {/* 发票标头 */}
                  <div className="text-center pt-1 pb-3 border-b border-dashed border-mg-border/80 space-y-1">
                    <div className="text-[9px] font-bold text-brand-base uppercase tracking-widest">
                      ModelGo Ledger
                    </div>
                    <div className="text-xs font-mono font-bold tracking-tight text-mg-text-0">
                      {t('billing.orders.detail.receiptTitle')}
                    </div>
                  </div>

                  {/* 状态大标 */}
                  <div className="flex flex-col items-center py-1 space-y-1">
                    <StatusBadge
                      status={selectedOrder.status}
                      statusMap={rechargeStatusMap}
                      fallback={selectedOrder.status}
                    />
                  </div>

                  {/* 发票内容 */}
                  <div className="font-mono text-[11px] space-y-3 border-t border-b border-dashed border-mg-border/80 py-3.5 text-mg-text-1">
                    <div className="flex justify-between gap-3">
                      <span className="text-mg-text-3">{t('billing.orders.detail.orderNo')}:</span>
                      <span className="text-mg-text-0 font-bold select-all truncate max-w-[130px]" title={selectedOrder.order_no}>
                        {selectedOrder.order_no}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-mg-text-3">{t('billing.orders.detail.amount')}:</span>
                      <span className="text-mg-text-0 font-extrabold text-xs">
                        {selectedOrder.currency} {selectedOrder.amount}
                      </span>
                    </div>
                    {selectedOrder.credited_amount && (
                      <div className="flex justify-between gap-3">
                        <span className="text-mg-text-3">{t('billing.orders.detail.credited')}:</span>
                        <span className="text-mg-success font-extrabold">
                          {selectedOrder.currency} {selectedOrder.credited_amount}
                        </span>
                      </div>
                    )}
                    {selectedOrder.channel && (
                      <div className="flex justify-between gap-3">
                        <span className="text-mg-text-3">{t('billing.orders.detail.channel')}:</span>
                        <span className="text-mg-text-0 font-semibold">
                          {selectedOrder.channel_label || selectedOrder.channel}
                        </span>
                      </div>
                    )}
                    {selectedOrder.paid_at && (
                      <div className="flex justify-between gap-3">
                        <span className="text-mg-text-3">{t('billing.orders.detail.paidAt')}:</span>
                        <span className="text-mg-text-2 text-[10px] text-right">
                          {formatDateTime(selectedOrder.paid_at)}
                        </span>
                      </div>
                    )}
                    {selectedOrder.promo_code && (
                      <div className="flex justify-between gap-3">
                        <span className="text-mg-text-3">{t('billing.orders.detail.promo')}:</span>
                        <span className="text-brand-base font-bold bg-brand-glow/10 px-1.5 rounded text-[10px]">
                          {selectedOrder.promo_code}
                        </span>
                      </div>
                    )}
                  </div>

                  <OrderBarcode value={selectedOrder.order_no} compact />

                  {/* 底部齿线 */}
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-[linear-gradient(to_right,var(--mg-border)_50%,transparent_50%)] bg-[size:10px_100%]" />
                </div>

                {/* 详情下方的按钮操作区 */}
                <div className="space-y-2 pt-1">
                  {canCancel && selectedOrder.status === 'pending' && (
                    <Button
                      variant="destructive"
                      disabled={cancelMutation.isPending}
                      className="w-full h-9 text-xs font-bold rounded-xl bg-mg-danger/10 hover:bg-mg-danger/20 text-mg-danger border border-mg-danger/20 active:scale-[0.98] transition-all"
                      onClick={() => setCancelTarget(selectedOrder.order_no)}
                    >
                      {cancelMutation.isPending ? t('billing.rechargeModal.submitting') : t('billing.orders.table.cancel')}
                    </Button>
                  )}
                  {canInvoice && site === 'china' && selectedOrder.invoice_url && (
                    <Button
                      variant="outline"
                      className="w-full h-9 text-xs font-bold rounded-xl border border-mg-border hover:bg-mg-fill-0 transition-all text-mg-text-1"
                      onClick={() => window.open(selectedOrder.invoice_url!, '_blank')}
                    >
                      {t('billing.orders.detail.viewInvoice')}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'gift' ? (
        /* 赠送余额明细 */
        <div className="rounded-2xl border border-mg-border bg-card-bg shadow-sm overflow-hidden">
          {giftRecords.length === 0 ? (
            <EmptyState
              icon={<LuGift />}
              title={t('billing.orders.gift.empty', { defaultValue: '暂无赠送记录' })}
            />
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-mg-border/60 bg-mg-fill-0/30">
                  <th className="py-3 px-4 font-bold text-mg-text-2 text-[10px] uppercase tracking-wider">{t('billing.orders.gift.source', { defaultValue: '来源' })}</th>
                  <th className="py-3 px-4 font-bold text-mg-text-2 text-[10px] uppercase tracking-wider">{t('billing.orders.gift.amount', { defaultValue: '金额' })}</th>
                  <th className="py-3 px-4 font-bold text-mg-text-2 text-[10px] uppercase tracking-wider">{t('billing.orders.gift.creditedAt', { defaultValue: '到账时间' })}</th>
                </tr>
              </thead>
              <tbody>
                {giftRecords.map((record) => (
                  <tr key={record.id} className="border-b border-mg-border/40 cursor-pointer billing-table-row">
                    <td className="py-3.5 px-4 font-medium">
                      <div className="flex items-center gap-2.5 select-none">
                        <div className="w-6 h-6 rounded-lg bg-brand-glow/10 flex items-center justify-center border border-brand-base/10 shrink-0">
                          <LuGift size={12} className="text-brand-base" />
                        </div>
                        <span className="text-xs text-mg-text-0 font-bold">{record.source}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-bold text-mg-success font-mono">+{record.currency} {record.amount}</td>
                    <td className="py-3.5 px-4 text-xs text-mg-text-2 font-mono">{formatDateTime(record.credited_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      ) : (
        /* 奖励记录（原推荐计划「返佣流水」） */
        <div className="rounded-2xl border border-mg-border bg-card-bg shadow-sm overflow-hidden">
          {rewardRecords.length === 0 ? (
            <EmptyState title={rc.empty} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-mg-border/60 bg-mg-fill-0/30">
                    <th className="py-3 px-4 font-bold text-mg-text-2 text-[10px] uppercase tracking-wider">{rc.colDate}</th>
                    <th className="py-3 px-4 font-bold text-mg-text-2 text-[10px] uppercase tracking-wider">{rc.colInvitee}</th>
                    <th className="py-3 px-4 font-bold text-mg-text-2 text-[10px] uppercase tracking-wider">{rc.colTier}</th>
                    <th className="py-3 px-4 font-bold text-mg-text-2 text-[10px] uppercase tracking-wider text-right">{rc.colSpend}</th>
                    <th className="py-3 px-4 font-bold text-mg-text-2 text-[10px] uppercase tracking-wider text-right">{rc.colRate}</th>
                    <th className="py-3 px-4 font-bold text-mg-text-2 text-[10px] uppercase tracking-wider text-right">{rc.colAmount}</th>
                  </tr>
                </thead>
                <tbody>
                  {rewardRecords.map((rec, i) => (
                    <tr key={i} className="border-b border-mg-border/40 cursor-pointer billing-table-row">
                      <td className="py-3.5 px-4 text-xs text-mg-text-2 font-mono">{rec.date}</td>
                      <td className="py-3.5 px-4 font-medium">
                        <div className="flex items-center gap-2.5 select-none">
                          <div className="w-6 h-6 rounded-full bg-mg-fill-1 border border-mg-border flex items-center justify-center font-bold text-[10px] text-mg-text-1 uppercase shrink-0">
                            {rec.source.slice(0, 2)}
                          </div>
                          <span className="text-xs text-mg-text-0 font-bold">{rec.source}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {renderTierBadge(rec.tierName)}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-mg-text-1 font-mono text-right">¥{Number(rec.spend).toLocaleString('zh-CN')}</td>
                      <td className="py-3.5 px-4 text-right">
                        <span className="bg-brand-glow/10 text-brand-base text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-brand-base/10 font-mono">
                          {rec.rate}%
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs font-bold text-mg-success font-mono text-right">+¥{Number(rec.amount).toLocaleString('zh-CN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  )
}
