/**
 * API Keys 顶部 4 摘要卡（需求方#1056：「本月消费」卡已移除）（PRD v1.0.3 §API Keys）
 * 数据真源：优先后端 /summary（#383），未交付时由列表 deriveSummary 客户端派生兜底。
 */
import { useMemo } from 'react'
import { LuKeyRound, LuCircleCheck, LuClock, LuGauge } from 'react-icons/lu'
import { KpiCard } from '@/components/ui/KpiCard'
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
    </div>
  )
}
