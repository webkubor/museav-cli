/**
 * API Keys 顶部 5 摘要卡（PRD v1.0.3 §API Keys）
 * 数据真源：优先后端 /summary（#383），未交付时由列表 deriveSummary 客户端派生兜底。
 *
 * 唯一例外是「本月消费」——PRD（modelgo_prd/src/App.tsx:13890）写死
 * `workspaceSpend = 当前空间全部 Key 的消费合计`，不分角色。后端 /summary 的
 * month_spend 走的是 #570 的 scope 分流（member=self、admin/owner=workspace），
 * 而 #570 是一张 QA 的 BUG 单、不是 PRD，口径已于 2026-09-17 被 owner 打回。
 * 所以这张卡只认列表派生，不接后端那个值；要改口径先改 PRD（prd46#1056）。
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
  // 本月消费恒为空间合计（见文件头）：后端 summary 的 month_spend 口径与 PRD 不一致，不采信
  const monthSpend = useMemo(() => deriveSummary(items).month_spend, [items])
  const spend = `${monthSpend.currency} ${formatMoney(monthSpend.amount, '')}`

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
        rawNumber={monthSpend.amount}
        formatter={(n) => `${monthSpend.currency} ${formatMoney(n, '')}`}
        icon={<LuReceiptText size={18} />}
        color="var(--brand-base)"
        glowColor="var(--brand-glow)"
        loading={loading}
      />
    </div>
  )
}
