import { cn, formatMoney } from '@/lib/utils'
import { currencySymbol, isZhLang } from '@/features/models/model-format'

/**
 * 金额统一显示组件 —— 金额样式的唯一真源（对齐 DESIGN.md「数字/金额 → JetBrains Mono + tabular-nums」）。
 *
 * 规范（在此定死，调用方只选 size / tone，不自定义色/字重/字体）：
 * - 字体：JetBrains Mono（font-mono）+ tabular-nums（等宽对齐）
 * - 数字：font-bold；颜色由 tone 决定（默认主文字 text-0）
 * - 符号：0.82em 小一号 + font-semibold；颜色随数字 tone（默认主文字 text-1，即黑色，需求方#180）
 * - 无值：显示「—」（text-3，不带符号）
 *
 * size: sm(默认,列表/行内) | md(卡片次要) | lg(KPI/余额大数)
 * tone: default(text-0) | muted(text-1) | brand(品牌色) | danger(扣费/负向)
 */
const SIZE = { sm: 'mg-text-body', md: 'mg-text-value', lg: 'mg-text-display-sm' } as const
const TONE = {
  default: 'text-mg-text-1',
  muted: 'text-mg-text-2',
  brand: 'text-brand-base',
  danger: 'text-mg-danger',
} as const

export function Money({
  amount,
  currency,
  symbol,
  size = 'sm',
  tone = 'default',
  className,
}: {
  amount: number | string | null | undefined
  currency?: string
  symbol?: string
  decimals?: number
  size?: keyof typeof SIZE
  tone?: keyof typeof TONE
  className?: string
}) {
  if (amount == null || amount === '') {
    return <span className={cn('font-mono tabular-nums text-mg-text-4', SIZE[size], className)}>—</span>
  }
  // 符号映射统一走 currencySymbol（#372），不在组件里再写一份三元
  const sym = symbol ?? currencySymbol(currency, isZhLang())
  const text = formatMoney(amount, '')
  return (
    <span className={cn('font-mono tabular-nums whitespace-nowrap font-bold', SIZE[size], TONE[tone], className)}>
      <span className="text-[0.82em] font-semibold mr-[0.12em]">{sym}</span>
      {text}
    </span>
  )
}
