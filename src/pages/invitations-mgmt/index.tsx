import { useState, useMemo } from 'react'
import { LuSearch, LuUserPlus } from 'react-icons/lu'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { useWorkspaceRole } from '@/hooks/use-workspace-role'
import {
  listInvitations,
  revokeInvitation,
  createInvitations,
} from '@/services/invitations'
import { listTenantMembers } from '@/services/tenants'
import type { InvitationItem, TenantMember } from '@/types'
import { formatDateTime } from '@/lib/format-date'
import { WS_ROLE_LABEL, WS_ROLE_OPTIONS, TENANT_ROLE_LABEL } from '@/constants/roles'
import { INVITATION_STATUS_CONFIG, INVITATION_STATUS_OPTIONS } from '@/constants/status'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { appToast } from '@/lib/app-toast'

export default function InvitationsMgmtPage() {
  const qc = useQueryClient()
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const tenants = useAuthStore((s) => s.tenants)
  const activeTenant = tenants.find((t) => t.tenant_id === activeTenantId)

  const { canManage } = useWorkspaceRole()
  const [status, setStatus] = useState<'pending' | 'accepted' | 'expired' | 'revoked' | 'all'>('pending')

  // ─── Invite modal state ───────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [inviteRole, setInviteRole] = useState<'ws_member' | 'ws_admin'>('ws_member')
  const [expiresInHours, setExpiresInHours] = useState<number>(72)

  const orgMembersQuery = useQuery({
    queryKey: ['tenant-members', activeTenantId],
    queryFn: () => listTenantMembers(activeTenantId!, { limit: 100 }),
    enabled: Boolean(activeTenantId) && modalOpen,
    staleTime: 60_000,
  })

  const filteredMembers = useMemo(() => {
    const members = orgMembersQuery.data?.items ?? []
    const q = search.trim().toLowerCase()
    if (!q) return members
    return members.filter(
      (m) => m.account.display_name.toLowerCase().includes(q) || m.account.email.toLowerCase().includes(q)
    )
  }, [orgMembersQuery.data, search])

  const sendInvitesMutation = useMutation({
    mutationFn: () => {
      const members = orgMembersQuery.data?.items ?? []
      const invites = members
          .filter((m) => selectedIds.has(m.account.account_id))
          .map((m) => ({ email: m.account.email, role: inviteRole }))
      return createInvitations(activeWorkspaceId!, { invites, expires_in_hours: expiresInHours })
    },
    onSuccess: () => {
      appToast.success('邀请已发出')
      setModalOpen(false)
      setSelectedIds(new Set())
      setSearch('')
      setExpiresInHours(72)
      qc.invalidateQueries({ queryKey: ['workspace-invitations', activeWorkspaceId] })
    },
    onError: (err: any) => appToast.error(err?.message || '邀请失败'),
  })

  function toggleMember(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleOpenModal() {
    setSelectedIds(new Set())
    setSearch('')
    setModalOpen(true)
  }

  // ─── Invitation list ──────────────────────────────────────────────────────
  const invitationsQuery = useQuery({
    queryKey: ['workspace-invitations', activeWorkspaceId, status],
    queryFn: () => listInvitations(activeWorkspaceId!, { status }),
    enabled: Boolean(activeWorkspaceId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  // ─── Revoke invitation ────────────────────────────────────────────────────
  const revokeMutation = useMutation({
    mutationFn: revokeInvitation,
    onSuccess: () => {
      appToast.success('邀请已撤销')
      qc.invalidateQueries({ queryKey: ['workspace-invitations', activeWorkspaceId] })
    },
    onError: (err: any) => {
      appToast.error(err?.message || '撤销邀请失败')
    },
  })

  const invitations = invitationsQuery.data?.items ?? []

  return (
    <div>
      {/* 页面标题 */}
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 6px 0' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--semi-color-text-0)', margin: 0, letterSpacing: '-0.02em' }}>
              工作区邀请管理
            </h1>
            {activeTenant?.name && (
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--semi-color-primary)', background: 'var(--semi-color-primary-light-default)', padding: '3px 10px', borderRadius: '4px', flexShrink: 0 }}>
                {activeTenant.name}
              </span>
            )}
          </div>
          <p style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', margin: 0 }}>
            邀请组织成员加入当前工作区。
          </p>
        </div>
        {canManage && (
          <Button variant="default" className="rounded-lg font-semibold flex items-center gap-1.5 h-10 px-4" onClick={handleOpenModal}>
            <LuUserPlus size={16} />
            邀请成员
          </Button>
        )}
      </div>

      {/* ── 邀请成员弹窗（极雅玻璃态 Modal） ──────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* 背景遮罩 */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          
          {/* 弹窗框体 */}
          <div className="relative bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl w-full max-w-[520px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">邀请组织成员</h2>
              <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm font-semibold transition-colors" onClick={() => setModalOpen(false)}>✕</button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto flex-1">
              <div className="relative mb-4">
                <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <Input
                  className="pl-9 h-10 rounded-lg w-full"
                  placeholder="搜索姓名或邮箱"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {orgMembersQuery.isLoading ? (
                <div className="py-16 flex justify-center items-center">
                  <div className="w-8 h-8 border-2 border-gray-200 border-t-brand-base rounded-full animate-spin" />
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                  {filteredMembers.length === 0 ? (
                    <div className="text-center py-12 text-sm text-gray-400 dark:text-gray-500">
                      暂无匹配成员
                    </div>
                  ) : (
                    filteredMembers.map((m: TenantMember) => (
                      <div
                        key={m.account.account_id}
                        onClick={() => toggleMember(m.account.account_id)}
                        className={`flex items-center gap-3.5 p-2.5 rounded-xl cursor-pointer transition-all border ${
                          selectedIds.has(m.account.account_id)
                            ? 'bg-brand-glow/10 border-brand-base/20 dark:bg-brand-glow/5'
                            : 'bg-transparent border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/40'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(m.account.account_id)}
                          onChange={() => toggleMember(m.account.account_id)}
                          className="rounded border-gray-300 dark:border-gray-700 text-brand-base focus:ring-brand-glow h-4 w-4 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        />
                        {m.account.avatar_url ? (
                          <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 shadow-sm">
                            <img src={m.account.avatar_url} alt={m.account.display_name} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-brand-base text-white text-xs font-bold flex items-center justify-center shrink-0 shadow-sm uppercase">
                            {m.account.display_name[0]}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">
                            {m.account.display_name}
                          </div>
                          <div className="text-xs text-gray-400 dark:text-gray-500 overflow-hidden text-ellipsis whiteSpace-nowrap mt-0.5">
                            {m.account.email}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0 font-medium">
                          {TENANT_ROLE_LABEL[m.role]}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">角色</span>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    className="modern-input-field h-8 text-xs py-0 pr-8 pl-2 bg-white dark:bg-gray-800"
                  >
                    {WS_ROLE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">有效期</span>
                  <select
                    value={expiresInHours}
                    onChange={(e) => setExpiresInHours(Number(e.target.value))}
                    className="modern-input-field h-8 text-xs py-0 pr-8 pl-2 bg-white dark:bg-gray-800"
                  >
                    <option value={24}>24 小时</option>
                    <option value={72}>3 天</option>
                    <option value={168}>7 天</option>
                    <option value={720}>30 天</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="h-9 px-4 rounded-lg text-xs" onClick={() => setModalOpen(false)}>取消</Button>
                <Button
                  variant="default"
                  className="h-9 px-4 rounded-lg text-xs font-semibold"
                  disabled={selectedIds.size === 0 || sendInvitesMutation.isPending}
                  onClick={() => sendInvitesMutation.mutate()}
                >
                  {sendInvitesMutation.isPending ? '发送中...' : `发送邀请 ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 邀请记录列表（精美的 Stripe 样式 Table） ──────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex justify-between items-center p-5 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">邀请记录</h3>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className="modern-input-field h-9 text-xs w-[120px] bg-white dark:bg-gray-800"
          >
            {INVITATION_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto w-full p-2">
          {invitationsQuery.isLoading ? (
            <div className="py-20 flex justify-center items-center">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-brand-base rounded-full animate-spin" />
            </div>
          ) : invitations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="text-3xl mb-3">📬</span>
              <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">暂无邀请记录</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="py-3 px-4 font-semibold text-gray-400 dark:text-gray-500 text-xs">邮箱</th>
                  <th className="py-3 px-4 font-semibold text-gray-400 dark:text-gray-500 text-xs">角色</th>
                  <th className="py-3 px-4 font-semibold text-gray-400 dark:text-gray-500 text-xs">状态</th>
                  <th className="py-3 px-4 font-semibold text-gray-400 dark:text-gray-500 text-xs">过期时间</th>
                  <th className="py-3 px-4 font-semibold text-gray-400 dark:text-gray-500 text-xs w-20">操作</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((record: InvitationItem) => {
                  const cfg = INVITATION_STATUS_CONFIG[record.status]
                  return (
                    <tr
                      key={record.invitation_id}
                      className="border-b border-gray-100/50 dark:border-gray-800/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-semibold text-gray-800 dark:text-gray-200 text-xs">
                        {record.email}
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge variant="outline" className="text-[10px] py-0.5 px-2 font-medium">
                          {WS_ROLE_LABEL[record.role]}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          style={{
                            backgroundColor: cfg.bg,
                            color: cfg.color,
                            border: `1px solid ${cfg.border}`,
                            fontSize: '11px',
                            fontWeight: 600,
                            borderRadius: '100px',
                            padding: '2px 8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                          }}
                        >
                          {cfg.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-gray-400 dark:text-gray-500">
                        {formatDateTime(record.expires_at)}
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        {record.status === 'pending' ? (
                          canManage ? (
                            <button
                              disabled={revokeMutation.isPending}
                              onClick={() => revokeMutation.mutate(record.invitation_id)}
                              className="text-rose-500 hover:text-rose-600 bg-none border-none cursor-pointer font-bold transition-all p-0"
                            >
                              撤销
                            </button>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-700">—</span>
                          )
                        ) : (
                          <span className="text-gray-300 dark:text-gray-700">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
