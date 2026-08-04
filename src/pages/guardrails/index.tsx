/**
 * 工作空间安全护栏管理页。
 * 路由：/workspace/:workspaceId/guardrails
 * API：/workspaces/:workspaceId/guardrails、/members、/api-keys
 * 数据层见 use-guardrails-page.tsx，纯工具见 guardrail-utils.ts。
 */
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { WorkspaceTitleTag } from '@/components/layout/WorkspaceTitleTag'
import { ForbiddenState } from '@/components/ui/ForbiddenState'
import { LuPlus } from 'react-icons/lu'
import { GuardrailSections } from './components/GuardrailTable'
import { GuardrailSummaryCards } from './components/GuardrailSummaryCards'
import { GuardrailDetailSheet } from './components/GuardrailDetailSheet'
import { GuardrailConfirmModals } from './components/GuardrailConfirmModals'
import { useGuardrailsPage } from './use-guardrails-page'

export default function GuardrailsPage() {
  const { t } = useTranslation()
  const page = useGuardrailsPage()

  if (page.forbidden) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('guardrails.title')} />
        <ForbiddenState resource={t('guardrails.title')} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 需求方#125：标题旁加当前工作空间 Tag */}
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2.5">
            {t('guardrails.title')}
            <WorkspaceTitleTag workspaceId={page.workspaceId} />
          </span>
        }
        actions={page.canCreate && (
          <Button
            variant="brand"
            data-track="guardrails:create"
            onClick={() => page.openCreate()}
            className="rounded-full px-5 h-10 shadow-lg shadow-brand-glow/20"
          >
            <LuPlus className="w-4 h-4 mr-1.5" />
            {t('guardrails.create')}
          </Button>
        )}
      />

      {/* 摘要卡：全局 / 个人 / Key / 提额（由列表派生） */}
      <GuardrailSummaryCards summary={page.summary} showMember={page.showMember} loading={page.isLoading} />

      {/* 三分区列表：全局 / 个人 / Key */}
      <GuardrailSections {...page.sections} />

      {/* 统一配置抽屉（新建 + 编辑 + 详情） */}
      <GuardrailDetailSheet {...page.sheet} />

      {/* 删除确认 Modal */}
      <GuardrailConfirmModals {...page.confirmModals} />
    </div>
  )
}
