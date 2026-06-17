import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { LuReceipt, LuHistory, LuGift } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/Table'
import { Pagination } from '@/components/ui/Pagination'
import type { StatusConfig } from '@/components/ui/StatusBadge'
import { appToast } from '@/lib/app-toast'
import { formatDateTime } from '@/lib/format-date'
import { cn } from '@/lib/utils'
import { referralCopy } from '@/pages/referral/referral-data'
import type { RechargeOrder } from '@/types'
import { getRechargeOrderChannelDisplayName } from '@/constants/recharge-channels'
import { listRecharges, cancelRecharge, listGiftRecords } from '@/services/billing'
import { listRewardRecords } from '@/services/referral'
import { useClientPage } from '@/hooks/use-client-page'
import { useCursorPager } from '@/hooks/use-cursor-pager'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { renderTierBadge } from './renderTierBadge'
import { OrderBarcode } from './OrderBarcode'
import type { BalanceTab } from './BalanceCard'

interface BillingOrdersPanelProps {
  tenantId: string
  activeTab: BalanceTab
  onTabChange: (tab: BalanceTab) => void
  site: string
}

export function BillingOrdersPanel({ tenantId, activeTab, onTabChange, site }: BillingOrdersPanelProps) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { hasPermission } = usePermissions()
  const canCancel = hasPermission(PERMS.BILLING_RECHARGE_CANCEL)
  const canInvoice = hasPermission(PERMS.BILLING_INVOICE_VIEW)

  const rc = i18n.language.startsWith('zh') ? referralCopy.zh : referralCopy.en

  const [selectedOrderNo, setSelectedOrderNo] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)

  const observedTenantRef = useRef<string | null>(null)
  const hasHydratedOrderStatusesRef = useRef(false)
  const orderStatusRef = useRef<Map<string, RechargeOrder['status']>>(new Map())

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [underlineStyle, setUnderlineStyle] = useState({ left: 0, width: 0 })

  const tabs = useMemo(() => [
    { key: 'main' as const, label: t('billing.orders.tab.recharge', { defaultValue: '充值记录' }) },
    { key: 'gift' as const, label: t('billing.orders.tab.gift', { defaultValue: '赠送余额明细' }) },
    { key: 'reward' as const, label: t('billing.orders.tab.reward', { defaultValue: '奖励记录' }) },
  ], [t])

  const updateUnderline = useCallback(() => {
    const activeIndex = tabs.findIndex((tab) => tab.key === activeTab)
    const activeEl = tabRefs.current[activeIndex]
    if (activeEl) {
      setUnderlineStyle({ left: activeEl.offsetLeft, width: activeEl.offsetWidth })
    }
  }, [activeTab, tabs])

  useEffect(() => {
    updateUnderline()
    window.addEventListener('resize', updateUnderline)
    return () => window.removeEventListener('resize', updateUnderline)
  }, [updateUnderline])

  const labels = t('billing.orders.status', { returnObjects: true }) as Record<string, string>
  const rechargeStatusMap = useMemo<Record<string, StatusConfig>>(() => ({
    paid:      { label: labels['paid']      ?? 'paid',      variant: 'success',   dot: true },
    pending:   { label: labels['pending']   ?? 'pending',   variant: 'warning',   dot: true },
    failed:    { label: labels['failed']    ?? 'failed',    variant: 'danger',    dot: true },
    cancelled: { label: labels['cancelled'] ?? 'cancelled', variant: 'secondary', dot: true },
  }), [labels])

  // 赠送明细——游标翻页。
  const giftPager = useCursorPager()
  const { data: giftRecordsPage, isFetching: giftFetching } = useQuery({
    queryKey: ['billing', 'gift-records', tenantId, giftPager.page, giftPager.cursor],
    queryFn: () => listGiftRecords(tenantId, { cursor: giftPager.cursor, page_size: 15 }),
    enabled: !!tenantId && activeTab === 'gift',
    placeholderData: keepPreviousData,
  })
  const giftRecords = giftRecordsPage?.items ?? []
  const giftHasMore = Boolean(giftRecordsPage?.next_cursor)

  // 充值记录——游标翻页（上一页/下一页 + 页码），替代旧的「加载更多」。
  const rechargePager = useCursorPager()
  const ordersQuery = useQuery({
    queryKey: ['billing', 'recharges', tenantId, rechargePager.page, rechargePager.cursor],
    queryFn: () => listRecharges(tenantId, { cursor: rechargePager.cursor, page_size: 15 }),
    enabled: !!tenantId && activeTab === 'main',
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  })
  const orders = useMemo(() => ordersQuery.data?.items ?? [], [ordersQuery.data])
  const ordersHasMore = Boolean(ordersQuery.data?.has_more && ordersQuery.data?.next_cursor)
  const refetchOrders = ordersQuery.refetch

  // 切租户后回到第一页：游标按租户隔离，旧 cursor 发给新租户会拿错数据。
  const { reset: resetRechargePager } = rechargePager
  const { reset: resetGiftPager } = giftPager
  useEffect(() => {
    resetRechargePager()
    resetGiftPager()
  }, [tenantId, resetRechargePager, resetGiftPager])

  const { data: rewardRecords = [] } = useQuery({
    queryKey: ['referral', 'reward-records', tenantId],
    queryFn: () => listRewardRecords(tenantId),
    enabled: !!tenantId && activeTab === 'reward',
  })
  const rewardPage = useClientPage(rewardRecords)

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
        void qc.invalidateQueries({ queryKey: ['balance', tenantId] })
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [refetchOrders, qc, tenantId])

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
    void qc.invalidateQueries({ queryKey: ['balance', tenantId] })
    void qc.invalidateQueries({ queryKey: ['billing', 'recharges', tenantId] })
    const order = paidOrders[0]
    const paidAmount = order.credited_amount || order.amount
    appToast.success(t('billing.orders.paymentSuccess', {
      amount: `${order.currency} ${paidAmount}`,
      count: paidOrders.length,
    }))
  }, [orders, qc, t, tenantId])

  const selectedOrder = orders.find((o) => o.order_no === selectedOrderNo)

  return (
    <>
      {/* 取消订单确认弹窗 */}
      <Modal
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        size="sm"
        title={t('billing.orders.cancelConfirm.title')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="h-9 px-4 text-xs rounded-md" onClick={() => setCancelTarget(null)}>
              {t('billing.orders.cancelConfirm.no')}
            </Button>
            <Button
              variant="destructive"
              disabled={cancelMutation.isPending}
              className="h-9 px-4 text-xs rounded-md bg-mg-danger/10 hover:bg-mg-danger/20 text-mg-danger border border-mg-danger/20"
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

      {/* Tab 切换 */}
      <div className="relative p-1 bg-mg-fill-0/50 border border-mg-border/30 rounded-md flex gap-1 w-fit select-none">
        <div
          className={cn(
            'absolute top-1 bottom-1 bg-card-bg rounded-lg transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] z-0 border',
            activeTab === 'main'
              ? 'border-brand-base/20 shadow-[0_2px_10px_var(--brand-glow)]'
              : activeTab === 'gift'
              ? 'border-sky-500/20 shadow-[0_2px_10px_rgba(14,165,233,0.15)]'
              : 'border-amber-500/20 shadow-[0_2px_10px_rgba(245,158,11,0.15)]',
          )}
          style={{ left: underlineStyle.left, width: underlineStyle.width }}
        />
        {tabs.map((tab, idx) => (
          <button
            key={tab.key}
            ref={(el) => { tabRefs.current[idx] = el }}
            onClick={() => onTabChange(tab.key)}
            className={cn(
              'px-4 py-1.5 text-xs font-bold rounded-lg transition-all duration-300 cursor-pointer outline-none z-10 select-none',
              activeTab === tab.key
                ? tab.key === 'main' ? 'text-brand-base' : tab.key === 'gift' ? 'text-sky-600' : 'text-amber-500'
                : 'text-mg-text-2 hover:text-mg-text-1',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 列表区 */}
      <div className="transition-opacity duration-200">
        {/* 充值记录 */}
        <div className={cn(activeTab === 'main' ? 'block' : 'hidden')}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 rounded-lg border border-mg-border bg-card-bg shadow-sm overflow-hidden">
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
                <div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('billing.orders.table.orderNo')}</TableHead>
                        <TableHead>{t('billing.orders.table.status')}</TableHead>
                        <TableHead>{t('billing.orders.table.channel')}</TableHead>
                        <TableHead>{t('billing.orders.table.amount')}</TableHead>
                        <TableHead>{t('billing.orders.table.paidAt')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((record) => {
                        const isPending = record.status === 'pending'
                        const isPaid = record.status === 'paid'
                        return (
                          <TableRow
                            key={record.order_no}
                            onClick={() => setSelectedOrderNo(record.order_no === selectedOrderNo ? null : record.order_no)}
                            className={cn('cursor-pointer billing-table-row', selectedOrderNo === record.order_no ? 'active' : '')}
                          >
                            <TableCell className="font-mono text-xs text-mg-text-1 max-w-[140px] truncate">{record.order_no}</TableCell>
                            <TableCell>
                              <StatusBadge status={record.status} statusMap={rechargeStatusMap} fallback={record.status} />
                            </TableCell>
                            <TableCell className="text-xs text-mg-text-1 font-semibold whitespace-nowrap">
                              {getRechargeOrderChannelDisplayName(record) || '-'}
                            </TableCell>
                            <TableCell className={cn('text-xs font-bold font-mono', isPaid ? 'text-mg-success' : isPending ? 'text-mg-warning' : 'text-mg-text-0')}>
                              {record.currency} {record.amount}
                            </TableCell>
                            <TableCell className="text-xs text-mg-text-2 font-mono">{formatDateTime(record.paid_at)}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              {/* 翻页器移出空状态分支：空的第 N 页也要能点上一页（#214）。翻页清掉选中行，
                  避免详情面板指向不在当前页的订单而空白。 */}
              {(rechargePager.page > 1 || ordersHasMore) && (
                <Pagination
                  mode="cursor"
                  page={rechargePager.page}
                  hasMore={ordersHasMore}
                  loading={ordersQuery.isFetching}
                  onPrev={() => { setSelectedOrderNo(null); rechargePager.prev() }}
                  onNext={() => { setSelectedOrderNo(null); rechargePager.next(ordersQuery.data?.next_cursor) }}
                />
              )}
            </div>

            {/* 订单详情侧栏 */}
            <div className="lg:col-span-1 rounded-lg border border-mg-border bg-card-bg shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <LuReceipt size={14} className="text-brand-base" />
                <span className="text-xs font-bold text-mg-text-0">{t('billing.orders.detailTitle')}</span>
              </div>
              {!selectedOrder ? (
                <EmptyState icon={<LuReceipt />} title={t('billing.orders.detailPlaceholder', { defaultValue: '点击左侧订单查看详情' })} />
              ) : (
                <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
                  <div className="receipt-container-mini relative p-5 space-y-4">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-[linear-gradient(to_right,var(--mg-border)_50%,transparent_50%)] bg-[size:10px_100%]" />
                    <div className="text-center pt-1 pb-3 border-b border-dashed border-mg-border/80 space-y-1">
                      <div className="text-[9px] font-bold text-brand-base uppercase tracking-widest">ModelGo Ledger</div>
                      <div className="text-xs font-mono font-bold tracking-tight text-mg-text-0">{t('billing.orders.detail.receiptTitle')}</div>
                    </div>
                    <div className="flex flex-col items-center py-1 space-y-1">
                      <StatusBadge status={selectedOrder.status} statusMap={rechargeStatusMap} fallback={selectedOrder.status} />
                    </div>
                    <div className="font-mono text-[11px] space-y-3 border-t border-b border-dashed border-mg-border/80 py-3.5 text-mg-text-1">
                      <div className="flex justify-between gap-3">
                        <span className="text-mg-text-3">{t('billing.orders.detail.orderNo')}:</span>
                        <span className="text-mg-text-0 font-bold select-all truncate max-w-[130px]" title={selectedOrder.order_no}>{selectedOrder.order_no}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-mg-text-3">{t('billing.orders.detail.amount')}:</span>
                        <span className="text-mg-text-0 font-extrabold text-xs font-mono tabular-nums">{selectedOrder.currency} {selectedOrder.amount}</span>
                      </div>
                      {selectedOrder.credited_amount && (
                        <div className="flex justify-between gap-3">
                          <span className="text-mg-text-3">{t('billing.orders.detail.credited')}:</span>
                          <span className="text-mg-success font-extrabold font-mono tabular-nums">{selectedOrder.currency} {selectedOrder.credited_amount}</span>
                        </div>
                      )}
                      {selectedOrder.channel && (
                        <div className="flex justify-between gap-3">
                          <span className="text-mg-text-3">{t('billing.orders.detail.channel')}:</span>
                          <span className="text-mg-text-0 font-semibold">{getRechargeOrderChannelDisplayName(selectedOrder)}</span>
                        </div>
                      )}
                      {selectedOrder.paid_at && (
                        <div className="flex justify-between gap-3">
                          <span className="text-mg-text-3">{t('billing.orders.detail.paidAt')}:</span>
                          <span className="text-mg-text-2 text-[10px] text-right">{formatDateTime(selectedOrder.paid_at)}</span>
                        </div>
                      )}
                      {selectedOrder.promo_code && (
                        <div className="flex justify-between gap-3">
                          <span className="text-mg-text-3">{t('billing.orders.detail.promo')}:</span>
                          <span className="text-brand-base font-bold bg-brand-glow/10 px-1.5 rounded-sm text-[10px]">{selectedOrder.promo_code}</span>
                        </div>
                      )}
                    </div>
                    <OrderBarcode value={selectedOrder.order_no} compact />
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-[linear-gradient(to_right,var(--mg-border)_50%,transparent_50%)] bg-[size:10px_100%]" />
                  </div>
                  <div className="space-y-2 pt-1">
                    {canCancel && selectedOrder.status === 'pending' && (
                      <Button
                        variant="destructive"
                        disabled={cancelMutation.isPending}
                        className="w-full h-9 text-xs font-bold rounded-md bg-mg-danger/10 hover:bg-mg-danger/20 text-mg-danger border border-mg-danger/20 active:scale-[0.98] transition-all"
                        onClick={() => setCancelTarget(selectedOrder.order_no)}
                      >
                        {cancelMutation.isPending ? t('billing.rechargeModal.submitting') : t('billing.orders.table.cancel')}
                      </Button>
                    )}
                    {canInvoice && site === 'china' && selectedOrder.invoice_url && (
                      <Button
                        variant="outline"
                        className="w-full h-9 text-xs font-bold rounded-md border border-mg-border hover:bg-mg-fill-0 transition-all text-mg-text-1"
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
        </div>

        {/* 赠送余额明细 */}
        <div className={cn(activeTab === 'gift' ? 'block' : 'hidden')}>
          <div className="rounded-lg border border-mg-border bg-card-bg shadow-sm overflow-hidden">
            {giftRecords.length === 0 ? (
              <EmptyState icon={<LuGift />} title={t('billing.orders.gift.empty', { defaultValue: '暂无赠送记录' })} />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('billing.orders.gift.source', { defaultValue: '来源' })}</TableHead>
                    <TableHead>{t('billing.orders.gift.amount', { defaultValue: '金额' })}</TableHead>
                    <TableHead>{t('billing.orders.gift.creditedAt', { defaultValue: '到账时间' })}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {giftRecords.map((record) => (
                    <TableRow key={record.id} className="cursor-pointer billing-table-row">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2.5 select-none">
                          <div className="w-6 h-6 rounded-lg bg-brand-glow/10 flex items-center justify-center border border-brand-base/10 shrink-0">
                            <LuGift size={12} className="text-brand-base" />
                          </div>
                          <span className="text-xs text-mg-text-0 font-bold">{record.source}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-bold text-mg-success font-mono">+{record.currency} {record.amount}</TableCell>
                      <TableCell className="text-xs text-mg-text-2 font-mono">{formatDateTime(record.credited_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {/* 翻页器移出空状态分支：空的第 N 页也要能点上一页（#214）。 */}
            {(giftPager.page > 1 || giftHasMore) && (
              <Pagination
                mode="cursor"
                page={giftPager.page}
                hasMore={giftHasMore}
                loading={giftFetching}
                onPrev={giftPager.prev}
                onNext={() => giftPager.next(giftRecordsPage?.next_cursor)}
              />
            )}
          </div>
        </div>

        {/* 奖励记录 */}
        <div className={cn(activeTab === 'reward' ? 'block' : 'hidden')}>
          <div className="rounded-lg border border-mg-border bg-card-bg shadow-sm overflow-hidden">
            {rewardRecords.length === 0 ? (
              <EmptyState title={rc.empty} />
            ) : (
              <div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{rc.colDate}</TableHead>
                      <TableHead>{rc.colInvitee}</TableHead>
                      <TableHead>{rc.colTier}</TableHead>
                      <TableHead align="right">{rc.colSpend}</TableHead>
                      <TableHead align="right">{rc.colRate}</TableHead>
                      <TableHead align="right">{rc.colAmount}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rewardPage.paged.map((rec, i) => (
                      <TableRow key={i} className="cursor-pointer billing-table-row">
                        <TableCell className="text-xs text-mg-text-2 font-mono">{formatDateTime(rec.date)}</TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2.5 select-none">
                            <div className="w-6 h-6 rounded-full bg-mg-fill-1 border border-mg-border flex items-center justify-center font-bold text-[10px] text-mg-text-1 uppercase shrink-0">
                              {rec.source.slice(0, 2)}
                            </div>
                            <span className="text-xs text-mg-text-0 font-bold">{rec.source}</span>
                          </div>
                        </TableCell>
                        <TableCell>{renderTierBadge(rec.tierName)}</TableCell>
                        <TableCell align="right" className="text-xs text-mg-text-1 font-mono">¥{Number(rec.spend).toLocaleString('zh-CN')}</TableCell>
                        <TableCell align="right">
                          <span className="bg-brand-glow/10 text-brand-base text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-brand-base/10 font-mono">{rec.rate}%</span>
                        </TableCell>
                        <TableCell align="right" className="text-xs font-bold text-mg-success font-mono">+¥{Number(rec.amount).toLocaleString('zh-CN')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {rewardPage.total > rewardPage.pageSize && (
                  <Pagination
                    mode="page"
                    page={rewardPage.page}
                    total={rewardPage.total}
                    pageSize={rewardPage.pageSize}
                    onPageChange={rewardPage.setPage}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
