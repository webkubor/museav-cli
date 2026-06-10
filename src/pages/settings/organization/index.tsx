import { useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { MAX_TENANTS } from './constants'
import { OrgListSection } from './components/OrgListSection'
import { OrgManagePanel } from './components/OrgManagePanel'
import { PageHeader } from '@/components/ui/PageHeader'

export default function OrganizationSettingsPage() {
  const { activeTenantId, tenants } = useAuthStore()
  const firstEnterpriseId = tenants.find((t) => t.type !== 'personal')?.tenant_id ?? null
  const initialId = tenants.find((t) => t.tenant_id === activeTenantId)?.type !== 'personal'
    ? (activeTenantId ?? null)
    : firstEnterpriseId
  const [managingId, setManagingId] = useState<string | null>(initialId)

  return (
    <div className="space-y-6">
      <PageHeader
        title="企业管理"
        description={`一个账号最多创建 ${MAX_TENANTS} 个企业。在左侧选择需要管理的企业，可在右侧进行信息维护、成员管理与成员邀请。`}
        className="mb-0"
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 左侧窄栏 */}
        <div className="lg:col-span-4 space-y-4">
          <OrgListSection selectedId={managingId} onSelect={setManagingId} />
        </div>

        {/* 右侧宽栏 */}
        <div className="lg:col-span-8">
          <OrgManagePanel key={managingId ?? 'empty'} tenantId={managingId} />
        </div>
      </div>
    </div>
  )
}
