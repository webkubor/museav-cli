import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { trackEvent } from '@/lib/track'
import { getTenant, listTenantMembers, listTenants } from '@/services/tenants'
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
          <h3 className="text-sm font-bold text-mg-text-1">{t('enterprise.empty.noManageableTitle')}</h3>
          <p className="text-xs text-mg-text-3 max-w-xs mx-auto leading-relaxed">
            {t('enterprise.empty.noManageableDesc')}
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

  const tabs: { key: SubTab; label: string; desc: string; show: boolean }[] = [
    { key: 'members', label: t('enterprise.tabs.members'), desc: t('enterprise.tabs.membersDesc'), show: true },
    { key: 'info', label: t('enterprise.tabs.info'), desc: t('enterprise.tabs.infoDesc'), show: true },
    { key: 'audit', label: t('enterprise.tabs.audit'), desc: t('enterprise.tabs.auditDesc'), show: canViewAudit },
    { key: 'invite', label: t('enterprise.tabs.invite'), desc: t('enterprise.tabs.inviteDesc'), show: canManageInvite },
  ]
  const visibleTabs = tabs.filter((tab) => tab.show)
  const resolvedSubTab = visibleTabs.some((tab) => tab.key === activeSubTab)
    ? activeSubTab
    : (visibleTabs[0]?.key ?? 'members')

  return (
    <div className="space-y-6">
      {/* 企业摘要条：名称只在标题展示一次，账号类型/Owner 收进标题旁 Hint（需求方#128） */}
      <div className="bg-mg-bg-0 border border-mg-border/50 rounded-lg shadow-xs p-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-3 min-w-0">
          <span className="text-sm font-bold text-mg-text-1 truncate">{detail?.name ?? tenantName}</span>
          <span className="text-xs text-mg-text-3 truncate">
            {(detail ? (detail.type === 'personal' ? t('enterprise.summary.accountPersonal') : t('enterprise.summary.accountEnterprise')) : '…')}
            {' · '}
            {t('enterprise.summary.owner')} {owner?.account.display_name || owner?.account.email || (membersQuery.isLoading ? '…' : dash)}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
          <SummaryStat label={t('enterprise.summary.members')} value={membersQuery.isLoading ? '…' : members.length} />
          <SummaryStat label={t('enterprise.summary.admins')} value={membersQuery.isLoading ? '…' : adminCount} />
          <SummaryStat label={t('enterprise.summary.pendingInvites')} value={membersQuery.isLoading ? '…' : pendingInviteCount} />
          <SummaryStat label={t('enterprise.summary.workspaces')} value={tenantItem?.current_workspace_count ?? dash} />
        </div>
      </div>

      {/* Tab 导航（对齐 PRD enterprise-tabs：整体分段条——单圆角边框盒子 + 竖线分隔的等宽格，
          非分离浮空卡片；激活态 brand-soft 底 + 品牌色字。保留原生 button 便于测试/无障碍。） */}
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-mg-border lg:grid-cols-4">
        {visibleTabs.map((tb) => {
          const active = resolvedSubTab === tb.key
          return (
            <button
              key={tb.key}
              type="button"
              onClick={() => { trackEvent('organization:tab_click', { tab: tb.key }); setActiveSubTab(tb.key) }}
              className={`flex min-h-[58px] flex-col items-start justify-center gap-0.5 border-mg-border px-3.5 py-2.5 text-left transition-colors cursor-pointer [&:not(:last-child)]:border-r ${
                active ? 'bg-brand-soft' : 'bg-mg-bg-0 hover:bg-mg-fill-0/60'
              }`}
            >
              <span className={`text-[13px] font-bold ${active ? 'text-brand-base' : 'text-mg-text-1'}`}>{tb.label}</span>
              <span className={`text-[11px] leading-snug ${active ? 'text-brand-base/80' : 'text-mg-text-3'}`}>{tb.desc}</span>
            </button>
          )
        })}
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
