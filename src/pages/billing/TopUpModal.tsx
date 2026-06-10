import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import { LuCopy } from 'react-icons/lu'
import { createRecharge } from '@/services/billing'
import { useCurrency, useEnabledChannels } from '@/hooks/use-platform-config'
import { Button } from '@/components/ui/Button'
import { appToast } from '@/lib/app-toast'
import { cn } from '@/lib/utils'
import { AlipayIcon, WechatIcon, StripeIcon } from '@/constants/brand-icons'

const ALL_CHANNELS = [
  { value: 'alipay', label: '支付宝',  icon: <AlipayIcon /> },
  { value: 'wechat', label: '微信支付', icon: <WechatIcon /> },
  { value: 'stripe', label: 'Stripe',  icon: <StripeIcon /> },
]

interface TopUpModalProps {
  visible: boolean
  onClose: () => void
  tenantId: string
}

interface WechatQrPayment {
  orderNo: string
  url: string
}

export function TopUpModal({ visible, onClose, tenantId }: TopUpModalProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('100')
  const [wechatQr, setWechatQr] = useState<WechatQrPayment | null>(null)

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

  useEffect(() => {
    if (!visible) setWechatQr(null)
  }, [visible])

  useEffect(() => {
    setWechatQr(null)
  }, [amount, effectiveChannel])

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

        const qrCodeURL = data.payment.qr_code_url
        if (qrCodeURL) {
          paymentWindow?.close()
          setWechatQr({ orderNo: data.order_no, url: qrCodeURL })
          appToast.success(t('billing.rechargeModal.wechatQrReady'))
          return
        }

        const redirectURL = data.payment.redirect_url
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

  const copyWechatPayURL = () => {
    if (!wechatQr?.url || !navigator.clipboard) return
    navigator.clipboard
      .writeText(wechatQr.url)
      .then(() => appToast.success(t('billing.rechargeModal.wechatQrCopied')))
      .catch(() => appToast.error(t('billing.rechargeModal.error')))
  }

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
                  onClick={() => setChannel(c.value as 'alipay' | 'wechat' | 'stripe')}
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
            onClick={handleSubmit}
            className="w-full h-11 text-xs rounded-xl"
          >
            {recharge.isPending ? t('billing.rechargeModal.submitting') : t('billing.rechargeModal.submit', { amount })}
          </Button>

          {wechatQr && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center space-y-3">
              <div className="space-y-1">
                <div className="text-xs font-bold text-mg-text-0">
                  {t('billing.rechargeModal.wechatQrTitle')}
                </div>
                <div className="text-[11px] text-mg-text-2">
                  {t('billing.rechargeModal.wechatQrHint')}
                </div>
              </div>
              <div className="mx-auto w-[192px] rounded-xl border border-mg-border bg-white p-3 shadow-sm">
                <QRCodeSVG value={wechatQr.url} size={168} level="M" includeMargin={false} />
              </div>
              <div className="text-[10px] text-mg-text-3 font-mono truncate" title={wechatQr.orderNo}>
                {wechatQr.orderNo}
              </div>
              <button
                type="button"
                onClick={copyWechatPayURL}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-mg-border bg-mg-fill-0 px-3 py-2 text-[11px] font-bold text-mg-text-1 hover:bg-mg-fill-0/80 hover:text-mg-text-0 transition-colors"
              >
                <LuCopy size={13} />
                {t('billing.rechargeModal.wechatQrCopy')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
