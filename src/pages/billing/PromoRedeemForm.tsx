import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { redeemPromoCode } from '@/services/billing'
import { Button } from '@/components/ui/Button'
import { appToast } from '@/lib/app-toast'

// ─── Sub-components: PromoRedeemForm ──────────────────────────────────────

export function PromoRedeemForm({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')

  const redeem = useMutation({
    mutationFn: (promoCode: string) => redeemPromoCode(tenantId, { code: promoCode }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['balance', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['balance', 'breakdown', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-top-balance', tenantId] })
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
