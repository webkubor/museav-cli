/**
 * 安全护栏顶部摘要卡（PRD v1.0.3 · 全局 / 个人 / Key / 提额）
 * 数据真源：由列表 summarize() 客户端派生（后端无 /summary 端点）。
 * 个人卡在个人组织（tenant.type=personal）下隐藏，与 PRD 一致。
 */
import { LuShieldCheck, LuUserRound, LuKeyRound, LuGauge } from 'react-icons/lu'
import { KpiCard } from '@/components/ui/KpiCard'
import type { GuardrailSummary } from '../derive'

interface Props {
  summary: GuardrailSummary
  showMember: boolean
  loading?: boolean
}

export function GuardrailSummaryCards({ summary, showMember, loading }: Props) {
  return (
    <div className="flex flex-wrap gap-4">
      <KpiCard
        iconLead
        title="全局护栏"
        value={String(summary.global)}
        icon={<LuShieldCheck size={18} />}
        color="var(--brand-base)"
        glowColor="var(--brand-glow)"
        loading={loading}
      />
      {showMember && (
        <KpiCard
          iconLead
          title="个人护栏"
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
        title="Key 护栏"
        value={String(summary.key)}
        icon={<LuKeyRound size={18} />}
        color="var(--mg-primary)"
        glowColor="color-mix(in srgb, var(--mg-primary) 14%, transparent)"
        loading={loading}
      />
      <KpiCard
        iconLead
        title="提额护栏"
        value={String(summary.boost)}
        icon={<LuGauge size={18} />}
        color="var(--mg-warning)"
        glowColor="color-mix(in srgb, var(--mg-warning) 14%, transparent)"
        hoverBorderClass="hover:border-mg-warning/30"
        loading={loading}
      />
    </div>
  )
}
