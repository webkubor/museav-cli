import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { getSession, switchTenant } from '@/services/auth'
import { OrgListSection } from './components/OrgListSection'
import { OrgManagePanel } from './components/OrgManagePanel'
import { PageHeader } from '@/components/ui/PageHeader'
import { appToast } from '@/lib/app-toast'

export default function OrganizationSettingsPage() {
  const { activeTenantId, tenants, setActiveWorkspaceId, setAuth } = useAuthStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const firstEnterpriseId = tenants.find((t) => t.type !== 'personal')?.tenant_id ?? null
  const initialId = tenants.find((t) => t.tenant_id === activeTenantId)?.type !== 'personal'
    ? (activeTenantId ?? null)
    : firstEnterpriseId
  const [managingId, setManagingId] = useState<string | null>(initialId)

  async function handleDissolved(dissolvedTenantId: string) {
    setManagingId(null)
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
      <PageHeader title="企业管理" />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 左侧窄栏 */}
        <div className="lg:col-span-4 space-y-4">
          <OrgListSection selectedId={managingId} onSelect={setManagingId} />
        </div>

        {/* 右侧宽栏 */}
        <div className="lg:col-span-8">
          <OrgManagePanel key={managingId ?? 'empty'} tenantId={managingId} onDissolved={handleDissolved} />
        </div>
      </div>
    </div>
  )
}
