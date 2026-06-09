import { createOrganization } from '@/services/organizations'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LuPlus } from 'react-icons/lu'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import {
  addTenantMembers,
  getTenant,
  getTenantInviteLink,
  listTenantMembers,
  listTenants,
  removeTenantMember,
  resetTenantInviteLink,
  updateTenant,
  updateTenantMemberRole,
  uploadTenantLogo,
} from '@/services/tenants'
import type { TenantItem } from '@/types'
import { formatDate } from '@/lib/format-date'
import { TENANT_ROLE_CONFIG, TENANT_ROLE_OPTIONS } from '@/constants/roles'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { AvatarUpload } from '@/components/ui/AvatarUpload'
import { Modal } from '@/components/ui/Modal'
import { appToast } from '@/lib/app-toast'

const MAX_TENANTS = 5

function RoleBadge({ role }: { role?: TenantItem['role'] | string | null }) {
  const s = role ? TENANT_ROLE_CONFIG[role as keyof typeof TENANT_ROLE_CONFIG] : undefined
  if (!s) {
    return (
      <Badge variant="outline" className="text-[10px] font-bold px-2 py-0.5 rounded-full">
        {role || 'Unknown'}
      </Badge>
    )
  }
  return <Badge variant={s.variant} className="text-[10px] font-bold px-2 py-0.5 rounded-full">{s.label}</Badge>
}

function TenantMemberCountBadge({ tenantId }: { tenantId: string }) {
  const membersQuery = useQuery({
    queryKey: ['tenant-members-count', tenantId],
    queryFn: () => listTenantMembers(tenantId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  if (membersQuery.isLoading) {
    return <span className="text-[10px] text-mg-text-2 shrink-0">· 成员 …</span>
  }

  const count = membersQuery.data?.items.length ?? 0
  return (
    <span className="text-[10px] text-mg-text-2 shrink-0">
      · 成员 {count} 人
    </span>
  )
}

// ─── Org list section ─────────────────────────────────────────────────────────
interface OrgListSectionProps {
  selectedId: string | null
  onSelect: (id: string) => void
}

function OrgListSection({ selectedId, onSelect }: OrgListSectionProps) {
  const qc = useQueryClient()
  const { hasPermission } = usePermissions()
  const canCreateOrg = hasPermission(PERMS.ORG_SETTINGS_EDIT)
  const [createVisible, setCreateVisible] = useState(false)
  const [newName, setNewName] = useState('')

  const tenantsQuery = useQuery({
    queryKey: ['tenants'],
    queryFn: listTenants,
    staleTime: 30_000,
  })

  const tenants = tenantsQuery.data?.items ?? []
  const atLimit = tenants.length >= MAX_TENANTS

  const createMutation = useMutation({
    // 企业组织创建走 POST /organizations（slug 由后端从 name 派生）；
    // 原 createTenant(POST /tenants) 后端从未注册，必 404（#92/#99 修正）。
    mutationFn: () => createOrganization({ name: newName.trim() }),
    onSuccess: (org) => {
      appToast.success(`组织「${org.name}」已创建`)
      setCreateVisible(false)
      setNewName('')
      qc.invalidateQueries({ queryKey: ['tenants'] })
      onSelect(org.tenant_id)
    },
    onError: (err: Error) => {
      appToast.error(err?.message || '创建失败')
    },
  })

  function handleCreate() {
    if (!newName.trim()) { appToast.error('组织名称不能为空'); return }
    createMutation.mutate()
  }

  // 生成具有渐变质感的文字 Fallback 圆角头像
  const getFallbackAvatar = (name: string, id: string) => {
    const firstLetter = name.charAt(0).toUpperCase();
    const gradients = [
      'from-blue-500 to-indigo-600',
      'from-emerald-500 to-teal-600',
      'from-orange-500 to-amber-600',
      'from-rose-500 to-pink-600',
      'from-purple-500 to-violet-600',
    ];
    const index = Math.abs(id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % gradients.length;
    const bgGradient = gradients[index];
    return (
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${bgGradient} flex items-center justify-center text-white font-bold text-base shadow-sm shrink-0`}>
        {firstLetter}
      </div>
    );
  };

  return (
    <div className="bg-mg-bg-0 border border-mg-border/50 rounded-2xl shadow-xs overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b border-mg-border/50 bg-mg-fill-0/20">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-mg-text-0">我的组织</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
            atLimit ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-mg-fill-1 text-mg-text-2 border border-mg-border/40'
          }`}>
            {tenants.length} / {MAX_TENANTS}
          </span>
        </div>
        {canCreateOrg && (
          <Button
            variant="brand"
            disabled={atLimit}
            onClick={() => setCreateVisible(true)}
            className="rounded-full text-[11px] font-semibold h-7 px-3 flex items-center gap-1 bg-brand-base text-white hover:bg-brand-base/90 active:scale-[0.97] transition-all"
          >
            <LuPlus size={12} />
            创建组织
          </Button>
        )}
      </div>

      {/* 组织卡片列表 */}
      <div className="p-3 space-y-2">
        {tenantsQuery.isLoading ? (
          <div className="py-12 flex justify-center items-center">
            <div className="w-6 h-6 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
          </div>
        ) : tenants.length === 0 ? (
          <div className="py-8 text-center text-xs text-mg-text-2">
            暂无组织，请先创建一个组织
          </div>
        ) : (
          tenants.map((record: TenantItem) => {
            const isSelected = selectedId === record.tenant_id;
            return (
              <div
                key={record.tenant_id}
                onClick={() => onSelect(record.tenant_id)}
                className={`relative flex items-start gap-3 p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? 'border-brand-base bg-brand-glow/8 shadow-[0_4px_12px_rgba(var(--brand-base-rgb),0.04)] translate-x-[2px]'
                    : 'border-mg-border/40 bg-mg-bg-0 hover:border-brand-base/20 hover:bg-mg-fill-0 hover:translate-x-[2px] active:scale-[0.98]'
                }`}
              >
                {/* 选中流光左侧边 */}
                {isSelected && (
                  <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-md bg-brand-base animate-pulse" />
                )}

                {/* 组织头像 */}
                {record.logo_url ? (
                  <img
                    src={record.logo_url}
                    alt={record.name}
                    className="w-10 h-10 rounded-xl object-cover border border-mg-border/50 shadow-sm shrink-0"
                  />
                ) : (
                  getFallbackAvatar(record.name, record.tenant_id)
                )}

                {/* 卡片信息 */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5 justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-bold text-mg-text-0 truncate">
                        {record.name}
                      </span>
                      {record.is_default && (
                        <Badge variant="secondary" className="text-[9px] py-0 px-1 rounded-full font-bold scale-[0.9] origin-left shrink-0">默认</Badge>
                      )}
                    </div>
                    <RoleBadge role={record.role} />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-mg-text-2">
                    <span className="font-mono truncate max-w-[80px]">@{record.slug}</span>
                    <span className="flex items-center gap-1">
                      <span>工作区 {record.current_workspace_count ?? 0}/{record.max_workspaces ?? '—'}</span>
                      <TenantMemberCountBadge tenantId={record.tenant_id} />
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 创建新组织 Modal */}
      {createVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setCreateVisible(false)} />
          <div className="relative bg-card-bg modal-glow-flow rounded-2xl w-full max-w-[420px] shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-mg-border flex justify-between items-center bg-mg-fill-0/30">
              <h2 className="text-sm font-bold text-mg-text-0">创建新组织</h2>
              <button className="text-mg-text-2 hover:text-mg-text-0 text-xs font-bold transition-colors" onClick={() => setCreateVisible(false)}>✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-mg-text-1 uppercase tracking-wider block">组织名称</label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="如：我的团队" className="rounded-lg w-full text-xs h-9" />
              </div>
            </div>
            <div className="p-4 border-t border-mg-border flex justify-end gap-2 bg-mg-fill-0/30">
              <Button variant="outline" className="h-8 px-3 rounded-lg text-xs" onClick={() => setCreateVisible(false)}>取消</Button>
              <Button
                variant="brand"
                className="h-8 px-4 rounded-lg text-xs font-semibold bg-brand-base text-white hover:bg-brand-base/90"
                disabled={createMutation.isPending}
                onClick={handleCreate}
              >
                {createMutation.isPending ? '创建中...' : '确认创建'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Org info tab ─────────────────────────────────────────────────────────────
function OrgInfoTab({ tenantId }: { tenantId: string }) {
  const { hasPermission } = usePermissions()
  const canEditOrg = hasPermission(PERMS.ORG_SETTINGS_EDIT)
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(false)

  const tenantQuery = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => getTenant(tenantId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const membersQuery = useQuery({
    queryKey: ['tenant-members', tenantId],
    queryFn: () => listTenantMembers(tenantId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  const owner = membersQuery.data?.items.find((m) => m.role === 'tenant_owner')
  const tenant = tenantQuery.data

  const update = useMutation({
    mutationFn: () => updateTenant(tenantId, { name }),
    onSuccess: () => {
      appToast.success('组织名称已更新')
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] })
      qc.invalidateQueries({ queryKey: ['tenants'] })
      setEditing(false)
    },
    onError: (err: Error) => appToast.error(err?.message || '更新失败'),
  })

  const logoMutation = useMutation({
    mutationFn: (file: File) => uploadTenantLogo(tenantId, file),
    onSuccess: () => {
      appToast.success('企业头像已更新')
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] })
      qc.invalidateQueries({ queryKey: ['tenants'] })
    },
    onError: (err: Error) => appToast.error(err?.message || '上传失败，请重试'),
  })

  if (tenantQuery.isLoading) {
    return (
      <div className="h-48 bg-mg-fill-1 rounded-2xl animate-pulse" />
    )
  }

  if (!tenant) return null

  return (
    <div className="bg-mg-bg-0 border border-mg-border/50 rounded-2xl p-6 shadow-sm space-y-6">
      {/* 企业头像 */}
      <div className="flex items-center gap-4 pb-6 border-b border-mg-border/40">
        <AvatarUpload
          src={tenant.logo_url}
          fallback={tenant.name.charAt(0).toUpperCase()}
          size={64}
          loading={logoMutation.isPending}
          disabled={!canEditOrg}
          onUpload={(file) => logoMutation.mutate(file)}
        />
        <div className="space-y-1">
          <div className="text-sm font-bold text-mg-text-0">
            {tenant?.name}
          </div>
          <div className="text-xs text-mg-text-2">
            点击头像更换 · 支持 PNG/JPEG/WebP，最大 2MB
          </div>
        </div>
      </div>

      {/* 组织名称 */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-mg-text-1 uppercase tracking-wider block">组织名称</label>
        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && update.mutate()}
              autoFocus
              className="max-w-[280px] h-9 text-xs rounded-lg"
            />
            <Button
              variant="brand"
              disabled={update.isPending || name === tenant.name}
              onClick={() => update.mutate()}
              className="h-9 px-4 rounded-lg font-semibold text-xs bg-brand-base text-white hover:bg-brand-base/90"
            >
              {update.isPending ? '保存中...' : '保存'}
            </Button>
            <Button variant="outline" className="h-9 px-3 rounded-lg text-xs" onClick={() => setEditing(false)}>取消</Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-mg-text-0">{tenant.name}</span>
            {canEditOrg && (
              <button
                type="button"
                className="text-xs font-bold text-brand-base hover:text-brand-base/80 bg-transparent border-none p-0 cursor-pointer transition-colors"
                onClick={() => { setName(tenant.name); setEditing(true) }}
              >
                更名
              </button>
            )}
          </div>
        )}
      </div>

      {/* 信息网络 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-mg-border/40">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-mg-text-1 uppercase tracking-wider block">唯一标识 (Slug)</label>
          <span className="font-mono text-xs text-mg-text-0">@{tenant.slug}</span>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-mg-text-1 uppercase tracking-wider block">账户类型</label>
          <div>
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-brand-glow/8 text-brand-base border border-brand-base/15">
              {tenant.type === 'personal' ? '个人账户' : '企业组织'}
            </span>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-mg-text-1 uppercase tracking-wider block">Owner (所有者)</label>
          {owner ? (
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-mg-text-0">{owner.account.display_name || '—'}</div>
              <div className="text-[10px] text-mg-text-2">{owner.account.email}</div>
            </div>
          ) : (
            <span className="text-xs text-mg-text-2">{membersQuery.isLoading ? '…' : '—'}</span>
          )}
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-mg-text-1 uppercase tracking-wider block">最大工作区限制</label>
          <span className="text-xs text-mg-text-0 font-medium">{tenant.max_workspaces} 个</span>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-mg-text-1 uppercase tracking-wider block">最大成员数限制</label>
          <span className="text-xs text-mg-text-0 font-medium">{tenant.max_members} 人</span>
        </div>
      </div>
    </div>
  )
}

// ─── Members tab ──────────────────────────────────────────────────────────────
function MembersTab({ tenantId, canManage }: { tenantId: string; canManage: boolean }) {
  const qc = useQueryClient()
  const [removeTarget, setRemoveTarget] = useState<string | null>(null)

  const membersQuery = useQuery({
    queryKey: ['tenant-members', tenantId],
    queryFn: () => listTenantMembers(tenantId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  const changeRole = useMutation({
    mutationFn: (values: { accountId: string; role: 'tenant_admin' | 'tenant_member' }) =>
      updateTenantMemberRole(tenantId, values.accountId, values.role),
    onSuccess: () => { appToast.success('角色已更新'); qc.invalidateQueries({ queryKey: ['tenant-members', tenantId] }) },
    onError: (err: Error) => appToast.error(err?.message || '更新角色失败'),
  })

  const removeMember = useMutation({
    mutationFn: (accountId: string) => removeTenantMember(tenantId, accountId),
    onSuccess: () => {
      appToast.success('成员已移除')
      qc.invalidateQueries({ queryKey: ['tenant-members', tenantId] })
      setRemoveTarget(null)
    },
    onError: (err: Error) => appToast.error(err?.message || '移除成员失败'),
  })

  const members = membersQuery.data?.items ?? []

  return (
    <>
      <div className="bg-mg-bg-0 border border-mg-border/50 rounded-2xl overflow-hidden shadow-sm">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-mg-border/50 bg-mg-fill-0/20">
          <span className="text-xs font-bold text-mg-text-0">组织成员</span>
          <span className="text-[10px] text-mg-text-2 bg-mg-fill-1 border border-mg-border/40 px-2 py-0.5 rounded-full font-medium">
            {membersQuery.isLoading ? '…' : `${members.length} 位成员`}
          </span>
        </div>

        {/* 成员列表 */}
        <div className="overflow-x-auto w-full p-2">
          {membersQuery.isLoading ? (
            <div className="py-12 flex justify-center items-center">
              <div className="w-6 h-6 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-mg-border/50">
                  <th className="py-3 px-4 font-bold text-mg-text-2 text-[10px] uppercase tracking-wider">姓名 / 邮箱</th>
                  <th className="py-3 px-4 font-bold text-mg-text-2 text-[10px] uppercase tracking-wider">角色权限</th>
                  <th className="py-3 px-4 font-bold text-mg-text-2 text-[10px] uppercase tracking-wider">加入时间</th>
                  <th className="py-3 px-4 font-bold text-mg-text-2 text-[10px] uppercase tracking-wider text-center w-16">操作</th>
                </tr>
              </thead>
              <tbody>
                {members.map((record) => (
                  <tr
                    key={record.account.account_id}
                    className="border-b border-mg-border/40 hover:bg-mg-fill-0/30 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-mg-text-0">{record.account.display_name || '—'}</div>
                      <div className="text-[10px] text-mg-text-2 mt-0.5">{record.account.email}</div>
                    </td>
                    <td className="py-3 px-4">
                      {record.role === 'tenant_owner' ? (
                        <span className="inline-block text-[10px] text-mg-text-2 font-bold bg-mg-fill-1 border border-mg-border/40 px-2.5 py-0.5 rounded-full">Owner</span>
                      ) : canManage ? (
                        <select
                          value={record.role}
                          onChange={(e) => changeRole.mutate({ accountId: record.account.account_id, role: e.target.value as 'tenant_admin' | 'tenant_member' })}
                          className="modern-input-field h-8 text-[11px] py-0 pr-8 pl-2 bg-mg-bg-0 border border-mg-border/40 rounded-lg w-[120px] font-semibold cursor-pointer"
                        >
                          {TENANT_ROLE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="inline-block text-[11px] text-mg-text-1 font-semibold px-2.5 py-0.5">
                          {TENANT_ROLE_OPTIONS.find((o) => o.value === record.role)?.label ?? record.role}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[11px] text-mg-text-1 font-medium">
                      {formatDate(record.joined_at)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {record.role !== 'tenant_owner' && canManage ? (
                        <button
                          type="button"
                          onClick={() => setRemoveTarget(record.account.account_id)}
                          className="text-mg-text-2 hover:text-rose-500 hover:bg-rose-500/5 p-1 rounded-lg transition-all border-none bg-transparent cursor-pointer font-bold text-xs"
                        >
                          ✕
                        </button>
                      ) : (
                        <span className="text-mg-text-3">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 移除成员确认弹窗 */}
      <Modal
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        size="sm"
        title="确认移除成员"
        description="移除后该成员将无法访问此组织及其下的工作区，此操作不可撤销。"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="outline" className="h-8 px-3 rounded-lg text-xs" onClick={() => setRemoveTarget(null)}>
              取消
            </Button>
            <Button
              variant="brand"
              disabled={removeMember.isPending}
              onClick={() => removeMember.mutate(removeTarget!)}
              className="h-8 px-4 rounded-lg text-xs font-semibold bg-rose-500 text-white hover:bg-rose-500/90"
            >
              {removeMember.isPending ? '移除中...' : '确认移除'}
            </Button>
          </div>
        }
      />
    </>
  )
}

// ─── Invite tab ───────────────────────────────────────────────────────────────
function InviteTab({ tenantId }: { tenantId: string }) {
  const { hasPermission } = usePermissions()
  const canInvite = hasPermission(PERMS.ORG_INVITE_MANAGE)
  const qc = useQueryClient()
  const [inviteEmails, setInviteEmails] = useState('')
  const [inviteRole, setInviteRole] = useState<'tenant_admin' | 'tenant_member'>('tenant_member')
  const [expiresInHours, setExpiresInHours] = useState<number>(72)
  const [linkCopied, setLinkCopied] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const inviteLinkQuery = useQuery({
    queryKey: ['tenant-invite-link', tenantId],
    queryFn: () => getTenantInviteLink(tenantId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const resetLink = useMutation({
    mutationFn: () => resetTenantInviteLink(tenantId),
    onSuccess: () => {
      appToast.success('邀请链接已重置')
      qc.invalidateQueries({ queryKey: ['tenant-invite-link', tenantId] })
      setShowResetConfirm(false)
    },
    onError: (err: Error) => appToast.error(err?.message || '重置失败'),
  })

  const addMembers = useMutation({
    mutationFn: () => addTenantMembers(tenantId, {
      emails: inviteEmails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean),
      role: inviteRole,
      expires_in_hours: expiresInHours,
    }),
    onSuccess: () => { appToast.success('邀请已发出'); setInviteEmails(''); setExpiresInHours(72); qc.invalidateQueries({ queryKey: ['tenant-members', tenantId] }) },
    onError: (err: Error) => appToast.error(err?.message || '邀请失败'),
  })

  const inviteLinkUrl = inviteLinkQuery.data
    ? `${window.location.origin}/invitations/${inviteLinkQuery.data.token}`
    : null

  function handleCopyLink() {
    if (!inviteLinkUrl) return
    navigator.clipboard.writeText(inviteLinkUrl).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
      appToast.success('邀请链接已复制')
    })
  }

  return (
    <>
    <div className="space-y-6">
      {/* ── 邀请配置 ── */}
      <div className="bg-mg-bg-0 border border-mg-border/50 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-4 shadow-sm">
        <span className="text-xs font-bold text-mg-text-1 uppercase tracking-wider">邀请配置</span>
        <div className="flex gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-mg-border/40 bg-mg-fill-0/30 text-[11px] text-mg-text-2 font-semibold">
            初始角色
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'tenant_admin' | 'tenant_member')}
              className="bg-transparent border-none outline-none font-bold text-[11px] ml-1 cursor-pointer text-mg-text-0"
            >
              {TENANT_ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-mg-border/40 bg-mg-fill-0/30 text-[11px] text-mg-text-2 font-semibold">
            有效期
            <select
              value={expiresInHours}
              onChange={(e) => setExpiresInHours(Number(e.target.value))}
              className="bg-transparent border-none outline-none font-bold text-[11px] ml-1 cursor-pointer text-mg-text-0"
            >
              <option value={24}>24 小时</option>
              <option value={72}>3 天</option>
              <option value={168}>7 天</option>
              <option value={720}>30 天</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── 快速邀请链接 ── */}
      <div className="bg-mg-bg-0 border border-mg-border/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-mg-border/50 bg-mg-fill-0/20 flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="text-xs font-bold text-mg-text-0">快速邀请链接</div>
            <span className="text-[10px] text-mg-text-2">将此链接发送给同事，他们点击后可直接申请加入</span>
          </div>
          {canInvite && (
            <Button
              variant="outline"
              className="h-7 text-[10px] font-bold px-3 rounded-full border-mg-border/60 hover:bg-mg-fill-0"
              onClick={() => setShowResetConfirm(true)}
            >
              重置链接
            </Button>
          )}
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2">
            <div className="flex-1 p-2.5 rounded-lg border border-mg-border/40 bg-mg-fill-0/30 font-mono text-[11px] text-mg-text-1 overflow-hidden text-overflow-ellipsis white-space-nowrap select-all">
              {inviteLinkUrl ?? <span className="text-mg-text-3 italic">加载中…</span>}
            </div>
            <Button
              variant="brand"
              disabled={!inviteLinkUrl}
              onClick={handleCopyLink}
              className={`font-semibold h-9 px-4 rounded-lg text-xs transition-colors shrink-0 ${
                linkCopied
                  ? 'border-emerald-500 bg-transparent text-emerald-500 hover:bg-emerald-500/5'
                  : 'bg-brand-base text-white hover:bg-brand-base/90'
              }`}
            >
              {linkCopied ? '已复制' : '复制链接'}
            </Button>
          </div>
        </div>
      </div>

      {/* ── 邮箱邀请 ── */}
      <div className="bg-mg-bg-0 border border-mg-border/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-mg-border/50 bg-mg-fill-0/20">
          <div className="text-xs font-bold text-mg-text-0">邮箱邀请</div>
          <span className="text-[10px] text-mg-text-2">直接向特定邮箱发送邀请邮件</span>
        </div>
        <div className="p-4 flex gap-2 items-end flex-wrap md:flex-nowrap">
          <div className="flex-1 min-w-[200px] space-y-1">
            <label className="text-[10px] font-bold text-mg-text-1 uppercase tracking-wider block">成员邮箱</label>
            <Input
              placeholder="example@company.com，多个用逗号分隔"
              value={inviteEmails}
              onChange={(e) => setInviteEmails(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addMembers.mutate()}
              className="h-9 text-xs rounded-lg"
            />
          </div>
          {canInvite && (
            <Button
              variant="brand"
              className="font-semibold h-9 px-4 rounded-lg text-xs bg-brand-base text-white hover:bg-brand-base/90 shrink-0"
              onClick={() => addMembers.mutate()}
            >
              发送邀请
            </Button>
          )}
        </div>
      </div>
    </div>

    {/* 重置邀请链接确认弹窗 */}
    <Modal
      open={showResetConfirm}
      onClose={() => setShowResetConfirm(false)}
      size="sm"
      title="确认重置邀请链接"
      description="重置后当前邀请链接立即失效，确认重置？"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="outline" className="h-8 px-3 rounded-lg text-xs" onClick={() => setShowResetConfirm(false)}>
            取消
          </Button>
          <Button
            variant="brand"
            disabled={resetLink.isPending}
            onClick={() => resetLink.mutate()}
            className="h-8 px-4 rounded-lg text-xs font-semibold bg-brand-base text-white hover:bg-brand-base/90"
          >
            {resetLink.isPending ? '重置中...' : '确认重置'}
          </Button>
        </div>
      }
    />
    </>
  )
}

// ─── Management panel ─────────────────────────────────────────────────────────
function OrgManagePanel({ tenantId }: { tenantId: string | null }) {
  const tenantsQuery = useQuery({ queryKey: ['tenants'], queryFn: listTenants, staleTime: 30_000 })
  // Hooks 必须无条件调用（rules-of-hooks）：原先位于 early-return 之后，
  // tenantId 在空/非空之间切换会改变 Hook 调用顺序——真实潜在崩溃点。
  const sessionTenants = useAuthStore((s) => s.tenants)
  const [activeSubTab, setActiveSubTab] = useState<'info' | 'members' | 'invite'>('members')

  if (!tenantId) {
    return (
      <div className="bg-mg-bg-0 border border-mg-border/50 border-dashed rounded-2xl p-12 text-center flex flex-col items-center justify-center min-h-[360px] space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-base/5 to-brand-base/10 border border-brand-base/10 flex items-center justify-center shadow-inner relative overflow-hidden">
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
  const { hasPermission } = usePermissions()
  const canManageMembers = isRoleAdmin && hasPermission(PERMS.ORG_MEMBERS_MANAGE)
  const canManageInvite  = isRoleAdmin && hasPermission(PERMS.ORG_INVITE_MANAGE)
  const canManage = canManageMembers
  const tenantName = tenant?.name
    || sessionTenants.find((t) => t.tenant_id === tenantId)?.name
    || '…'

  return (
    <div className="space-y-6">
      {/* 正在管理展示 */}
      <div className="flex items-center justify-between p-4 bg-mg-bg-0 border border-mg-border/50 rounded-2xl shadow-xs">
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
        {activeSubTab === 'info' && <OrgInfoTab tenantId={tenantId} />}
        {activeSubTab === 'members' && <MembersTab tenantId={tenantId} canManage={canManage} />}
        {canManageInvite && activeSubTab === 'invite' && <InviteTab tenantId={tenantId} />}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function OrganizationSettingsPage() {
  const { activeTenantId } = useAuthStore()
  const [managingId, setManagingId] = useState<string | null>(activeTenantId ?? null)

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-mg-text-0 tracking-tight">
          企业管理
        </h1>
        <p className="text-xs text-mg-text-2 mt-1">
          一个账号最多创建 {MAX_TENANTS} 个企业。在左侧选择需要管理的企业，可在右侧进行信息维护、成员管理与成员邀请。
        </p>
      </div>

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
