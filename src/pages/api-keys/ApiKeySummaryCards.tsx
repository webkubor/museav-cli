/**
 * API Keys 顶部 5 摘要卡（PRD v1.0.3 §API Keys）
 * 数据真源：优先后端 /summary（#383），未交付时由列表 deriveSummary 客户端派生兜底。
 * 「本月消费」直接用 /summary 的 month_spend（需求方#1056）：后端已按 #570 的
 * scope 口径返回（member=self、admin/owner/空间负责人=workspace），前端不再
 * 用当前用户口径覆盖——那层覆盖会让 admin 只看到自己 key 的消费（常为 0）。
 */
import { useMemo } from 'react'
import { LuKeyRound, LuCircleCheck, LuClock, LuGauge, LuReceiptText } from 'react-icons/lu'
import { KpiCard } from '@/components/ui/KpiCard'
import { formatMoney } from '@/lib/utils'
import type { ApiKeyItem, ApiKeySummary } from '@/types'
import { deriveSummary } from './derive'
import { useTranslation } from 'react-i18next'

interface Props {
  items: ApiKeyItem[]
  /** 后端 /summary 返回（有则覆盖派生值） */
  summary?: ApiKeySummary
  loading?: boolean
}

export function ApiKeySummaryCards({ items, summary, loading }: Props) {
  const { t } = useTranslation()
  const s = useMemo(() => summary ?? deriveSummary(items), [summary, items])
  const spend = `${s.month_spend.currency} ${formatMoney(s.month_spend.amount, '')}`

  return (
    <div className="flex flex-wrap gap-4">
      <KpiCard
        iconLead
        title={t('apiKeys.summary.total')}
        value={String(s.total)}
        rawNumber={s.total}
        icon={<LuKeyRound size={18} />}
        color="var(--brand-base)"
        glowColor="var(--brand-glow)"
        loading={loading}
      />
      <KpiCard
        iconLead
        title={t('apiKeys.summary.active')}
        value={String(s.active)}
        rawNumber={s.active}
        icon={<LuCircleCheck size={18} />}
        color="var(--mg-success)"
        glowColor="color-mix(in srgb, var(--mg-success) 14%, transparent)"
        hoverBorderClass="hover:border-mg-success/30"
        loading={loading}
      />
      <KpiCard
        iconLead
        title={t('apiKeys.summary.expiringSoon')}
        value={String(s.expiring_soon)}
        rawNumber={s.expiring_soon}
        icon={<LuClock size={18} />}
        color="var(--mg-warning)"
        glowColor="color-mix(in srgb, var(--mg-warning) 14%, transparent)"
        hoverBorderClass="hover:border-mg-warning/30"
        loading={loading}
      />
      <KpiCard
        iconLead
        title={t('apiKeys.summary.limitReached')}
        value={String(s.limit_reached)}
        rawNumber={s.limit_reached}
        icon={<LuGauge size={18} />}
        color="var(--mg-warning)"
        glowColor="color-mix(in srgb, var(--mg-warning) 14%, transparent)"
        hoverBorderClass="hover:border-mg-warning/30"
        loading={loading}
      />
      <KpiCard
        iconLead
        title={t('apiKeys.summary.monthSpend')}
        value={spend}
        rawNumber={s.month_spend.amount}
        formatter={(n) => `${s.month_spend.currency} ${formatMoney(n, '')}`}
        icon={<LuReceiptText size={18} />}
        color="var(--brand-base)"
        glowColor="var(--brand-glow)"
        loading={loading}
      />
    </div>
  )
}
