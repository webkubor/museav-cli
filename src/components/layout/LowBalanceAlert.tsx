import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { LuTriangleAlert, LuArrowRight } from 'react-icons/lu'
import { useAuthStore } from '@/store/auth'
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
  const navigate = useNavigate()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const { symbol: currencySymbol } = useCurrency()
  const { data: balance } = useBalance(activeTenantId)

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
      <button type="button" className="low-balance-alert-action" onClick={() => navigate('/billing')}>
        {t('dashboardTop.status.rechargeAction')}
        <LuArrowRight size={14} />
      </button>
    </div>
  )
}
