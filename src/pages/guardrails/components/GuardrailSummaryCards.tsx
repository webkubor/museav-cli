/**
 * 安全护栏顶部摘要卡（PRD v1.0.3 · 全局 / 个人 / Key / 提额 / 继承全局默认）
 * 数据真源：由列表 summarize() 客户端派生（后端无 /summary 端点）。
 * 个人卡在个人组织（tenant.type=personal）下隐藏，与 PRD 一致。
 * 「继承全局默认」计数口径见 derive.ts summarize() 注释（前端近似，对象级精确口径待后端）。
 */
import { LuShieldCheck, LuUserRound, LuKeyRound, LuGauge, LuLayers } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
import { KpiCard } from '@/components/ui/KpiCard'
import type { GuardrailSummary } from '../derive'

interface Props {
  summary: GuardrailSummary
  showMember: boolean
  loading?: boolean
}

export function GuardrailSummaryCards({ summary, showMember, loading }: Props) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-4">
      <KpiCard
        iconLead
        title={t('guardrails.summary.global')}
        value={String(summary.global)}
        icon={<LuShieldCheck size={18} />}
        color="var(--brand-base)"
        glowColor="var(--brand-glow)"
        loading={loading}
      />
      {showMember && (
        <KpiCard
          iconLead
          title={t('guardrails.summary.member')}
          value={String(summary.member)}
          icon={<LuUserRound size={18} />}
          color="var(--mg-success)"
          glowColor="color-mix(in srgb, var(--mg-success) 14%, transparent)"
          hoverBorderClass="hover:border-mg-success/30"
          loading={loading}
        />
      )}
      <KpiCard
        iconLead
        title={t('guardrails.summary.key')}
        value={String(summary.key)}
        icon={<LuKeyRound size={18} />}
        color="var(--mg-primary)"
        glowColor="color-mix(in srgb, var(--mg-primary) 14%, transparent)"
        loading={loading}
      />
      <KpiCard
        iconLead
        title={t('guardrails.summary.boost')}
        value={String(summary.boost)}
        icon={<LuGauge size={18} />}
        color="var(--mg-warning)"
        glowColor="color-mix(in srgb, var(--mg-warning) 14%, transparent)"
        hoverBorderClass="hover:border-mg-warning/30"
        loading={loading}
      />
      <KpiCard
        iconLead
        title={t('guardrails.summary.inheritedDefault')}
        value={String(summary.inheritedDefault)}
        icon={<LuLayers size={18} />}
        color="var(--mg-text-2)"
        glowColor="color-mix(in srgb, var(--mg-text-2) 12%, transparent)"
        hoverBorderClass="hover:border-mg-text-2/30"
        loading={loading}
      />
    </div>
  )
}
