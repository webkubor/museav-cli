import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import './billing.css'
import { useTranslation } from 'react-i18next'
import { redeemPromoCode } from '@/services/billing'
import { useCurrency, useSite } from '@/hooks/use-platform-config'
import { useAuthStore } from '@/store/auth'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { appToast } from '@/lib/app-toast'
import { getPromoRedeemErrorMessage } from './promo-errors'
import { BalanceCard } from './BalanceCard'
import type { BalanceTab } from './BalanceCard'
import { BillingOrdersPanel } from './BillingOrdersPanel'

export { PromoRedeemForm } from './PromoRedeemForm'
export { OrderReceiptDrawer } from './OrderReceiptDrawer'

export default function BillingPage() {
  const { t } = useTranslation()
  const tenantId = useAuthStore((s) => s.activeTenantId) ?? ''
  const { symbol: currencySymbol } = useCurrency()
  const site = useSite()
  const qc = useQueryClient()

  const [activeTab, setActiveTab] = useState<BalanceTab>('main')
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
      appToast.error(getPromoRedeemErrorMessage(err, t))
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
      <PageHeader title={t('billing.title')} description={t('billing.desc')} />

      <BalanceCard
        tenantId={tenantId}
        currencySymbol={currencySymbol}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* 兑换码充值卡 */}
      <div className="rounded-2xl border border-mg-border bg-card-bg p-5 shadow-sm">
        <form onSubmit={handlePromoSubmit} className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-base/15 to-brand-base/5 border border-brand-base/20 flex items-center justify-center shrink-0 shadow-sm">
              <span className="text-[20px] leading-none" role="img" aria-label="gift">🎁</span>
            </div>
            <div>
              <div className="text-sm font-bold text-mg-text-0">{t('billing.promo.title')}</div>
              <div className="text-[11px] text-mg-text-2 mt-0.5">{t('billing.promo.subtitle', { defaultValue: '线下收款 / 促销码自助到账' })}</div>
            </div>
          </div>
          <input
            type="text"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value)}
            placeholder={t('billing.promo.placeholder')}
            disabled={redeemMutation.isPending}
            className="flex-1 min-w-[180px] h-9 px-3 rounded-xl border border-mg-border bg-mg-fill-0/30 hover:bg-mg-fill-0 focus:bg-mg-fill-0 text-xs focus:outline-none focus:ring-1 focus:ring-brand-glow focus:border-brand-base transition-all font-medium text-mg-text-0"
          />
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

      <BillingOrdersPanel
        tenantId={tenantId}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        site={site ?? ''}
      />
    </div>
  )
}
