import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { createRecharge } from '@/services/billing'
import { useCurrency, useEnabledChannels } from '@/hooks/use-platform-config'
import { Button } from '@/components/ui/Button'
import { appToast } from '@/lib/app-toast'
import { cn } from '@/lib/utils'

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

export function TopUpModal({ visible, onClose, tenantId }: TopUpModalProps) {
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
