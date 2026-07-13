import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { trackEvent } from '@/lib/track'
import { getTenant, listTenantMembers, listTenants } from '@/services/tenants'
import { RoleBadge } from './RoleBadge'
import { OrgInfoTab } from './OrgInfoTab'
import { MembersTab } from './MembersTab'
import { InviteTab } from './InviteTab'
import { AuditTab } from './AuditTab'

type SubTab = 'members' | 'info' | 'audit' | 'invite'

/** 企业摘要条的一格 */
function SummaryStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-xs font-bold text-mg-text-3 uppercase tracking-wider truncate">{label}</span>
      <span className="text-sm font-bold text-mg-text-1 truncate">{value}</span>
    </div>
  )
}

export function OrgManagePanel({
  tenantId,
  onDissolved,
}: {
  tenantId: string | null
  onDissolved?: (dissolvedTenantId: string) => void | Promise<void>
}) {
  const { t } = useTranslation()
  const tenantsQuery = useQuery({ queryKey: ['tenants'], queryFn: listTenants, staleTime: 30_000 })
  const sessionTenants = useAuthStore((s) => s.tenants)
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('members')
  const { hasPermission } = usePermissions()

  // Hooks 必须无条件调用 —— 摘要条数据源（tenant 详情 + 成员）随 tenantId 拉取
  const tenantQuery = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => getTenant(tenantId as string),
    enabled: !!tenantId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
  const membersQuery = useQuery({
    queryKey: ['tenant-members', tenantId],
    queryFn: () => listTenantMembers(tenantId as string),
    enabled: !!tenantId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  if (!tenantId) {
    return (
      <div className="bg-mg-bg-0 border border-mg-border/50 border-dashed rounded-lg p-12 text-center flex flex-col items-center justify-center min-h-[360px] space-y-4">
        <div className="w-14 h-14 rounded-lg bg-brand-glow/8 border border-brand-base/10 flex items-center justify-center">
          <span className="text-brand-base font-bold text-lg">M</span>
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-mg-text-1">暂无可管理的企业</h3>
          <p className="text-xs text-mg-text-3 max-w-xs mx-auto leading-relaxed">
            当前账号下没有企业组织。可在顶栏租户切换器创建企业后再来管理。
          </p>
        </div>
      </div>
    )
  }

  const tenantItem = tenantsQuery.data?.items.find((t) => t.tenant_id === tenantId)
  const role = tenantItem?.role
  const isOwner = role === 'tenant_owner'
  const isAdmin = role === 'tenant_admin'
  const canManageInvite = hasPermission(PERMS.ORG_INVITE_MANAGE)
  const canViewAudit = hasPermission(PERMS.ORG_AUDIT_VIEW)
  const tenantName = tenantItem?.name
    || sessionTenants.find((tt) => tt.tenant_id === tenantId)?.name
    || '…'

  // 摘要数据
  const detail = tenantQuery.data
  const members = membersQuery.data?.items ?? []
  const owner = members.find((m) => m.role === 'tenant_owner')
  const adminCount = members.filter((m) => m.role === 'tenant_admin').length
  // 待处理邀请数（#11）：与成员列表同源，取 pending 状态的邀请条数
  const pendingInviteCount = (membersQuery.data?.pending_invitations ?? []).filter((inv) => inv.status === 'pending').length
  const dash = '—'

  const tabs: { key: SubTab; label: string; show: boolean }[] = [
    { key: 'members', label: t('enterprise.tabs.members'), show: true },
    { key: 'info', label: t('enterprise.tabs.info'), show: true },
    { key: 'audit', label: t('enterprise.tabs.audit'), show: canViewAudit },
    { key: 'invite', label: t('enterprise.tabs.invite'), show: canManageInvite },
  ]
  const visibleTabs = tabs.filter((tab) => tab.show)
  const resolvedSubTab = visibleTabs.some((tab) => tab.key === activeSubTab)
    ? activeSubTab
    : (visibleTabs[0]?.key ?? 'members')

  return (
    <div className="space-y-6">
      {/* 企业摘要条 */}
      <div className="bg-mg-bg-0 border border-mg-border/50 rounded-lg shadow-xs p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-bold text-mg-text-1">{tenantName}</span>
          {tenantItem && <RoleBadge role={tenantItem.role} />}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
          <SummaryStat label={t('enterprise.summary.name')} value={detail?.name ?? tenantName} />
          <SummaryStat
            label={t('enterprise.summary.accountType')}
            value={detail
              ? (detail.type === 'personal' ? t('enterprise.summary.typePersonal') : t('enterprise.summary.typeEnterprise'))
              : dash}
          />
          <SummaryStat label={t('enterprise.summary.owner')} value={owner?.account.display_name || owner?.account.email || (membersQuery.isLoading ? '…' : dash)} />
          <SummaryStat label={t('enterprise.summary.members')} value={membersQuery.isLoading ? '…' : members.length} />
          <SummaryStat label={t('enterprise.summary.admins')} value={membersQuery.isLoading ? '…' : adminCount} />
          <SummaryStat label={t('enterprise.summary.pendingInvites')} value={membersQuery.isLoading ? '…' : pendingInviteCount} />
          <SummaryStat label={t('enterprise.summary.workspaces')} value={tenantItem?.current_workspace_count ?? dash} />
        </div>
      </div>

      {/* Tab 导航（保留原生 button，便于测试与无障碍聚焦） */}
      <div className="border-b border-mg-border/60 flex gap-6 text-sm bg-transparent">
        {visibleTabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => { trackEvent('organization:tab_click', { tab: tb.key }); setActiveSubTab(tb.key) }}
            className={`pb-3 font-bold transition-all border-b-2 cursor-pointer bg-transparent border-none text-xs ${
              resolvedSubTab === tb.key
                ? 'border-brand-base text-brand-base'
                : 'border-transparent text-mg-text-3 hover:text-mg-text-1'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      <div className="pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
        {resolvedSubTab === 'members' && (
          <MembersTab tenantId={tenantId} isOwner={isOwner} isAdmin={isAdmin} />
        )}
        {resolvedSubTab === 'info' && (
          <OrgInfoTab
            tenantId={tenantId}
            onDissolved={() => onDissolved?.(tenantId)}
          />
        )}
        {canViewAudit && resolvedSubTab === 'audit' && <AuditTab tenantId={tenantId} />}
        {canManageInvite && resolvedSubTab === 'invite' && <InviteTab tenantId={tenantId} />}
      </div>
    </div>
  )
}
