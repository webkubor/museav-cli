import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { getSession, switchTenant } from '@/services/auth'
import { OrgManagePanel } from './components/OrgManagePanel'
import { PageHeader } from '@/components/ui/PageHeader'
import { appToast } from '@/lib/app-toast'
import { useTranslation } from 'react-i18next'

/**
 * 企业管理（PRD《导航与总览》真源为单企业页）：直接管理「当前企业」——
 * 摘要条 + 成员/企业信息/操作审计/成员邀请 四个页签，不做组织列表 master-detail。
 * 创建 / 切换组织在顶栏租户切换器完成（DashboardHeader）。
 */
export default function OrganizationSettingsPage() {
  const { activeTenantId, tenants, setActiveWorkspaceId, setAuth } = useAuthStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  // 当前企业：活跃租户是企业则用它；否则退回账号下第一个企业租户
  const firstEnterpriseId = tenants.find((tt) => tt.type !== 'personal')?.tenant_id ?? null
  const activeIsEnterprise = tenants.find((tt) => tt.tenant_id === activeTenantId)?.type !== 'personal'
  const manageTenantId = activeIsEnterprise ? (activeTenantId ?? firstEnterpriseId) : firstEnterpriseId

  async function handleDissolved(dissolvedTenantId: string) {
    queryClient.removeQueries({ queryKey: ['tenant', dissolvedTenantId] })
    queryClient.removeQueries({ queryKey: ['tenant-members', dissolvedTenantId] })
    queryClient.removeQueries({ queryKey: ['workspaces', dissolvedTenantId] })

    const store = useAuthStore.getState()
    const remainingTenants = store.tenants.filter((item) => item.tenant_id !== dissolvedTenantId)
    const personalTenant = remainingTenants.find((item) => item.type === 'personal')
      ?? remainingTenants.find((item) => item.is_default)

    if (personalTenant && store.account) {
      setActiveWorkspaceId('')
      try {
        await switchTenant({ tenant_id: personalTenant.tenant_id })
      } catch (err) {
        console.warn('[tenants] 解散组织后切回个人租户失败，继续用本地会话兜底', err)
      }
      setAuth(store.account, personalTenant.tenant_id, remainingTenants)
    }

    try {
      const session = await getSession()
      setAuth(
        session.account,
        session.active_tenant_id,
        session.tenants,
        session.active_workspace_id,
        session.permissions?.granted ?? null,
        session.permissions?.menus ?? [],
      )
    } catch (err) {
      console.warn('[tenants] 解散组织后会话重拉失败，保留本地个人租户兜底', err)
    }

    queryClient.removeQueries({ queryKey: ['api-keys'] })
    queryClient.removeQueries({ queryKey: ['guardrails'] })
    queryClient.removeQueries({ queryKey: ['observability'] })
    queryClient.removeQueries({ queryKey: ['billing'] })
    queryClient.removeQueries({ queryKey: ['referral'] })
    queryClient.removeQueries({ queryKey: ['usage'] })
    queryClient.removeQueries({ queryKey: ['logs'] })
    await queryClient.invalidateQueries({ queryKey: ['tenants'] })
    appToast.info('已切换到个人账户')
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('enterprise.title')} description={t('enterprise.subtitle')} />
      <OrgManagePanel key={manageTenantId ?? 'empty'} tenantId={manageTenantId} onDissolved={handleDissolved} />
    </div>
  )
}
