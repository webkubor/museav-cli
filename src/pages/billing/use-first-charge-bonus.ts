import { useQuery } from '@tanstack/react-query'
import { quoteRecharges } from '@/services/billing'
import { useCurrency } from '@/hooks/use-platform-config'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { formatMoney } from '@/lib/utils'
import { RECHARGE_PRESETS, hasBonus } from './recharge-quote'

/**
 * 导航「账单管理」旁的首充赠金角标（prd46#1380）。
 *
 * 金额只读服务端报价的 bonus_amount：档位里命中梯度（有资格 + 活动生效 + 赠金 > 0）的最大值。
 * 首充完成后服务端返回 eligible=false，本 hook 返回 undefined，角标随之消失；接口未上线 / 报错同样不显示。
 *
 * queryKey 与 TopUpModal 的预设报价一致，打开弹框时直接命中缓存，不会多一次报价请求。
 */
export function useFirstChargeBonus(tenantId: string | null | undefined): string | undefined {
  const { currency } = useCurrency()
  const { hasPermission } = usePermissions()
  const canRecharge = hasPermission(PERMS.BILLING_RECHARGE_CREATE)

  const { data } = useQuery({
    queryKey: ['recharge-quotes', tenantId, currency, RECHARGE_PRESETS.join(',')],
    queryFn: () => quoteRecharges(tenantId as string, { currency, amounts: RECHARGE_PRESETS }),
    enabled: !!tenantId && canRecharge,
    retry: false,
    // 支付回跳/切回控制台时重新询价，以服务端 eligible=false 收起角标。
    staleTime: 0,
    refetchOnWindowFocus: 'always',
  })

  const maxBonus = currency === 'USD' ? (data?.items ?? [])
    .filter((q) => q.currency === 'USD' && hasBonus(q))
    .reduce((max, q) => Math.max(max, Number(q.bonus_amount)), 0) : 0

  // 仅真实 USD 报价可用于美元活动角标。CNY 报价不允许仅替换符号伪装成美元。
  return maxBonus > 0 ? formatMoney(maxBonus, '$') : undefined
}
