// ─── Format Balance Helper ────────────────────────────────────────────────

import { formatMoney } from '@/lib/utils'

export function formatBalance(amountStr: string | undefined): { main: string; exact: string } {
  if (!amountStr) return { main: '—', exact: '—' }
  // 与全站同口径（4 位小数 + 千分位 + 极小值「< 0.0001」）；symbol 由 BalanceCard 单独渲染。
  const s = formatMoney(amountStr, '')
  return { main: s, exact: s }
}

/** PRD：可消费合计 = 可用主余额 + 赠送余额 + 奖励余额。 */
export function calculateSpendableBalance(
  availableMain: string | undefined,
  gift: string | undefined,
  reward: string | undefined,
): number | undefined {
  const amounts = [availableMain, gift, reward].map((amount) => Number(amount))
  if (amounts.some((amount) => !Number.isFinite(amount))) return undefined
  return amounts.reduce((total, amount) => total + amount, 0)
}
