import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { createRecharge } from '@/services/billing'
import { useCurrency, useEnabledChannels } from '@/hooks/use-platform-config'
import { Button } from '@/components/ui/Button'
import { appToast } from '@/lib/app-toast'
import { cn } from '@/lib/utils'
import {
  RECHARGE_PAYMENT_CHANNELS,
  type RechargePaymentChannel,
} from '@/constants/recharge-channels'
import { AlipayIcon, WechatIcon, StripeIcon } from '@/constants/brand-icons'

const WECHAT_PAYEE_NAME = 'ModelGo'

function buildWechatCashierURL(params: {
  qrCodeUrl: string
  orderNo: string
  amount: string
  currency: string
  payee: string
  returnTo: string
  tenant: string
}) {
  const url = new URL('/billing/wechat-cashier', window.location.origin)
  url.searchParams.set('qr', params.qrCodeUrl)
  url.searchParams.set('order', params.orderNo)
  url.searchParams.set('amount', params.amount)
  url.searchParams.set('currency', params.currency)
  url.searchParams.set('payee', params.payee)
  url.searchParams.set('return_to', params.returnTo)
  // tenant lets the cashier poll the recharge order status to auto-confirm + redirect.
  url.searchParams.set('tenant', params.tenant)
  return url.toString()
}

interface TopUpModalProps {
  visible: boolean
  onClose: () => void
  tenantId: string
}

export function TopUpModal({ visible, onClose, tenantId }: TopUpModalProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('100')
  const [customMode, setCustomMode] = useState(false)

  const { currency, symbol: currencySymbol } = useCurrency()
  const enabledChannels = useEnabledChannels()

  const CHANNELS = enabledChannels.length
    ? RECHARGE_PAYMENT_CHANNELS.filter((c) => enabledChannels.includes(c.value))
    : RECHARGE_PAYMENT_CHANNELS

  const [channel, setChannel] = useState<RechargePaymentChannel>('alipay')
  const effectiveChannel: RechargePaymentChannel = (
    CHANNELS.some((c) => c.value === channel) ? channel : (CHANNELS[0]?.value ?? 'alipay')
  ) as RechargePaymentChannel

  const PRESETS = ['10', '50', '100', '200', '500', '1000']

  const recharge = useMutation({
    mutationFn: () =>
      createRecharge(tenantId, {
        amount,
        currency,
        channel: effectiveChannel,
        return_url: window.location.href,
      }),
    onError: (err: Error) => appToast.error(err.message || t('billing.rechargeModal.error')),
  })

  const handleSubmit = () => {
    const paymentWindow = window.open('about:blank', '_blank')
    if (paymentWindow) paymentWindow.opener = null

    recharge.mutate(undefined, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ['balance', tenantId] })
        queryClient.invalidateQueries({ queryKey: ['billing', 'recharges', tenantId] })

        const redirectURL = effectiveChannel === 'wechat' && data.payment.qr_code_url
          ? buildWechatCashierURL({
              qrCodeUrl: data.payment.qr_code_url,
              orderNo: data.order_no,
              amount,
              currency,
              payee: WECHAT_PAYEE_NAME,
              returnTo: window.location.href,
              tenant: tenantId,
            })
          : data.payment.redirect_url || data.payment.qr_code_url
        if (!redirectURL) {
          paymentWindow?.close()
          appToast.error(t('billing.rechargeModal.error'))
          return
        }
        onClose()
        appToast.success(t('billing.rechargeModal.success'))
        if (paymentWindow && !paymentWindow.closed) {
          paymentWindow.location.href = redirectURL
          return
        }
        window.location.assign(redirectURL)
      },
      onError: () => {
        paymentWindow?.close()
      },
    })
  }

  const numAmount = parseFloat(amount) || 0

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose} />

      <div className="relative bg-card-bg backdrop-blur-xl modal-glow-flow rounded-lg w-full max-w-[480px] shadow-2xl overflow-visible animate-in fade-in zoom-in-95 duration-300">
        {/* 头部 */}
        <div className="px-6 pt-5 pb-4 flex justify-between items-center border-b border-mg-border/60">
          <h2 className="text-[15px] font-bold text-mg-text-0">{t('billing.rechargeModal.title')}</h2>
          <button className="text-mg-text-2 hover:text-mg-text-0 transition-colors outline-none cursor-pointer w-7 h-7 flex items-center justify-center rounded-lg hover:bg-mg-fill-0" onClick={onClose}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* 金额选择标签 */}
          <div>
            <div className="text-[11px] text-mg-text-3 font-bold mb-2.5 tracking-wider">{t('billing.rechargeModal.amount')}</div>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((p) => {
                const active = amount === p && !customMode
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { setAmount(p); setCustomMode(false) }}
                    className={cn(
                      "rounded-lg border py-2.5 cursor-pointer transition-all duration-150 text-center active:scale-[0.97]",
                      active
                        ? "border-brand-base bg-brand-glow text-brand-base"
                        : "border-mg-border text-mg-text-1 hover:text-mg-text-0 hover:border-mg-text-2/30"
                    )}
                  >
                    <span className={cn("text-[15px] font-bold font-mono", active && "text-brand-base")}>{currencySymbol}{p}</span>
                  </button>
                )
              })}
            </div>
            {/* 自定义金额 */}
            <div className="relative mt-2.5">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mg-text-2 text-sm font-medium">{currencySymbol}</span>
              <input
                type="number"
                min="1"
                value={customMode ? amount : ''}
                onFocus={() => setCustomMode(true)}
                onChange={(e) => { setAmount(e.target.value); setCustomMode(true) }}
                className="w-full h-10 pl-7 pr-3 rounded-lg border border-mg-border bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-brand-base/40 focus:border-brand-base transition-all font-semibold font-mono text-mg-text-0"
                placeholder={t('billing.rechargeModal.customAmount')}
              />
            </div>
          </div>

          {/* 支付方式 */}
          <div>
            <div className="text-[11px] text-mg-text-3 font-bold mb-2.5 tracking-wider">{t('billing.rechargeModal.method')}</div>
            <div className="flex gap-2.5">
              {CHANNELS.map((c) => {
                const active = effectiveChannel === c.value
                const brandColor: Record<string, string> = { alipay: '#1677FF', wechat: '#07C160', stripe: '#635BFF' }
                const color = brandColor[c.value]
                const channelIcon: Record<string, React.ReactNode> = {
                  alipay: <AlipayIcon size={22} />,
                  wechat: <WechatIcon size={22} />,
                  stripe: <StripeIcon size={22} />,
                }
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setChannel(c.value)}
                    className={cn(
                      "flex-1 rounded-lg border py-2.5 px-3 cursor-pointer transition-all duration-150 active:scale-[0.97]",
                      active
                        ? "shadow-sm"
                        : "border-mg-border text-mg-text-2 hover:border-mg-text-2/30"
                    )}
                    style={active && color ? {
                      borderColor: color,
                      backgroundColor: `${color}0D`,
                    } : undefined}
                  >
                    <span className="flex items-center justify-center gap-2">
                      {channelIcon[c.value] ?? c.icon}
                      <span className={cn("text-[13px] font-bold", active ? "" : "text-mg-text-1")} style={active && color ? { color } : undefined}>{c.label}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 提交 */}
          <Button
            variant="brand"
            disabled={numAmount <= 0 || recharge.isPending}
            onClick={handleSubmit}
            className="w-full h-11 text-sm font-bold rounded-md"
          >
            {recharge.isPending
              ? t('billing.rechargeModal.submitting')
              : t('billing.rechargeModal.submit', { amount: numAmount > 0 ? amount : '0' })
            }
          </Button>
        </div>
      </div>
    </div>
  )
}
