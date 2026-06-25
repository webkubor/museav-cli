import { useTranslation } from 'react-i18next'
import { LuTriangleAlert, LuArrowRight } from 'react-icons/lu'
import { useAuthStore } from '@/store/auth'
import { useRechargeStore } from '@/store/use-recharge-store'
import { useBalance } from '@/hooks/use-balance'
import { useCurrency } from '@/hooks/use-platform-config'
import { formatFriendlyAmount } from '@/lib/utils'
import './low-balance-alert.css'

function parseAmount(amount?: string) {
  if (!amount) return null
  const value = Number.parseFloat(amount)
  return Number.isFinite(value) ? value : null
}

/**
 * 全局余额预警条：仅当可用余额 ≤ 低余额阈值时出现，挂在控制台顶部跨所有页面。
 * 余额正常或未知时不渲染——不常驻、不占位。
 */
export function LowBalanceAlert() {
  const { t } = useTranslation()
  const openRecharge = useRechargeStore((s) => s.open)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const { symbol: currencySymbol } = useCurrency()
  // 预警条用：余额健康时每 60s 轮询一次，及时捕捉「余额被消费烧穿阈值」（消费不经控制台，无事件可挂，只能轮询）；
  // 一旦进入低余额态即停轮，恢复正常靠充值后的 invalidate 刷新。
  const { data: balance } = useBalance(activeTenantId, { pollWhileHealthyMs: 60_000 })

  const availableAmount = parseAmount(balance?.available.amount)
  const thresholdAmount = parseAmount(balance?.low_balance_threshold.amount)
  const isLowBalance =
    availableAmount !== null && thresholdAmount !== null && availableAmount <= thresholdAmount

  if (!isLowBalance) return null

  const balanceText = formatFriendlyAmount(availableAmount, currencySymbol)

  return (
    <div className="low-balance-alert" role="alert">
      <span className="low-balance-alert-mark" aria-hidden>
        <LuTriangleAlert size={16} />
      </span>
      <div className="low-balance-alert-copy">
        <strong>{t('dashboardTop.status.lowTitle')}</strong>
        <span>{t('dashboardTop.status.lowDesc', { amount: balanceText })}</span>
      </div>
      <button type="button" className="low-balance-alert-action" onClick={openRecharge}>
        {t('dashboardTop.status.rechargeAction')}
        <LuArrowRight size={14} />
      </button>
    </div>
  )
}
