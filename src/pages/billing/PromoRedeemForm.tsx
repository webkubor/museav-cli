import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { redeemPromoCode } from '@/services/billing'
import { Button } from '@/components/ui/Button'
import { appToast } from '@/lib/app-toast'
import { trackEvent } from '@/lib/track'
import { getPromoRedeemErrorMessage } from './promo-errors'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'

// ─── Sub-components: PromoRedeemForm ──────────────────────────────────────
// 弹窗内的兑换优惠码表单：垂直布局，含 BILLING_PROMO_REDEEM 权限门控。
// 兑换成功后回调 onSuccess（用于关闭弹窗）。

export function PromoRedeemForm({ tenantId, onSuccess }: { tenantId: string; onSuccess?: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { hasPermission } = usePermissions()
  const canRedeem = hasPermission(PERMS.BILLING_PROMO_REDEEM)
  const [code, setCode] = useState('')

  const redeem = useMutation({
    mutationFn: (promoCode: string) => redeemPromoCode(tenantId, { code: promoCode }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['balance', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['balance', 'breakdown', tenantId] })
      appToast.success(t('billing.promo.success', { amount: data.credited.amount, currency: data.credited.currency }))
      // §11.2 billing_redeem_result：reward_type 后端未区分兑换码类型（credits.PromoRedeemResponse
      // 无对应字段），本表单只服务优惠码兑换单一渠道，固定为 promo_code，非臆造分类
      trackEvent('billing_redeem_result', { result: 'success', reward_type: 'promo_code' })
      setCode('')
      onSuccess?.()
    },
    onError: (err: Error) => {
      appToast.error(getPromoRedeemErrorMessage(err, t))
      trackEvent('billing_redeem_result', { result: 'fail', failure_reason: err.message || 'unknown', reward_type: 'promo_code' })
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

  if (!canRedeem) return null

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={t('billing.promo.placeholder')}
        disabled={redeem.isPending}
        autoFocus
        className="w-full h-11 px-3.5 rounded-md border border-mg-border bg-mg-fill-0/30 hover:bg-mg-fill-0 focus:bg-mg-fill-0 text-sm focus:outline-none focus:ring-1 focus:ring-brand-glow focus:border-brand-base transition-all font-medium text-mg-text-1"
      />
      <Button
        type="submit"
        variant="brand"
        disabled={redeem.isPending || !code.trim()}
        className="w-full h-11 text-sm font-bold rounded-md"
      >
        {redeem.isPending ? t('billing.rechargeModal.submitting') : t('billing.promo.submit')}
      </Button>
    </form>
  )
}
