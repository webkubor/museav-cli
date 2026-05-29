import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  getBalance,
  createRecharge,
  listRecharges,
  cancelRecharge,
} from '@/services/billing'
import { usePlatformConfig, useCurrency } from '@/hooks/use-platform-config'
import { useAuthStore } from '@/store/auth'
import { isDomestic } from '@/lib/market'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { appToast } from '@/lib/app-toast'

// ─── Sub-components: TopUpModal ───────────────────────────────────────────

const ALL_CHANNELS = [
  { value: 'alipay',  label: '支付宝' },
  { value: 'wechat',  label: '微信支付' },
  { value: 'stripe',  label: 'Stripe' },
]

interface TopUpModalProps {
  visible: boolean
  onClose: () => void
  tenantId: string
}

function TopUpModal({ visible, onClose, tenantId }: TopUpModalProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('100')

  const { data: platformConfig } = usePlatformConfig()
  const { currency, symbol: currencySymbol } = useCurrency()

  const CHANNELS = platformConfig?.enabled_channels?.length
    ? ALL_CHANNELS.filter((c) => platformConfig.enabled_channels.includes(c.value))
    : ALL_CHANNELS

  const [channel, setChannel] = useState<'alipay' | 'wechat' | 'stripe'>('alipay')
  const effectiveChannel: 'alipay' | 'wechat' | 'stripe' = (
    CHANNELS.some((c) => c.value === channel) ? channel : (CHANNELS[0]?.value ?? 'alipay')
  ) as 'alipay' | 'wechat' | 'stripe'

  const PRESETS = ['10', '50', '100', '500']

  const recharge = useMutation({
    mutationFn: () =>
      createRecharge(tenantId, {
        amount,
        currency,
        channel: effectiveChannel,
        return_url: window.location.href,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['balance', tenantId] })
      const url = data.payment.redirect_url ?? data.payment.qr_code_url
      if (url) window.open(url, '_blank', 'noopener')
      onClose()
      appToast.success(t('billing.rechargeModal.success'))
    },
    onError: (err: Error) => appToast.error(err.message || t('billing.rechargeModal.error')),
  })

  const btnBaseClass = "flex-1 rounded-lg border border-mg-border bg-mg-fill-0 text-mg-text-1 hover:text-mg-text-0 text-xs py-2 px-3 cursor-pointer transition-all text-center font-medium"
  const btnActiveClass = "flex-1 rounded-lg border border-brand-base bg-brand-glow/10 dark:bg-brand-glow/5 text-brand-base text-xs py-2 px-3 cursor-pointer transition-all text-center font-semibold"

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      {/* 窗体 */}
      <div className="relative bg-card-bg border border-mg-border rounded-2xl w-full max-w-[400px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-5 border-b border-mg-border flex justify-between items-center bg-mg-fill-0">
          <h2 className="text-sm font-bold text-mg-text-0">{t('billing.rechargeModal.title')}</h2>
          <button className="text-mg-text-2 hover:text-mg-text-0 text-xs font-semibold transition-colors" onClick={onClose}>✕</button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <div className="text-xs text-mg-text-2 font-semibold mb-2.5 uppercase tracking-wider">{t('billing.rechargeModal.amount')}</div>
            <div className="flex gap-2 mb-3">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setAmount(p)}
                  className={amount === p ? btnActiveClass : btnBaseClass}
                >
                  {currencySymbol}{p}
                </button>
              ))}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mg-text-2 text-sm font-medium">{currencySymbol}</span>
              <input
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full h-[38px] pl-7 pr-3 rounded-lg border border-mg-border bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-brand-glow focus:border-brand-base transition-all font-medium"
                placeholder={t('billing.rechargeModal.customAmount')}
              />
            </div>
          </div>

          <div>
            <div className="text-xs text-mg-text-2 font-semibold mb-2.5 uppercase tracking-wider">{t('billing.rechargeModal.method')}</div>
            <div className="flex gap-2">
              {CHANNELS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setChannel(c.value as any)}
                  className={effectiveChannel === c.value ? btnActiveClass : btnBaseClass}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <Button
            variant="default"
            disabled={!parseFloat(amount) || parseFloat(amount) <= 0 || recharge.isPending}
            onClick={() => recharge.mutate()}
            className="w-full h-10 text-xs font-semibold rounded-lg shadow-md bg-gradient-to-r from-brand-base to-brand-deep hover:opacity-95"
          >
            {recharge.isPending ? t('billing.rechargeModal.submitting') : t('billing.rechargeModal.submit', { amount })}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function BillingPage() {
  const { t } = useTranslation()
  const tenantId = useAuthStore((s) => s.activeTenantId) ?? ''
  const [topUpVisible, setTopUpVisible] = useState(false)

  const { symbol: currencySymbol } = useCurrency()

  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ['balance', tenantId],
    queryFn: () => getBalance(tenantId),
    enabled: !!tenantId,
  })

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--mg-text-0)', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
          {t('billing.title')}
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--mg-text-1)', margin: 0, fontWeight: 400 }}>
          {t('billing.desc')}
        </p>
      </div>

      <TopUpModal visible={topUpVisible} onClose={() => setTopUpVisible(false)} tenantId={tenantId} />

      {/* Balance Section */}
      <div className="card-shadow-adaptive bg-card-bg border border-mg-border rounded-2xl" style={{ padding: '28px 32px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--mg-text-1)' }}>{t('billing.balance.title')}</div>
          <Button variant="default" onClick={() => setTopUpVisible(true)} className="rounded-lg font-semibold h-9 px-4">
            {t('billing.balance.recharge')}
          </Button>
        </div>
        {balanceLoading ? (
          <div className="py-4 flex justify-start items-center">
            <div className="w-6 h-6 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '48px', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--mg-text-2)', marginBottom: '6px' }}>{t('billing.balance.available')}</div>
              <div style={{ fontSize: '36px', fontWeight: 700, color: 'var(--mg-text-0)', letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ fontSize: '20px', fontWeight: 500, color: 'var(--mg-text-1)', marginRight: '2px' }}>{currencySymbol}</span>{balance?.available.amount ?? '—'}
              </div>
            </div>
            <div style={{ height: '44px', width: '1px', backgroundColor: 'var(--mg-fill-0)' }} />
            <div>
              <div style={{ fontSize: '12px', color: 'var(--mg-text-2)', marginBottom: '6px' }}>{t('billing.balance.frozen')}</div>
              <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--mg-text-1)', letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--mg-text-2)', marginRight: '2px' }}>{currencySymbol}</span>{balance?.reserved.amount ?? '—'}
              </div>
            </div>
          </div>
        )}
      </div>

      <OrderTab tenantId={tenantId} />
    </div>
  )
}

// ─── Tab 2: Orders ────────────────────────────────────────────────────────

function OrderTab({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [selectedOrderNo, setSelectedOrderNo] = useState<string | null>(null)

  const ordersQuery = useInfiniteQuery({
    queryKey: ['billing', 'recharges', tenantId],
    queryFn: ({ pageParam }) => listRecharges(tenantId, { cursor: pageParam as string | undefined, page_size: 15 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor || undefined,
    enabled: !!tenantId,
  })

  const cancelMutation = useMutation({
    mutationFn: (orderNo: string) => cancelRecharge(tenantId, orderNo),
    onSuccess: () => {
      appToast.success(t('billing.orders.cancelSuccess'))
      qc.invalidateQueries({ queryKey: ['billing', 'recharges', tenantId] })
    },
    onError: (err: Error) => appToast.error(err.message || t('billing.orders.cancelError')),
  })

  const orders = ordersQuery.data?.pages.flatMap((page) => page.items) ?? []
  const selected = orders.find((o) => o.order_no === selectedOrderNo)
  const labels = t('billing.orders.status', { returnObjects: true }) as Record<string, string>

  return (
    <div style={{ display: 'flex', gap: '24px', padding: '16px 0' }} className="flex-col md:flex-row">
      <div style={{ flex: 1 }} className="bg-card-bg border border-mg-border rounded-2xl overflow-hidden shadow-sm p-4">
        <div className="overflow-x-auto w-full p-1">
          {ordersQuery.isLoading ? (
            <div className="py-20 flex justify-center items-center">
              <div className="w-8 h-8 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="text-3xl mb-3">📬</span>
              <p className="text-sm text-mg-text-2 font-medium">{t('billing.orders.empty')}</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-mg-border">
                  <th className="py-3 px-4 font-semibold text-mg-text-2 text-xs">{t('billing.orders.table.orderNo')}</th>
                  <th className="py-3 px-4 font-semibold text-mg-text-2 text-xs">{t('billing.orders.table.status')}</th>
                  <th className="py-3 px-4 font-semibold text-mg-text-2 text-xs">{t('billing.orders.table.amount')}</th>
                  <th className="py-3 px-4 font-semibold text-mg-text-2 text-xs">{t('billing.orders.table.paidAt')}</th>
                  <th className="py-3 px-4 font-semibold text-gray-400 dark:text-gray-500 text-xs w-24">{t('billing.orders.table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((record) => (
                  <tr
                    key={record.order_no}
                    onClick={() => setSelectedOrderNo(record.order_no)}
                    className={`border-b border-gray-100/50 dark:border-gray-800/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors cursor-pointer ${
                      selectedOrderNo === record.order_no ? 'bg-brand-glow/5 dark:bg-brand-glow/3 font-semibold' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-mono text-xs text-gray-600 dark:text-gray-400">
                      {record.order_no}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="outline" className="text-[10px] py-0.5 px-2 font-medium">
                        {labels[record.status] || record.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-xs font-bold text-gray-800 dark:text-gray-200">
                      {record.currency} {record.amount}
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-400 dark:text-gray-500">
                      {record.paid_at ? new Date(record.paid_at).toLocaleString() : '—'}
                    </td>
                    <td className="py-3 px-4 text-xs" onClick={(e) => e.stopPropagation()}>
                      {record.status === 'pending' ? (
                        <button
                          onClick={() => cancelMutation.mutate(record.order_no)}
                          className="text-rose-500 hover:text-rose-600 font-bold bg-none border-none cursor-pointer transition-colors p-0 text-xs"
                        >
                          {t('billing.orders.table.cancel')}
                        </button>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-700">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {ordersQuery.hasNextPage && (
          <Button
            variant="outline"
            className="w-full mt-4 h-9 rounded-lg font-semibold text-xs border border-gray-200 hover:bg-gray-50"
            onClick={() => ordersQuery.fetchNextPage()}
          >
            {t('billing.orders.loadMore')}
          </Button>
        )}
      </div>

      <div style={{ width: '300px', padding: '20px', backgroundColor: 'var(--mg-bg-1)', borderRadius: '12px' }} className="w-full md:w-[300px] shrink-0 border border-gray-100 dark:border-gray-800">
        <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: 700 }}>{t('billing.orders.detailTitle')}</h3>
        {selected ? (
          <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div><span style={{ color: 'var(--mg-text-2)', fontWeight: 500 }}>{t('billing.orders.detail.orderNo')}:</span> <span className="font-mono text-xs">{selected.order_no}</span></div>
            <div><span style={{ color: 'var(--mg-text-2)', fontWeight: 500 }}>{t('billing.orders.detail.status')}:</span> <span className="font-semibold text-xs">{selected.status}</span></div>
            <div><span style={{ color: 'var(--mg-text-2)', fontWeight: 500 }}>{t('billing.orders.detail.amount')}:</span> <span className="font-bold text-xs">{selected.currency} {selected.amount}</span></div>
            {isDomestic() && selected.invoice_url && (
              <Button
                variant="outline"
                className="w-full h-8 text-xs font-semibold rounded-lg mt-2"
                onClick={() => window.open(selected.invoice_url!, '_blank')}
              >
                {t('billing.orders.detail.viewInvoice')}
              </Button>
            )}
          </div>
        ) : <p style={{ color: 'var(--mg-text-2)', fontSize: '13px' }}>{t('billing.orders.detailPlaceholder')}</p>}
      </div>
    </div>
  )
}
