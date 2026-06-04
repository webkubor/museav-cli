import { LuReceipt, LuX, LuHistory, LuGift } from 'react-icons/lu'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  getBalance,
  getBalanceBreakdown,
  createRecharge,
  listRecharges,
  cancelRecharge,
  redeemPromoCode,
} from '@/services/billing'
import { listRewardRecords } from '@/services/referral'
import { useCurrency, useEnabledChannels } from '@/hooks/use-platform-config'
import { useAuthStore } from '@/store/auth'
import { isDomestic } from '@/lib/market'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { appToast } from '@/lib/app-toast'
import { formatDateTime } from '@/lib/format-date'
import { cn } from '@/lib/utils'
import { referralCopy } from '@/pages/referral/referral-data'

// ─── Format Balance Helper ────────────────────────────────────────────────

function formatBalance(amountStr: string | undefined): { main: string; exact: string } {
  if (!amountStr) return { main: '0.00', exact: '0.00' }
  const num = parseFloat(amountStr)
  if (isNaN(num)) return { main: '0.00', exact: '0.00' }
  
  // Format with thousands separator and exactly 2 decimals
  const mainVal = num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  
  // High precision exact value (trim redundant trailing zeros if dot exists)
  let exactVal = amountStr
  if (exactVal.includes('.')) {
    exactVal = exactVal.replace(/0+$/, '').replace(/\.$/, '')
  }
  return { main: mainVal, exact: exactVal }
}

// ─── Sub-components: PromoRedeemForm ──────────────────────────────────────

export function PromoRedeemForm({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')

  const redeem = useMutation({
    mutationFn: (promoCode: string) => redeemPromoCode(tenantId, { code: promoCode }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['balance', tenantId] })
      appToast.success(t('billing.promo.success', { amount: data.credited.amount, currency: data.credited.currency }))
      setCode('')
    },
    onError: (err: Error) => {
      appToast.error(err.message || t('billing.promo.error'))
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) {
      appToast.warning(t('billing.promo.emptyWarning'))
      return
    }
    redeem.mutate(code.trim())
  }

  return (
    <form onSubmit={handleSubmit} className="flex-1 flex gap-2 min-w-0 sm:max-w-xs ml-auto">
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={t('billing.promo.placeholder')}
        disabled={redeem.isPending}
        className="flex-1 min-w-0 h-10 px-3 rounded-xl border border-mg-border bg-mg-fill-0/30 hover:bg-mg-fill-0 focus:bg-mg-fill-0 text-xs focus:outline-none focus:ring-1 focus:ring-brand-glow focus:border-brand-base transition-all font-medium text-mg-text-0"
      />
      <Button
        type="submit"
        variant="outline"
        disabled={redeem.isPending || !code.trim()}
        className="h-10 px-4 text-xs font-semibold rounded-xl hover:bg-mg-fill-0 border border-mg-border shrink-0 transition-all select-none text-mg-text-1"
      >
        {redeem.isPending ? t('billing.rechargeModal.submitting') : t('billing.promo.submit')}
      </Button>
    </form>
  )
}

// ─── Sub-components: TopUpModal ───────────────────────────────────────────

const AlipayLogo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <rect width="24" height="24" rx="4" fill="#1677FF"/>
    <path d="M12 4C7.58 4 4 7.58 4 12s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm3.94 11.5c-1.02-.42-2.04-.88-3.06-1.36-.9 1.02-2.04 1.68-3.3 1.68-1.56 0-2.58-.9-2.58-2.1 0-1.44 1.38-2.34 3.48-2.34.42 0 .84.04 1.26.1V11h-3.3V9.94h4.62v2.02c.54.22 1.08.46 1.62.7.3-.56.48-1.2.48-1.88H14.1c0 .94-.26 1.8-.72 2.52l2.56 1.08v1.12zM9.54 12.4c-1.26 0-2.04.48-2.04 1.26 0 .66.54 1.1 1.44 1.1.84 0 1.62-.5 2.28-1.38-.52-.14-1.08-.2-1.68-.2V12.4z" fill="white"/>
  </svg>
)

const WechatPayLogo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <rect width="24" height="24" rx="4" fill="#07C160"/>
    <path d="M9.5 6C6.46 6 4 8.02 4 10.5c0 1.38.72 2.62 1.86 3.48L5.4 15.5l1.86-.96c.72.2 1.44.3 2.24.3.16 0 .32 0 .48-.02-.1-.32-.16-.66-.16-1.02 0-2.2 2.14-4 4.78-4 .18 0 .36.02.54.02C14.62 7.86 12.3 6 9.5 6zm-1.5 3c.42 0 .76.34.76.76s-.34.76-.76.76-.76-.34-.76-.76.34-.76.76-.76zm3 0c.42 0 .76.34.76.76s-.34.76-.76.76-.76-.34-.76-.76.34-.76.76-.76z" fill="white"/>
    <path d="M19.5 13.8c0-2-1.96-3.6-4.38-3.6s-4.38 1.62-4.38 3.6 1.96 3.6 4.38 3.6c.64 0 1.24-.12 1.78-.32l1.48.78-.36-1.24c.92-.72 1.48-1.74 1.48-2.82zm-5.62-.36c-.34 0-.62-.28-.62-.62s.28-.62.62-.62.62.28.62.62-.28.62-.62.62zm2.48 0c-.34 0-.62-.28-.62-.62s.28-.62.62-.62.62.28.62.62-.28.62-.62.62z" fill="white"/>
  </svg>
)

const StripeLogo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <rect width="24" height="24" rx="4" fill="#635BFF"/>
    <path d="M12.12 9.53c0-.6.5-.84 1.32-.84 1.18 0 2.67.36 3.85.99V5.96A10.22 10.22 0 0 0 13.44 5c-3.43 0-5.71 1.79-5.71 4.78 0 4.66 6.42 3.92 6.42 5.93 0 .71-.62.94-1.48.94-1.28 0-2.92-.53-4.22-1.24v3.74a10.8 10.8 0 0 0 4.22.85c3.51 0 5.93-1.73 5.93-4.77-.03-5.03-6.48-4.13-6.48-5.7z" fill="white"/>
  </svg>
)

const ALL_CHANNELS = [
  { value: 'alipay', label: '支付宝',  icon: <AlipayLogo /> },
  { value: 'wechat', label: '微信支付', icon: <WechatPayLogo /> },
  { value: 'stripe', label: 'Stripe',  icon: <StripeLogo /> },
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

  const { currency, symbol: currencySymbol } = useCurrency()
  const enabledChannels = useEnabledChannels()

  const CHANNELS = enabledChannels.length
    ? ALL_CHANNELS.filter((c) => enabledChannels.includes(c.value))
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
      queryClient.invalidateQueries({ queryKey: ['billing', 'recharges', tenantId] })
      const url = data.payment.redirect_url ?? data.payment.qr_code_url
      if (url) window.open(url, '_blank', 'noopener')
      onClose()
      appToast.success(t('billing.rechargeModal.success'))
    },
    onError: (err: Error) => appToast.error(err.message || t('billing.rechargeModal.error')),
  })

  const presetClasses = (p: string) => {
    const isActive = amount === p
    return cn(
      "flex-1 rounded-xl border text-xs py-2.5 px-3 cursor-pointer transition-all duration-300 text-center font-semibold active:scale-[0.96]",
      isActive
        ? "border-brand-base bg-brand-glow/10 dark:bg-brand-glow/5 text-brand-base font-bold shadow-sm shadow-brand-glow/5 hover:translate-y-[-1px]"
        : "border-mg-border bg-mg-fill-0 text-mg-text-2 hover:text-mg-text-0 hover:bg-mg-fill-0/80 hover:translate-y-[-1px]"
    )
  }

  const channelClasses = (cValue: string) => {
    const isActive = effectiveChannel === cValue
    if (!isActive) {
      return "flex-1 rounded-xl border border-mg-border bg-mg-fill-0 text-mg-text-2 hover:text-mg-text-0 text-xs py-3 px-4 cursor-pointer transition-all duration-300 text-center font-medium active:scale-[0.98] hover:bg-mg-fill-0/80 hover:translate-y-[-1px]"
    }
    if (cValue === 'alipay') {
      return "flex-1 rounded-xl border border-blue-500/80 bg-blue-500/5 text-blue-500 text-xs py-3 px-4 cursor-pointer transition-all duration-300 text-center font-bold shadow-md shadow-blue-500/10 active:scale-[0.98]"
    }
    if (cValue === 'wechat') {
      return "flex-1 rounded-xl border border-emerald-500/80 bg-emerald-500/5 text-emerald-500 text-xs py-3 px-4 cursor-pointer transition-all duration-300 text-center font-bold shadow-md shadow-emerald-500/10 active:scale-[0.98]"
    }
    return "flex-1 rounded-xl border border-indigo-500/80 bg-indigo-500/5 text-indigo-500 text-xs py-3 px-4 cursor-pointer transition-all duration-300 text-center font-bold shadow-md shadow-indigo-500/10 active:scale-[0.98]"
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose} />
      
      {/* 窗体 - 极致流光边框 */}
      <div className="relative bg-card-bg/95 backdrop-blur-xl modal-glow-flow rounded-2xl w-full max-w-[400px] shadow-2xl overflow-visible animate-in fade-in zoom-in-95 duration-300">
        <div className="p-5 border-b border-mg-border/80 flex justify-between items-center bg-mg-fill-0/40 rounded-t-2xl">
          <h2 className="text-sm font-bold text-mg-text-0 tracking-tight">{t('billing.rechargeModal.title')}</h2>
          <button className="text-mg-text-2 hover:text-mg-text-0 text-xs font-semibold transition-colors outline-none cursor-pointer" onClick={onClose}>✕</button>
        </div>

        <div className="p-5 space-y-6">
          <div>
            <div className="text-[11px] text-mg-text-3 font-bold mb-2.5 uppercase tracking-wider">{t('billing.rechargeModal.amount')}</div>
            <div className="flex gap-2 mb-3">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setAmount(p)}
                  className={presetClasses(p)}
                >
                  {currencySymbol}{p}
                </button>
              ))}
            </div>
            <div className="relative mt-3">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mg-text-2 text-sm font-medium">{currencySymbol}</span>
              <input
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full h-[38px] pl-7 pr-3 rounded-xl border border-mg-border bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-brand-glow focus:border-brand-base transition-all font-semibold font-mono text-mg-text-0"
                placeholder={t('billing.rechargeModal.customAmount')}
              />
            </div>
          </div>

          <div>
            <div className="text-[11px] text-mg-text-3 font-bold mb-2.5 uppercase tracking-wider">{t('billing.rechargeModal.method')}</div>
            <div className="flex gap-3">
              {CHANNELS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setChannel(c.value as any)}
                  className={channelClasses(c.value)}
                >
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    {c.icon}
                    {c.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <Button
            variant="brand"
            disabled={!parseFloat(amount) || parseFloat(amount) <= 0 || recharge.isPending}
            onClick={() => recharge.mutate()}
            className="w-full h-11 text-xs rounded-xl"
          >
            {recharge.isPending ? t('billing.rechargeModal.submitting') : t('billing.rechargeModal.submit', { amount })}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components: OrderReceiptDrawer ───────────────────────────────────

interface OrderReceiptDrawerProps {
  isOpen: boolean
  order: any
  onClose: () => void
  cancelMutation: any
  labels: Record<string, string>
}

export function OrderReceiptDrawer({ isOpen, order, onClose, cancelMutation, labels }: OrderReceiptDrawerProps) {
  const { t } = useTranslation()
  if (!isOpen || !order) return null

  const isPending = order.status === 'pending'
  const isPaid = order.status === 'paid'

  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" 
        onClick={onClose} 
      />

      {/* Drawer Body */}
      <div className="relative w-full max-w-[380px] h-full bg-mg-bg-1/95 backdrop-blur-xl border-l border-mg-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 ease-out z-10">
        
        {/* Drawer Header */}
        <div className="p-4 border-b border-mg-border/60 flex items-center justify-between bg-mg-fill-0/20">
          <span className="text-xs font-bold text-mg-text-2 uppercase tracking-wider flex items-center gap-1.5">
            <LuReceipt size={14} className="text-brand-base" />
            {t('billing.orders.detailTitle')}
          </span>
          <button 
            onClick={onClose}
            className="text-mg-text-2 hover:text-mg-text-0 hover:bg-mg-fill-0/80 p-1.5 rounded-lg transition-colors cursor-pointer outline-none"
          >
            <LuX size={16} />
          </button>
        </div>

        {/* Tactile Receipt Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Visual Invoice Page style */}
          <div className="rounded-xl border border-mg-border bg-mg-fill-0/30 p-5 space-y-5 relative shadow-inner overflow-hidden">
            {/* Top decorative receipt cut lines */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-[linear-gradient(to_right,var(--mg-border)_50%,transparent_50%)] bg-[size:10px_100%]" />
            
            {/* Receipt Brand Head */}
            <div className="text-center pt-2 pb-4 border-b border-dashed border-mg-border/80 space-y-1">
              <div className="text-[10px] font-bold text-brand-base uppercase tracking-widest">
                ModelGo Ledger
              </div>
              <div className="text-sm font-mono font-bold tracking-tight text-mg-text-0">
                {t('billing.orders.detail.receiptTitle')}
              </div>
            </div>

            {/* Status Big Badge */}
            <div className="flex flex-col items-center py-2 space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-mg-text-3 font-bold">
                {t('billing.orders.detail.status')}
              </div>
              <span className={cn(
                "text-xs font-bold px-3 py-1 rounded-full border",
                isPaid ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" :
                isPending ? "bg-amber-500/10 border-amber-500/20 text-amber-500 animate-pulse" :
                "bg-mg-fill-0 border-mg-border text-mg-text-3"
              )}>
                {labels[order.status] || order.status}
              </span>
            </div>

            {/* Receipt Details rows inside monospace grid */}
            <div className="font-mono text-xs space-y-3.5 border-t border-b border-dashed border-mg-border/80 py-4 text-mg-text-1">
              <div className="flex justify-between gap-4">
                <span className="text-mg-text-3">{t('billing.orders.detail.orderNo')}:</span>
                <span className="text-mg-text-0 font-bold select-all truncate max-w-[180px]" title={order.order_no}>
                  {order.order_no}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-mg-text-3">{t('billing.orders.detail.amount')}:</span>
                <span className="text-mg-text-0 font-extrabold text-sm leading-none">
                  {order.currency} {order.amount}
                </span>
              </div>
              {order.credited && (
                <div className="flex justify-between gap-4">
                  <span className="text-mg-text-3">{t('billing.orders.detail.credited')}:</span>
                  <span className="text-emerald-500 font-extrabold">
                    {order.currency} {order.credited.amount}
                  </span>
                </div>
              )}
              {order.channel && (
                <div className="flex justify-between gap-4">
                  <span className="text-mg-text-3">{t('billing.orders.detail.channel')}:</span>
                  <span className="text-mg-text-0 uppercase font-semibold">
                    {order.channel}
                  </span>
                </div>
              )}
              {order.paid_at && (
                <div className="flex justify-between gap-4">
                  <span className="text-mg-text-3">{t('billing.orders.detail.paidAt')}:</span>
                  <span className="text-mg-text-2 text-[11px]">
                    {formatDateTime(order.paid_at)}
                  </span>
                </div>
              )}
              {order.promo_code && (
                <div className="flex justify-between gap-4">
                  <span className="text-mg-text-3">{t('billing.orders.detail.promo')}:</span>
                  <span className="text-brand-base font-bold bg-brand-glow/10 px-1.5 rounded text-[11px]">
                    {order.promo_code}
                  </span>
                </div>
              )}
            </div>

            {/* Fake High-Tech Barcode simulation for receipt realism */}
            <div className="flex flex-col items-center pt-2 space-y-1">
              <div className="h-9 w-full max-w-[200px] flex items-stretch gap-[1.5px] opacity-25">
                {[2, 1, 3, 1, 4, 2, 1, 2, 3, 1, 2, 4, 1, 3, 2, 1, 3, 4, 1, 2, 1, 3, 2, 4, 1].map((w, idx) => (
                  <div 
                    key={idx} 
                    className="bg-mg-text-0 h-full rounded-sm"
                    style={{ flexGrow: w }} 
                  />
                ))}
              </div>
              <span className="text-[8px] text-mg-text-3 font-mono tracking-widest font-semibold uppercase">
                * M G - O R D E R - {order.order_no.slice(-8)} *
              </span>
            </div>

            <div className="text-center text-[9px] text-mg-text-3 font-semibold pt-2">
              {t('billing.orders.detail.receiptFooter')}
            </div>

            {/* Bottom decorative receipt cut lines */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-[linear-gradient(to_right,var(--mg-border)_50%,transparent_50%)] bg-[size:10px_100%]" />
          </div>

          {/* Actions Inside Drawer */}
          <div className="space-y-3">
            {isDomestic() && order.invoice_url && (
              <Button
                variant="outline"
                className="w-full h-10 text-xs font-bold rounded-xl border border-mg-border hover:bg-mg-fill-0 transition-all select-none text-mg-text-1"
                onClick={() => window.open(order.invoice_url!, '_blank')}
              >
                {t('billing.orders.detail.viewInvoice')}
              </Button>
            )}

            {isPending && (
              <Button
                variant="destructive"
                disabled={cancelMutation.isPending}
                className="w-full h-10 text-xs font-bold rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 active:scale-[0.98] transition-all select-none"
                onClick={() => {
                  cancelMutation.mutate(order.order_no)
                  onClose()
                }}
              >
                {cancelMutation.isPending ? t('billing.rechargeModal.submitting') : t('billing.orders.table.cancel')}
              </Button>
            )}
          </div>

        </div>

      </div>
    </div>
  )
}

// ─── Mock Gift Balance Records ────────────────────────────────────────────

const MOCK_GIFT_RECORDS = [
  { id: '1', source: '新用户注册赠送', amount: '50.00', currency: 'CNY', credited_at: '2024-03-01T10:00:00Z' },
  { id: '2', source: '活动促销赠送', amount: '100.00', currency: 'CNY', credited_at: '2024-04-15T14:30:00Z' },
  { id: '3', source: '推荐好友奖励', amount: '30.00', currency: 'CNY', credited_at: '2024-05-20T09:00:00Z' },
  { id: '4', source: '平台专属福利', amount: '40.00', currency: 'CNY', credited_at: '2024-06-01T16:00:00Z' },
]

// ─── Main Component ─────────────────────────────────────────────────────────

type BalanceTab = 'main' | 'gift' | 'reward'

export default function BillingPage() {
  const { t, i18n } = useTranslation()
  const tenantId = useAuthStore((s) => s.activeTenantId) ?? ''
  const [topUpVisible, setTopUpVisible] = useState(false)
  const [activeTab, setActiveTab] = useState<BalanceTab>('main')
  const [selectedOrderNo, setSelectedOrderNo] = useState<string | null>(null)

  const rc = i18n.language.startsWith('zh') ? referralCopy.zh : referralCopy.en
  const cardCls = (active: boolean) =>
    cn(
      'rounded-xl border p-4 space-y-1.5 text-left w-full transition-all cursor-pointer outline-none',
      active
        ? 'border-brand-base bg-brand-glow/5 ring-1 ring-brand-base/20'
        : 'border-mg-border/60 bg-mg-fill-0/30 hover:border-mg-border hover:bg-mg-fill-0/50'
    )

  const { symbol: currencySymbol } = useCurrency()
  const qc = useQueryClient()

  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ['balance', tenantId],
    queryFn: () => getBalance(tenantId),
    enabled: !!tenantId,
  })

  const { main: availableMain } = formatBalance(balance?.available.amount)

  // 余额细分（主 / 赠送 / 奖励）—— 走 service 契约，DEV 返回占位值
  const { data: breakdown } = useQuery({
    queryKey: ['balance', 'breakdown', tenantId],
    queryFn: () => getBalanceBreakdown(tenantId),
    enabled: !!tenantId,
  })

  // 奖励记录（即推荐计划返佣流水）
  const { data: rewardRecords = [] } = useQuery({
    queryKey: ['referral', 'reward-records', tenantId],
    queryFn: () => listRewardRecords(tenantId),
    enabled: !!tenantId && activeTab === 'reward',
  })

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
  const selectedOrder = orders.find((o) => o.order_no === selectedOrderNo)
  const labels = t('billing.orders.status', { returnObjects: true }) as Record<string, string>

  // Inline promo redeem state (reuses redeemPromoCode service)
  const [promoCode, setPromoCode] = useState('')
  const redeemMutation = useMutation({
    mutationFn: (code: string) => redeemPromoCode(tenantId, { code }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['balance', tenantId] })
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
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-mg-text-0 leading-none">
          {t('billing.title')}
        </h1>
        <p className="text-[13.5px] text-mg-text-2">
          {t('billing.desc')}
        </p>
      </div>

      <TopUpModal visible={topUpVisible} onClose={() => setTopUpVisible(false)} tenantId={tenantId} />

      {/* 2. 账户余额卡 */}
      <div className="rounded-2xl border border-mg-border bg-card-bg p-6 space-y-5 shadow-sm">
        {/* 顶部标题 + 充值按钮 */}
        <div className="flex justify-between items-center">
          <span className="text-sm font-bold text-mg-text-0">
            {t('billing.balance.title')}
          </span>
          <Button
            variant="brand"
            onClick={() => setTopUpVisible(true)}
            className="rounded-xl h-9 px-5 text-xs"
          >
            {t('billing.balance.recharge')}
          </Button>
        </div>

        {/* 可消费合计 */}
        <div className="space-y-1">
          <p className="text-xs text-mg-text-2">
            {t('billing.balance.spendableTotal')}
            <span className="ml-1 text-mg-text-3">({t('billing.balance.spendableHint')})</span>
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-medium text-mg-text-1">{currencySymbol}</span>
            <span className="text-4xl font-bold text-mg-text-0 tracking-tight tabular-nums leading-none">
              {balanceLoading ? '...' : availableMain}
            </span>
          </div>
        </div>

        {/* 余额细分（可点击切换下方列表） */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* 主余额 → 充值记录 */}
          <button type="button" onClick={() => setActiveTab('main')} className={cardCls(activeTab === 'main')}>
            <div className="text-xs text-mg-text-2">{t('billing.balance.mainBalance')}</div>
            <div className="text-base font-bold text-mg-text-0 tabular-nums">
              {currencySymbol}{formatBalance(breakdown?.main.amount).main}
            </div>
            <div className="text-[10px] text-mg-text-2 leading-snug">{t('billing.balance.mainHint')}</div>
          </button>

          {/* 赠送余额 → 赠送明细 */}
          <button type="button" onClick={() => setActiveTab('gift')} className={cardCls(activeTab === 'gift')}>
            <div className="text-xs text-mg-text-2">{t('billing.balance.giftBalance')}</div>
            <div className="text-base font-bold text-mg-text-0 tabular-nums">
              {currencySymbol}{formatBalance(breakdown?.gift.amount).main}
            </div>
            <div className="text-[10px] text-mg-text-2 leading-snug">{t('billing.balance.giftHint')}</div>
          </button>

          {/* 奖励余额 → 奖励记录 */}
          <button type="button" onClick={() => setActiveTab('reward')} className={cardCls(activeTab === 'reward')}>
            <div className="text-xs text-mg-text-2">{t('billing.balance.rewardBalance')}</div>
            <div className="text-base font-bold text-mg-text-0 tabular-nums">
              {currencySymbol}{formatBalance(breakdown?.reward.amount).main}
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
            <div className="w-9 h-9 rounded-xl bg-mg-fill-0 border border-mg-border flex items-center justify-center shrink-0">
              <LuGift size={16} className="text-brand-base" />
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

      {/* 4. Tab 切换（与上方余额卡片联动，点卡片或点 Tab 都可切换） */}
      <div className="border-b border-mg-border/60 flex gap-6">
        {([
          { key: 'main', label: t('billing.orders.tab.recharge', { defaultValue: '充值记录' }) },
          { key: 'gift', label: t('billing.orders.tab.gift', { defaultValue: '赠送余额明细' }) },
          { key: 'reward', label: t('billing.orders.tab.reward', { defaultValue: '奖励记录' }) },
        ] as { key: BalanceTab; label: string }[]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'pb-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px cursor-pointer outline-none',
              activeTab === tab.key
                ? 'border-brand-base text-brand-base'
                : 'border-transparent text-mg-text-2 hover:text-mg-text-1'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 5. 列表区 */}
      {activeTab === 'main' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* 左：订单表格 */}
          <div className="lg:col-span-2 rounded-2xl border border-mg-border bg-card-bg shadow-sm overflow-hidden">
            {ordersQuery.isLoading ? (
              <div className="py-20 flex justify-center items-center">
                <div className="w-8 h-8 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
              </div>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
                <div className="w-12 h-12 flex items-center justify-center rounded-full bg-mg-fill-0 border border-mg-border/60">
                  <LuHistory size={20} className="text-mg-text-2" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-mg-text-1 font-bold">{t('billing.orders.empty')}</p>
                  <p className="text-xs text-mg-text-3 max-w-[260px] leading-relaxed">
                    {t('billing.orders.emptyHint', { defaultValue: '您的账户当前尚无历史充值或兑换交易流水，可在上方进行快速充值。' })}
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-mg-border bg-mg-fill-0/20">
                      <th className="py-3 px-4 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">{t('billing.orders.table.orderNo')}</th>
                      <th className="py-3 px-4 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">{t('billing.orders.table.status')}</th>
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
                            'border-b border-mg-border/40 hover:bg-mg-fill-0/30 transition-colors cursor-pointer',
                            selectedOrderNo === record.order_no ? 'bg-brand-glow/5' : ''
                          )}
                        >
                          <td className="py-3.5 px-4 font-mono text-xs text-mg-text-1 max-w-[140px] truncate">{record.order_no}</td>
                          <td className="py-3.5 px-4">
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] py-0.5 px-2.5 font-bold rounded-full',
                                isPaid ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-500' :
                                isPending ? 'border-amber-500/20 bg-amber-500/5 text-amber-500' :
                                'border-mg-border text-mg-text-3'
                              )}
                            >
                              {labels[record.status] || record.status}
                            </Badge>
                          </td>
                          <td className="py-3.5 px-4 text-xs font-bold text-mg-text-0 font-mono">{record.currency} {record.amount}</td>
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
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
                <LuReceipt size={28} className="text-mg-text-3" />
                <p className="text-xs text-mg-text-2">{t('billing.orders.detailPlaceholder', { defaultValue: '点击左侧订单查看详情' })}</p>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-start gap-2">
                  <span className="text-mg-text-2 shrink-0">{t('billing.orders.detail.orderNo')}:</span>
                  <span className="font-mono font-bold text-mg-text-0 text-right break-all">{selectedOrder.order_no}</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-mg-text-2 shrink-0">{t('billing.orders.detail.status')}:</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] py-0.5 px-2.5 font-bold rounded-full',
                      selectedOrder.status === 'paid' ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-500' :
                      selectedOrder.status === 'pending' ? 'border-amber-500/20 bg-amber-500/5 text-amber-500' :
                      'border-mg-border text-mg-text-3'
                    )}
                  >
                    {labels[selectedOrder.status] || selectedOrder.status}
                  </Badge>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-mg-text-2 shrink-0">{t('billing.orders.detail.amount')}:</span>
                  <span className="font-bold text-mg-text-0 font-mono">{selectedOrder.currency} {selectedOrder.amount}</span>
                </div>
                {selectedOrder.credited_amount && (
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-mg-text-2 shrink-0">{t('billing.orders.detail.credited')}:</span>
                    <span className="font-bold text-emerald-500 font-mono">{selectedOrder.currency} {selectedOrder.credited_amount}</span>
                  </div>
                )}
                {selectedOrder.channel && (
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-mg-text-2 shrink-0">{t('billing.orders.detail.channel')}:</span>
                    <span className="font-semibold text-mg-text-0 uppercase">{selectedOrder.channel}</span>
                  </div>
                )}
                {selectedOrder.paid_at && (
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-mg-text-2 shrink-0">{t('billing.orders.detail.paidAt')}:</span>
                    <span className="text-mg-text-1 font-mono text-right">{formatDateTime(selectedOrder.paid_at)}</span>
                  </div>
                )}
                {selectedOrder.status === 'pending' && (
                  <div className="pt-3 border-t border-mg-border/40">
                    <Button
                      variant="destructive"
                      disabled={cancelMutation.isPending}
                      className="w-full h-9 text-xs font-bold rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 transition-all"
                      onClick={() => {
                        cancelMutation.mutate(selectedOrder.order_no)
                        setSelectedOrderNo(null)
                      }}
                    >
                      {cancelMutation.isPending ? t('billing.rechargeModal.submitting') : t('billing.orders.table.cancel')}
                    </Button>
                  </div>
                )}
                {isDomestic() && selectedOrder.invoice_url && (
                  <div className="pt-3 border-t border-mg-border/40">
                    <Button
                      variant="outline"
                      className="w-full h-9 text-xs font-bold rounded-xl border border-mg-border hover:bg-mg-fill-0 transition-all text-mg-text-1"
                      onClick={() => window.open(selectedOrder.invoice_url!, '_blank')}
                    >
                      {t('billing.orders.detail.viewInvoice')}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'gift' ? (
        /* 赠送余额明细 */
        <div className="rounded-2xl border border-mg-border bg-card-bg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-mg-border bg-mg-fill-0/20">
                  <th className="py-3 px-4 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">{t('billing.orders.gift.source', { defaultValue: '来源' })}</th>
                  <th className="py-3 px-4 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">{t('billing.orders.gift.amount', { defaultValue: '金额' })}</th>
                  <th className="py-3 px-4 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">{t('billing.orders.gift.creditedAt', { defaultValue: '到账时间' })}</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_GIFT_RECORDS.map((record) => (
                  <tr key={record.id} className="border-b border-mg-border/40 hover:bg-mg-fill-0/20 transition-colors">
                    <td className="py-3.5 px-4 text-xs text-mg-text-0 font-medium">{record.source}</td>
                    <td className="py-3.5 px-4 text-xs font-bold text-emerald-500 font-mono">+{record.currency} {record.amount}</td>
                    <td className="py-3.5 px-4 text-xs text-mg-text-2 font-mono">{formatDateTime(record.credited_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* 奖励记录（原推荐计划「返佣流水」） */
        <div className="rounded-2xl border border-mg-border bg-card-bg shadow-sm overflow-hidden">
          {rewardRecords.length === 0 ? (
            <div className="py-16 text-center text-xs text-mg-text-2">{rc.empty}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-mg-border bg-mg-fill-0/20">
                    <th className="py-3 px-4 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">{rc.colDate}</th>
                    <th className="py-3 px-4 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">{rc.colInvitee}</th>
                    <th className="py-3 px-4 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider text-right">{rc.colSpend}</th>
                    <th className="py-3 px-4 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider text-right">{rc.colRate}</th>
                    <th className="py-3 px-4 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider text-right">{rc.colAmount}</th>
                  </tr>
                </thead>
                <tbody>
                  {rewardRecords.map((rec, i) => (
                    <tr key={i} className="border-b border-mg-border/40 hover:bg-mg-fill-0/20 transition-colors">
                      <td className="py-3.5 px-4 text-xs text-mg-text-2 font-mono">{rec.date}</td>
                      <td className="py-3.5 px-4 text-xs text-mg-text-0 font-medium">{rec.source}</td>
                      <td className="py-3.5 px-4 text-xs text-mg-text-1 font-mono text-right">¥{Number(rec.spend).toLocaleString('zh-CN')}</td>
                      <td className="py-3.5 px-4 text-xs text-mg-text-1 text-right">{rec.rate}%</td>
                      <td className="py-3.5 px-4 text-xs font-bold text-emerald-500 font-mono text-right">+¥{Number(rec.amount).toLocaleString('zh-CN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
