import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { LuSearch, LuArrowRight, LuX, LuUsers, LuBuilding2 } from 'react-icons/lu'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { useWorkspaceRole } from '@/hooks/use-workspace-role'
import { createInvitations } from '@/services/invitations'
import { listTenantMembers } from '@/services/tenants'
import { listWorkspaces, listWorkspaceMembers, removeWorkspaceMember, updateWorkspaceMemberRole } from '@/services/workspaces'
import type { TenantMember, WorkspaceMember } from '@/types'
import { TENANT_ROLE_LABEL, WS_ROLE_LABEL, WS_ROLE_OPTIONS } from '@/constants/roles'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import { appToast } from '@/lib/app-toast'
import { pageItems } from '@/lib/utils'

export default function InvitationsMgmtPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const tenants = useAuthStore((s) => s.tenants)
  const activeTenant = tenants.find((tn) => tn.tenant_id === activeTenantId)
  const { canManage } = useWorkspaceRole()

  const [selectedWsId, setSelectedWsId] = useState(activeWorkspaceId ?? '')
  const [orgSearch, setOrgSearch] = useState('')

  // ─── 数据 ────────────────────────────────────────────────────
  const orgMembersQuery = useQuery({
    queryKey: ['tenant-members', activeTenantId],
    queryFn: () => listTenantMembers(activeTenantId!, { limit: 100 }),
    enabled: Boolean(activeTenantId),
    staleTime: 60_000,
  })

  const workspacesQuery = useQuery({
    queryKey: ['workspaces', activeTenantId],
    queryFn: () => listWorkspaces().then((r) => r.items ?? []),
    enabled: Boolean(activeTenantId),
    staleTime: 60_000,
  })

  const wsMembersQuery = useQuery({
    queryKey: ['workspace-members', selectedWsId],
    queryFn: () => listWorkspaceMembers(selectedWsId, { page_size: 100 }).then(pageItems),
    enabled: Boolean(selectedWsId),
    staleTime: 30_000,
  })

  const wsAccountIds = useMemo(() => {
    const ids = new Set<string>()
    for (const m of wsMembersQuery.data ?? []) ids.add(m.account.account_id)
    return ids
  }, [wsMembersQuery.data])

  const filteredOrgMembers = useMemo(() => {
    const members = orgMembersQuery.data?.items ?? []
    const q = orgSearch.trim().toLowerCase()
    if (!q) return members
    return members.filter(
      (m) => m.account.display_name.toLowerCase().includes(q) || m.account.email.toLowerCase().includes(q)
    )
  }, [orgMembersQuery.data, orgSearch])

  const workspaces = workspacesQuery.data ?? []
  const wsMembers: WorkspaceMember[] = wsMembersQuery.data ?? []
  const selectedWs = workspaces.find((w) => w.workspace_id === selectedWsId)

  // ─── 操作 ────────────────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: ({ email }: { email: string }) =>
      createInvitations(selectedWsId, {
        invites: [{ email, role: 'ws_member' }],
        expires_in_hours: 720,
      }),
    onSuccess: () => {
      appToast.success(t('invitations.assign.addSuccess'))
      qc.invalidateQueries({ queryKey: ['workspace-members', selectedWsId] })
    },
    onError: (err: unknown) => appToast.error((err as Error)?.message || t('invitations.assign.addError')),
  })

  const removeMutation = useMutation({
    mutationFn: (accountId: string) => removeWorkspaceMember(selectedWsId, accountId),
    onSuccess: () => {
      appToast.success(t('invitations.assign.removeSuccess'))
      qc.invalidateQueries({ queryKey: ['workspace-members', selectedWsId] })
    },
    onError: (err: unknown) => appToast.error((err as Error)?.message || t('invitations.assign.removeError')),
  })

  const roleMutation = useMutation({
    mutationFn: ({ accountId, role }: { accountId: string; role: 'ws_admin' | 'ws_member' }) =>
      updateWorkspaceMemberRole(selectedWsId, accountId, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace-members', selectedWsId] })
    },
    onError: (err: unknown) => appToast.error((err as Error)?.message || t('invitations.assign.roleError')),
  })

  return (
    <div className="space-y-5">
      {/* 标题 */}
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <h1 className="text-2xl font-bold tracking-tight text-mg-text-0">{t('invitations.title')}</h1>
          {activeTenant?.name && (
            <Badge variant="outline" className="text-[11px] font-semibold">{activeTenant.name}</Badge>
          )}
        </div>
        <p className="text-sm text-mg-text-1">{t('invitations.assign.desc')}</p>
      </div>

      {/* 双栏布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5" style={{ minHeight: 420 }}>

        {/* ── 左：企业成员池 ────────────────────────── */}
        <div className="bg-card-bg border border-mg-border rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-mg-border flex items-center gap-2 bg-mg-fill-0/20 shrink-0">
            <LuBuilding2 size={14} className="text-mg-text-2" />
            <span className="text-[13px] font-bold text-mg-text-0">{t('invitations.assign.orgPool')}</span>
            <span className="text-[11px] text-mg-text-2">({orgMembersQuery.data?.items?.length ?? 0})</span>
            <div className="ml-auto">
              <Input
                prefix={<LuSearch className="w-3 h-3" />}
                className="w-44 h-7 rounded-md text-[11px]"
                placeholder={t('invitations.assign.searchPlaceholder')}
                value={orgSearch}
                onChange={(e) => setOrgSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {orgMembersQuery.isLoading ? (
              <div className="py-16 flex justify-center">
                <div className="w-6 h-6 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
              </div>
            ) : filteredOrgMembers.length === 0 ? (
              <div className="py-12 text-center text-xs text-mg-text-2">{t('invitations.assign.orgEmpty')}</div>
            ) : (
              <div className="divide-y divide-mg-border/40">
                {filteredOrgMembers.map((m: TenantMember) => {
                  const inWs = wsAccountIds.has(m.account.account_id)
                  return (
                    <div key={m.account.account_id} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-mg-fill-0/30 transition-colors">
                      {m.account.avatar_url ? (
                        <img src={m.account.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-brand-base text-white text-[10px] font-bold flex items-center justify-center shrink-0 uppercase">
                          {m.account.display_name?.[0] ?? '?'}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold text-mg-text-0 truncate">{m.account.display_name}</div>
                        <div className="text-[10px] text-mg-text-2 truncate">{m.account.email}</div>
                      </div>
                      <Badge variant="outline" className="text-[9px] shrink-0">{TENANT_ROLE_LABEL[m.role]}</Badge>
                      {/* 操作 */}
                      {inWs ? (
                        <span className="text-[10px] text-emerald-600 font-semibold shrink-0 w-12 text-right">{t('invitations.assign.inWs')}</span>
                      ) : canManage && selectedWsId ? (
                        <Button
                          variant="ghost"
                          className="h-6 px-2 text-[10px] font-semibold shrink-0 text-brand-base hover:bg-brand-base/5"
                          loading={addMutation.isPending}
                          onClick={() => addMutation.mutate({ email: m.account.email })}
                        >
                          <LuArrowRight size={11} className="mr-0.5" />
                          {t('invitations.assign.add')}
                        </Button>
                      ) : (
                        <span className="w-12 shrink-0" />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── 右：工作区成员 ────────────────────────── */}
        <div className="bg-card-bg border border-mg-border rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-mg-border flex items-center gap-2 bg-mg-fill-0/20 shrink-0">
            <LuUsers size={14} className="text-mg-text-2" />
            <span className="text-[13px] font-bold text-mg-text-0">{t('invitations.assign.wsMembers')}</span>
            {/* 工作区选择器 */}
            <Select
              value={selectedWsId}
              onChange={setSelectedWsId}
              className="ml-auto h-7 text-[11px] w-36 rounded-md"
            >
              {workspaces.map((ws) => (
                <Select.Option key={ws.workspace_id} value={ws.workspace_id}>
                  {ws.name}{ws.workspace_id === activeWorkspaceId ? ` (${t('invitations.assign.current')})` : ''}
                </Select.Option>
              ))}
            </Select>
          </div>
          <div className="flex-1 overflow-y-auto">
            {!selectedWsId ? (
              <div className="py-12 text-center text-xs text-mg-text-2">{t('invitations.assign.selectWs')}</div>
            ) : wsMembersQuery.isLoading ? (
              <div className="py-16 flex justify-center">
                <div className="w-6 h-6 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
              </div>
            ) : wsMembers.length === 0 ? (
              <div className="py-12 text-center text-xs text-mg-text-2">{t('invitations.assign.wsEmpty')}</div>
            ) : (
              <div className="divide-y divide-mg-border/40">
                {wsMembers.map((m: WorkspaceMember) => (
                  <div key={m.account.account_id} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-mg-fill-0/30 transition-colors">
                    {m.account.avatar_url ? (
                      <img src={m.account.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 uppercase">
                        {m.account.display_name?.[0] ?? '?'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-mg-text-0 truncate">{m.account.display_name}</div>
                      <div className="text-[10px] text-mg-text-2 truncate">{m.account.email}</div>
                    </div>
                    {/* 角色选择 */}
                    {canManage && m.role !== 'ws_owner' ? (
                      <Select
                        value={m.role}
                        onChange={(role) => roleMutation.mutate({ accountId: m.account.account_id, role: role as 'ws_admin' | 'ws_member' })}
                        className="h-6 text-[10px] w-20 rounded"
                      >
                        {WS_ROLE_OPTIONS.map((o) => (
                          <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
                        ))}
                      </Select>
                    ) : (
                      <Badge variant={m.role === 'ws_owner' ? 'purple' : 'outline'} className="text-[9px] shrink-0">
                        {WS_ROLE_LABEL[m.role]}
                      </Badge>
                    )}
                    {/* 移除 */}
                    {canManage && m.role !== 'ws_owner' && (
                      <button
                        onClick={() => removeMutation.mutate(m.account.account_id)}
                        className="shrink-0 p-1 rounded text-mg-text-2 hover:text-rose-500 hover:bg-rose-500/5 transition-colors cursor-pointer"
                        title={t('invitations.assign.remove')}
                      >
                        <LuX size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          {selectedWs && (
            <div className="px-4 py-2 border-t border-mg-border/50 bg-mg-fill-0/10 text-[10px] text-mg-text-2 shrink-0">
              {selectedWs.name} · {wsMembers.length} {t('invitations.assign.memberCount')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
