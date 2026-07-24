/**
 * 安全护栏顶部摘要卡（PRD v1.0.3 · 全局 / 个人 / Key / 提额）——对齐原型：顶部仅此 4 卡。
 * 数据真源：由列表 summarize() 客户端派生（后端无 /summary 端点）。
 * 个人卡在个人组织（tenant.type=personal）下隐藏，与 PRD 一致。
 * 注：飞书《产品模型设计》143/150 要求「多少成员/Key 继承全局默认」计数，属分区 Summary（非顶部卡），
 * 且准确算需后端「成员/Key 总数+覆盖关系」→ 落单 #460，字段到位后在个人/Key 护栏区渲染，不前端近似兜底。
 */
import { LuShieldCheck, LuUserRound, LuKeyRound, LuGauge } from 'react-icons/lu'
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
        rawNumber={summary.global}
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
          rawNumber={summary.member}
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
        rawNumber={summary.key}
        icon={<LuKeyRound size={18} />}
        color="var(--mg-primary)"
        glowColor="color-mix(in srgb, var(--mg-primary) 14%, transparent)"
        loading={loading}
      />
      <KpiCard
        iconLead
        title={t('guardrails.summary.boost')}
        value={String(summary.boost)}
        rawNumber={summary.boost}
        icon={<LuGauge size={18} />}
        color="var(--mg-warning)"
        glowColor="color-mix(in srgb, var(--mg-warning) 14%, transparent)"
        hoverBorderClass="hover:border-mg-warning/30"
        loading={loading}
      />
    </div>
  )
}
