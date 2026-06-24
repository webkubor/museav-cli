import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { listTenants } from '@/services/tenants'
import { RoleBadge } from './RoleBadge'
import { OrgInfoTab } from './OrgInfoTab'
import { MembersTab } from './MembersTab'
import { InviteTab } from './InviteTab'

export function OrgManagePanel({
  tenantId,
  onDissolved,
}: {
  tenantId: string | null
  onDissolved?: (dissolvedTenantId: string) => void | Promise<void>
}) {
  const tenantsQuery = useQuery({ queryKey: ['tenants'], queryFn: listTenants, staleTime: 30_000 })
  // Hooks 必须无条件调用（rules-of-hooks）：原先位于 early-return 之后，
  // tenantId 在空/非空之间切换会改变 Hook 调用顺序——真实潜在崩溃点。
  const sessionTenants = useAuthStore((s) => s.tenants)
  const [activeSubTab, setActiveSubTab] = useState<'info' | 'members' | 'invite'>('members')
  const { hasPermission } = usePermissions()

  if (!tenantId) {
    return (
      <div className="bg-mg-bg-0 border border-mg-border/50 border-dashed rounded-lg p-12 text-center flex flex-col items-center justify-center min-h-[360px] space-y-4">
        <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-brand-base/5 to-brand-base/10 border border-brand-base/10 flex items-center justify-center shadow-inner relative overflow-hidden">
          <div className="w-6 h-6 rounded-lg border border-brand-base/20 flex items-center justify-center">
            <span className="text-brand-base font-bold text-xs">M</span>
          </div>
          <div className="absolute inset-0 bg-radial-gradient from-brand-base/10 to-transparent animate-pulse" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-mg-text-0">暂无选中的管理组织</h3>
          <p className="text-xs text-mg-text-2 max-w-xs mx-auto leading-relaxed">
            请在左侧“我的组织”列表中选择需要管理的组织，查看并更新其基本信息、成员列表或邀请其他成员加入。
          </p>
        </div>
      </div>
    )
  }

  const tenant = tenantsQuery.data?.items.find((t) => t.tenant_id === tenantId)
  const isRoleAdmin = tenant?.role === 'tenant_owner' || tenant?.role === 'tenant_admin'
  const canManageMembers = isRoleAdmin && hasPermission(PERMS.ORG_MEMBERS_MANAGE)
  const canManageInvite  = isRoleAdmin && hasPermission(PERMS.ORG_INVITE_MANAGE)
  const canManage = canManageMembers
  const tenantName = tenant?.name
    || sessionTenants.find((t) => t.tenant_id === tenantId)?.name
    || '…'

  return (
    <div className="space-y-6">
      {/* 正在管理展示 */}
      <div className="flex items-center justify-between p-4 bg-mg-bg-0 border border-mg-border/50 rounded-lg shadow-xs">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold text-mg-text-2 uppercase tracking-wider">正在管理</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-mg-text-0">
              {tenantName}
            </span>
            {tenant && <RoleBadge role={tenant.role} />}
          </div>
        </div>
      </div>

      {/* Tab 导航 */}
      <div className="border-b border-mg-border/60 flex gap-6 text-sm bg-transparent">
        <button
          onClick={() => setActiveSubTab('info')}
          className={`pb-3 font-bold transition-all border-b-2 cursor-pointer bg-transparent border-none text-xs ${
            activeSubTab === 'info'
              ? 'border-brand-base text-brand-base'
              : 'border-transparent text-mg-text-2 hover:text-mg-text-0'
          }`}
        >
          基本信息
        </button>
        <button
          onClick={() => setActiveSubTab('members')}
          className={`pb-3 font-bold transition-all border-b-2 cursor-pointer bg-transparent border-none text-xs ${
            activeSubTab === 'members'
              ? 'border-brand-base text-brand-base'
              : 'border-transparent text-mg-text-2 hover:text-mg-text-0'
          }`}
        >
          组织成员
        </button>
        {canManageInvite && (
          <button
            onClick={() => setActiveSubTab('invite')}
            className={`pb-3 font-bold transition-all border-b-2 cursor-pointer bg-transparent border-none text-xs ${
              activeSubTab === 'invite'
                ? 'border-brand-base text-brand-base'
                : 'border-transparent text-mg-text-2 hover:text-mg-text-0'
            }`}
          >
            邀请成员
          </button>
        )}
      </div>

      <div className="pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
        {activeSubTab === 'info' && (
          <OrgInfoTab
            tenantId={tenantId}
            tenantRole={tenant?.role}
            onDissolved={() => onDissolved?.(tenantId)}
          />
        )}
        {activeSubTab === 'members' && <MembersTab tenantId={tenantId} canManage={canManage} />}
        {canManageInvite && activeSubTab === 'invite' && <InviteTab tenantId={tenantId} />}
      </div>
    </div>
  )
}
