import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { LuSearch, LuUserPlus, LuInbox, LuCheck, LuUsers } from 'react-icons/lu'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { useWorkspaceRole } from '@/hooks/use-workspace-role'
import { listInvitations, revokeInvitation, createInvitations } from '@/services/invitations'
import { listTenantMembers } from '@/services/tenants'
import { listWorkspaceMembers } from '@/services/workspaces'
import type { InvitationItem, TenantMember } from '@/types'
import { formatDateTime } from '@/lib/format-date'
import { WS_ROLE_LABEL, WS_ROLE_OPTIONS, TENANT_ROLE_LABEL } from '@/constants/roles'
import { INVITATION_STATUS_CONFIG, INVITATION_STATUS_OPTIONS } from '@/constants/status'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { appToast } from '@/lib/app-toast'

export default function InvitationsMgmtPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const tenants = useAuthStore((s) => s.tenants)
  const activeTenant = tenants.find((t) => t.tenant_id === activeTenantId)
  const { canManage } = useWorkspaceRole()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'pending' | 'accepted' | 'expired' | 'revoked' | 'all'>('pending')
  const [inviteRoles, setInviteRoles] = useState<Record<string, 'ws_member' | 'ws_admin'>>({})

  // ─── 数据 ──────────────────────────────────────────────────────────────────
  const orgMembersQuery = useQuery({
    queryKey: ['tenant-members', activeTenantId],
    queryFn: () => listTenantMembers(activeTenantId!, { limit: 100 }),
    enabled: Boolean(activeTenantId),
    staleTime: 60_000,
  })

  const wsMembersQuery = useQuery({
    queryKey: ['workspace-members', activeWorkspaceId],
    queryFn: () => listWorkspaceMembers(activeWorkspaceId!, { page_size: 100 }),
    enabled: Boolean(activeWorkspaceId),
    staleTime: 60_000,
  })

  const invitationsQuery = useQuery({
    queryKey: ['workspace-invitations', activeWorkspaceId, status],
    queryFn: () => listInvitations(activeWorkspaceId!, { status }),
    enabled: Boolean(activeWorkspaceId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  const wsAccountIds = useMemo(() => {
    const ids = new Set<string>()
    for (const m of wsMembersQuery.data?.items ?? []) ids.add(m.account.account_id)
    return ids
  }, [wsMembersQuery.data])

  const pendingEmails = useMemo(() => {
    const emails = new Set<string>()
    for (const inv of invitationsQuery.data?.items ?? []) {
      if (inv.status === 'pending') emails.add(inv.email)
    }
    return emails
  }, [invitationsQuery.data])

  const filteredMembers = useMemo(() => {
    const members = orgMembersQuery.data?.items ?? []
    const q = search.trim().toLowerCase()
    if (!q) return members
    return members.filter(
      (m) => m.account.display_name.toLowerCase().includes(q) || m.account.email.toLowerCase().includes(q)
    )
  }, [orgMembersQuery.data, search])

  // ─── 操作 ──────────────────────────────────────────────────────────────────
  const inviteMutation = useMutation({
    mutationFn: ({ email, role }: { email: string; role: 'ws_member' | 'ws_admin' }) =>
      createInvitations(activeWorkspaceId!, {
        invites: [{ email, role }],
        expires_in_hours: 168,
      }),
    onSuccess: () => {
      appToast.success(t('invitations.toast.sent'))
      qc.invalidateQueries({ queryKey: ['workspace-invitations', activeWorkspaceId] })
    },
    onError: (err: unknown) => appToast.error((err as Error)?.message || t('invitations.toast.sendError')),
  })

  const revokeMutation = useMutation({
    mutationFn: revokeInvitation,
    onSuccess: () => {
      appToast.success(t('invitations.toast.revoked'))
      qc.invalidateQueries({ queryKey: ['workspace-invitations', activeWorkspaceId] })
    },
    onError: (err: unknown) => appToast.error((err as Error)?.message || t('invitations.toast.revokeError')),
  })

  function getMemberRole(accountId: string) {
    return inviteRoles[accountId] ?? 'ws_member'
  }

  const invitations = invitationsQuery.data?.items ?? []

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-mg-text-0">
              {t('invitations.title')}
            </h1>
            {activeTenant?.name && (
              <Badge variant="outline" className="text-[11px] font-semibold">
                {activeTenant.name}
              </Badge>
            )}
          </div>
          <p className="text-sm text-mg-text-1">{t('invitations.desc')}</p>
        </div>
      </div>

      {/* ── 企业成员列表 ─────────────────────────────────── */}
      <div className="bg-card-bg border border-mg-border rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-mg-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LuUsers size={14} className="text-mg-text-2" />
            <h3 className="text-sm font-bold text-mg-text-0">{t('invitations.orgMembers.title')}</h3>
            <span className="text-[11px] text-mg-text-2">
              ({orgMembersQuery.data?.items?.length ?? 0})
            </span>
          </div>
          <Input
            prefix={<LuSearch className="w-3.5 h-3.5" />}
            className="w-56 h-8 rounded-lg text-xs"
            placeholder={t('invitations.orgMembers.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {orgMembersQuery.isLoading ? (
          <div className="py-16 flex justify-center">
            <div className="w-7 h-7 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="py-12 text-center text-sm text-mg-text-2">{t('invitations.orgMembers.empty')}</div>
        ) : (
          <div className="divide-y divide-mg-border/50">
            {filteredMembers.map((m: TenantMember) => {
              const inWorkspace = wsAccountIds.has(m.account.account_id)
              const hasPending = pendingEmails.has(m.account.email)
              return (
                <div
                  key={m.account.account_id}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-mg-fill-0/30 transition-colors"
                >
                  {/* 头像 */}
                  {m.account.avatar_url ? (
                    <img src={m.account.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-brand-base text-white text-xs font-bold flex items-center justify-center shrink-0 uppercase">
                      {m.account.display_name?.[0] ?? '?'}
                    </div>
                  )}
                  {/* 名称邮箱 */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-mg-text-0 leading-tight truncate">
                      {m.account.display_name}
                    </div>
                    <div className="text-[11px] text-mg-text-2 truncate mt-0.5">{m.account.email}</div>
                  </div>
                  {/* 企业角色 */}
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {TENANT_ROLE_LABEL[m.role]}
                  </Badge>
                  {/* 状态/操作 */}
                  <div className="shrink-0 flex items-center gap-2 min-w-[160px] justify-end">
                    {inWorkspace ? (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                        <LuCheck size={12} />
                        {t('invitations.orgMembers.joined')}
                      </span>
                    ) : hasPending ? (
                      <Badge variant="warning" className="text-[10px]">
                        {t('invitations.orgMembers.pending')}
                      </Badge>
                    ) : canManage ? (
                      <div className="flex items-center gap-1.5">
                        <select
                          value={getMemberRole(m.account.account_id)}
                          onChange={(e) => setInviteRoles((prev) => ({
                            ...prev,
                            [m.account.account_id]: e.target.value as 'ws_member' | 'ws_admin',
                          }))}
                          className="h-7 text-[11px] rounded-md border border-mg-border bg-mg-bg-0 text-mg-text-1 px-1.5 outline-none cursor-pointer"
                        >
                          {WS_ROLE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        <Button
                          variant="default"
                          className="h-7 px-3 text-[11px] font-semibold rounded-md"
                          loading={inviteMutation.isPending}
                          onClick={() => inviteMutation.mutate({
                            email: m.account.email,
                            role: getMemberRole(m.account.account_id),
                          })}
                        >
                          <LuUserPlus size={12} className="mr-1" />
                          {t('invitations.orgMembers.invite')}
                        </Button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-mg-text-2">{t('invitations.orgMembers.notJoined')}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── 邀请记录 ─────────────────────────────────────── */}
      <div className="bg-card-bg border border-mg-border rounded-xl overflow-hidden">
        <div className="flex justify-between items-center px-5 py-3.5 border-b border-mg-border">
          <h3 className="text-sm font-bold text-mg-text-0">{t('invitations.list.title')}</h3>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="h-8 text-xs rounded-lg border border-mg-border bg-mg-bg-0 text-mg-text-1 px-2 outline-none cursor-pointer"
          >
            {INVITATION_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {invitationsQuery.isLoading ? (
          <div className="py-16 flex justify-center">
            <div className="w-7 h-7 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
          </div>
        ) : invitations.length === 0 ? (
          <div className="flex flex-col items-center py-14 text-center">
            <LuInbox size={24} className="mb-2 text-mg-text-2" />
            <p className="text-sm text-mg-text-2">{t('invitations.list.empty')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-mg-border bg-mg-fill-0/30">
                  <th className="py-2.5 px-5 font-semibold text-mg-text-2 text-[11px] uppercase tracking-wider">{t('invitations.list.table.email')}</th>
                  <th className="py-2.5 px-5 font-semibold text-mg-text-2 text-[11px] uppercase tracking-wider">{t('invitations.list.table.role')}</th>
                  <th className="py-2.5 px-5 font-semibold text-mg-text-2 text-[11px] uppercase tracking-wider">{t('invitations.list.table.status')}</th>
                  <th className="py-2.5 px-5 font-semibold text-mg-text-2 text-[11px] uppercase tracking-wider">{t('invitations.list.table.expiresAt')}</th>
                  <th className="py-2.5 px-5 font-semibold text-mg-text-2 text-[11px] uppercase tracking-wider w-20">{t('invitations.list.table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mg-border/50">
                {invitations.map((record: InvitationItem) => {
                  const cfg = INVITATION_STATUS_CONFIG[record.status]
                  return (
                    <tr key={record.invitation_id} className="hover:bg-mg-fill-0/30 transition-colors">
                      <td className="py-3 px-5 font-semibold text-mg-text-0 text-xs">{record.email}</td>
                      <td className="py-3 px-5">
                        <Badge variant="outline" className="text-[10px]">{WS_ROLE_LABEL[record.role]}</Badge>
                      </td>
                      <td className="py-3 px-5">
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </td>
                      <td className="py-3 px-5 text-xs text-mg-text-2">{formatDateTime(record.expires_at)}</td>
                      <td className="py-3 px-5 text-xs">
                        {record.status === 'pending' && canManage ? (
                          <button
                            disabled={revokeMutation.isPending}
                            onClick={() => revokeMutation.mutate(record.invitation_id)}
                            className="text-rose-500 hover:text-rose-600 font-bold cursor-pointer transition-colors bg-transparent border-none p-0"
                          >
                            {t('invitations.list.table.revoke')}
                          </button>
                        ) : (
                          <span className="text-mg-text-3">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
