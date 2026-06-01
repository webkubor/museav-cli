import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LuPlus } from 'react-icons/lu'
import { useAuthStore } from '@/store/auth'
import {
  addTenantMembers,
  createTenant,
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
import { appToast } from '@/lib/app-toast'

const MAX_TENANTS = 5

const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--mg-bg-0)',
  borderRadius: '12px',
  border: '1px solid var(--mg-fill-0)',
  overflow: 'hidden',
  boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
  marginBottom: '24px',
}

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--mg-text-1)',
  display: 'block',
  marginBottom: '6px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

function RoleBadge({ role }: { role: TenantItem['role'] }) {
  const s = TENANT_ROLE_CONFIG[role]
  return <Badge variant={s.variant}>{s.label}</Badge>
}

// ─── Org list section ─────────────────────────────────────────────────────────
interface OrgListSectionProps {
  selectedId: string | null
  onSelect: (id: string) => void
}

function OrgListSection({ selectedId, onSelect }: OrgListSectionProps) {
  const qc = useQueryClient()
  const [createVisible, setCreateVisible] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSlug, setNewSlug] = useState('')

  const tenantsQuery = useQuery({
    queryKey: ['tenants'],
    queryFn: listTenants,
    staleTime: 30_000,
  })

  const tenants = tenantsQuery.data?.items ?? []
  const atLimit = tenants.length >= MAX_TENANTS

  const createMutation = useMutation({
    mutationFn: () => createTenant({ name: newName.trim(), slug: newSlug.trim(), type: 'enterprise' }),
    onSuccess: (org) => {
      appToast.success(`组织「${org.name}」已创建`)
      setCreateVisible(false)
      setNewName('')
      setNewSlug('')
      qc.invalidateQueries({ queryKey: ['tenants'] })
      onSelect(org.tenant_id)
    },
    onError: (err: any) => {
      appToast.error(err?.message || '创建失败')
    },
  })

  function handleCreate() {
    if (!newName.trim()) { appToast.error('组织名称不能为空'); return }
    if (!newSlug.trim()) { appToast.error('唯一标识不能为空'); return }
    if (!/^[a-z0-9-]+$/.test(newSlug)) { appToast.error('唯一标识仅支持小写字母、数字和连字符'); return }
    createMutation.mutate()
  }

  return (
    <div style={cardStyle}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 24px',
        borderBottom: '1px solid var(--mg-fill-0)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--mg-text-0)' }}>
            我的组织
          </span>
          <span style={{
            fontSize: '12px',
            color: atLimit ? 'var(--mg-danger)' : 'var(--mg-text-2)',
            backgroundColor: atLimit ? 'rgba(239,68,68,0.08)' : 'var(--mg-bg-1)',
            border: `1px solid ${atLimit ? 'rgba(239,68,68,0.3)' : 'var(--mg-border)'}`,
            borderRadius: '100px',
            padding: '1px 8px',
            fontWeight: 500,
          }}>
            {tenants.length} / {MAX_TENANTS}
          </span>
        </div>
        <Button
          variant="default"
          disabled={atLimit}
          onClick={() => setCreateVisible(true)}
          className="rounded-[24px] text-xs font-semibold h-9 flex items-center gap-1"
        >
          <LuPlus size={14} />
          创建组织
        </Button>
      </div>

      <div className="overflow-x-auto w-full p-2">
        {tenantsQuery.isLoading ? (
          <div className="py-12 flex justify-center items-center">
            <div className="w-8 h-8 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-mg-border">
                <th className="py-3 px-4 font-semibold text-mg-text-2 text-xs">组织名称</th>
                <th className="py-3 px-4 font-semibold text-mg-text-2 text-xs">我的角色</th>
                <th className="py-3 px-4 font-semibold text-mg-text-2 text-xs">类型</th>
                <th className="py-3 px-4 font-semibold text-mg-text-2 text-xs">工作区</th>
                <th className="py-3 px-4 font-semibold text-gray-400 dark:text-gray-500 text-xs w-24">操作</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((record: TenantItem) => (
                <tr
                  key={record.tenant_id}
                  className={`border-b border-gray-100/50 dark:border-gray-800/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors ${
                    selectedId === record.tenant_id ? 'bg-brand-glow/5 dark:bg-brand-glow/3' : ''
                  }`}
                >
                  <td className="py-3 px-4 font-semibold text-mg-text-0 text-xs">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>{record.name}</span>
                      {record.is_default && (
                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5 rounded-full font-bold">默认</Badge>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <RoleBadge role={record.role} />
                  </td>
                  <td className="py-3 px-4 text-xs text-mg-text-1">
                    {record.type === 'personal' ? '个人' : '企业'}
                  </td>
                  <td className="py-3 px-4 text-xs text-mg-text-1">
                    {record.current_workspace_count} / {record.max_workspaces}
                  </td>
                  <td className="py-3 px-4 text-xs">
                    <button
                      onClick={() => onSelect(record.tenant_id)}
                      className={`bg-none border-none font-bold cursor-pointer transition-colors p-0 ${
                        selectedId === record.tenant_id ? 'text-brand-base' : 'text-blue-500 hover:text-blue-600'
                      }`}
                    >
                      {selectedId === record.tenant_id ? '管理中 ↓' : '管理'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 创建新组织 Modal (手写玻璃态) */}
      {createVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCreateVisible(false)} />
          <div className="relative bg-card-bg border border-mg-border rounded-2xl w-full max-w-[460px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-5 border-b border-mg-border flex justify-between items-center bg-mg-fill-0">
              <h2 className="text-base font-bold text-mg-text-0">创建新组织</h2>
              <button className="text-mg-text-2 hover:text-mg-text-0 text-sm font-semibold transition-colors" onClick={() => setCreateVisible(false)}>✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label style={labelStyle}>组织名称</label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="如：我的团队" className="rounded-lg w-full" />
              </div>
              <div>
                <label style={labelStyle}>唯一标识 (Slug)</label>
                <Input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="如：my-team" className="rounded-lg w-full" />
                <span className="text-xs text-mg-text-2 mt-1.5 block">
                  仅支持小写字母、数字和连字符
                </span>
              </div>
            </div>
            <div className="p-5 border-t border-mg-border flex justify-end gap-2 bg-mg-fill-0">
              <Button variant="outline" className="h-9 px-4 rounded-lg text-xs" onClick={() => setCreateVisible(false)}>取消</Button>
              <Button
                variant="default"
                className="h-9 px-4 rounded-lg text-xs font-semibold"
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
    onError: (err: any) => appToast.error(err?.message || '更新失败'),
  })

  const logoMutation = useMutation({
    mutationFn: (file: File) => uploadTenantLogo(tenantId, file),
    onSuccess: () => {
      appToast.success('企业头像已更新')
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] })
      qc.invalidateQueries({ queryKey: ['tenants'] })
    },
    onError: (err: any) => appToast.error(err?.message || '上传失败，请重试'),
  })

  if (tenantQuery.isLoading) {
    return (
      <div className="h-28 bg-mg-fill-2 rounded-xl animate-pulse" />
    )
  }

  if (!tenant) return null

  return (
    <div style={{ ...cardStyle, maxWidth: '640px' }}>
      <div style={{ padding: '20px 24px' }}>
        {/* 企业头像 */}
        <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <AvatarUpload
            src={tenant.logo_url}
            fallback={tenant.name.charAt(0).toUpperCase()}
            size={72}
            loading={logoMutation.isPending}
            onUpload={(file) => logoMutation.mutate(file)}
          />
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--mg-text-0)', marginBottom: '4px' }}>
              {tenant?.name}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--mg-text-2)' }}>
              点击头像更换 · PNG/JPEG/WebP，最大 2MB
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={labelStyle}>组织名称</label>
          {editing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && update.mutate()}
                autoFocus
                style={{ maxWidth: '320px' }}
              />
              <Button
                variant="default"
                disabled={update.isPending || name === tenant.name}
                onClick={() => update.mutate()}
                className="h-9 px-4 rounded-lg font-semibold"
              >
                {update.isPending ? '保存中...' : '保存'}
              </Button>
              <Button variant="outline" className="h-9 px-4 rounded-lg text-xs" onClick={() => setEditing(false)}>取消</Button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '20px', fontWeight: 500, color: 'var(--mg-text-0)' }}>{tenant.name}</span>
              <button type="button" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '12px', fontWeight: 500, color: 'var(--mg-primary)' }} onClick={() => { setName(tenant.name); setEditing(true) }}>更名</button>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', paddingTop: '16px', borderTop: '1px solid var(--mg-fill-0)' }}>
          <div>
            <label style={labelStyle}>Slug</label>
            <span style={{ fontFamily: 'monospace', fontSize: '14px', color: 'var(--mg-text-0)' }}>{tenant.slug}</span>
          </div>
          <div>
            <label style={labelStyle}>账户类型</label>
            <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '6px', fontSize: '13px', backgroundColor: 'rgba(var(--mg-primary-rgb, 99,102,241),0.06)', color: 'var(--mg-primary)', border: '1px solid rgba(var(--mg-primary-rgb, 99,102,241),0.2)' }}>
              {tenant.type === 'personal' ? '个人账户' : '企业组织'}
            </span>
          </div>
          <div>
            <label style={labelStyle}>Owner</label>
            {owner ? (
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--mg-text-0)' }}>{owner.account.display_name || '—'}</div>
                <div style={{ fontSize: '12px', color: 'var(--mg-text-2)', marginTop: '2px' }}>{owner.account.email}</div>
              </div>
            ) : (
              <span style={{ fontSize: '14px', color: 'var(--mg-text-2)' }}>{membersQuery.isLoading ? '…' : '—'}</span>
            )}
          </div>
          <div>
            <label style={labelStyle}>最大工作区数</label>
            <span style={{ fontSize: '14px', color: 'var(--mg-text-0)' }}>{tenant.max_workspaces}</span>
          </div>
          <div>
            <label style={labelStyle}>最大成员数</label>
            <span style={{ fontSize: '14px', color: 'var(--mg-text-0)' }}>{tenant.max_members}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Members tab ──────────────────────────────────────────────────────────────
function MembersTab({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient()

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
    onError: (err: any) => appToast.error(err?.message || '更新角色失败'),
  })

  const removeMember = useMutation({
    mutationFn: (accountId: string) => removeTenantMember(tenantId, accountId),
    onSuccess: () => { appToast.success('成员已移除'); qc.invalidateQueries({ queryKey: ['tenant-members', tenantId] }) },
    onError: (err: any) => appToast.error(err?.message || '移除成员失败'),
  })

  const members = membersQuery.data?.items ?? []

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--mg-fill-0)' }}>
        <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--mg-text-0)' }}>组织成员</span>
        <span style={{ fontSize: '12px', color: 'var(--mg-text-1)', padding: '2px 10px', borderRadius: '6px', border: '1px solid var(--mg-border)', backgroundColor: 'var(--mg-bg-1)' }}>
          {membersQuery.isLoading ? '…' : `${members.length} 位成员`}
        </span>
      </div>

      <div className="overflow-x-auto w-full p-2">
        {membersQuery.isLoading ? (
          <div className="py-12 flex justify-center items-center">
            <div className="w-8 h-8 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-mg-border">
                <th className="py-3 px-4 font-semibold text-mg-text-2 text-xs">姓名 / 邮箱</th>
                <th className="py-3 px-4 font-semibold text-mg-text-2 text-xs">角色权限</th>
                <th className="py-3 px-4 font-semibold text-mg-text-2 text-xs">加入时间</th>
                <th className="py-3 px-4 font-semibold text-gray-400 dark:text-gray-500 text-xs w-16">操作</th>
              </tr>
            </thead>
            <tbody>
              {members.map((record) => (
                <tr
                  key={record.account.account_id}
                  className="border-b border-mg-border hover:bg-mg-fill-0 transition-colors"
                >
                  <td className="py-3 px-4">
                    <div style={{ fontWeight: 500, color: 'var(--mg-text-0)', fontSize: '14px' }}>{record.account.display_name || '—'}</div>
                    <div style={{ color: 'var(--mg-text-1)', fontSize: '12px', marginTop: '2px' }}>{record.account.email}</div>
                  </td>
                  <td className="py-3 px-4">
                    {record.role === 'tenant_owner' ? (
                      <span className="text-xs text-mg-text-2 font-semibold px-2 py-1">Owner</span>
                    ) : (
                      <select
                        value={record.role}
                        onChange={(e) => changeRole.mutate({ accountId: record.account.account_id, role: e.target.value as any })}
                        className="modern-input-field h-8 text-xs py-0 pr-8 pl-2 bg-mg-bg-0 w-[130px]"
                      >
                        {TENANT_ROLE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="py-3 px-4 text-xs text-mg-text-1">
                    {formatDate(record.joined_at)}
                  </td>
                  <td className="py-3 px-4 text-xs text-center">
                    {record.role !== 'tenant_owner' ? (
                      <button
                        type="button"
                        onClick={() => removeMember.mutate(record.account.account_id)}
                        className="text-mg-text-2 hover:text-mg-danger hover:bg-rose-50 dark:hover:bg-rose-950/20 p-1.5 rounded-lg transition-all border-none bg-transparent cursor-pointer font-semibold"
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
  )
}

// ─── Invite tab ───────────────────────────────────────────────────────────────
function InviteTab({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient()
  const [inviteEmails, setInviteEmails] = useState('')
  const [inviteRole, setInviteRole] = useState<'tenant_admin' | 'tenant_member'>('tenant_member')
  const [expiresInHours, setExpiresInHours] = useState<number>(72)
  const [linkCopied, setLinkCopied] = useState(false)

  const inviteLinkQuery = useQuery({
    queryKey: ['tenant-invite-link', tenantId],
    queryFn: () => getTenantInviteLink(tenantId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const resetLink = useMutation({
    mutationFn: () => resetTenantInviteLink(tenantId),
    onSuccess: () => { appToast.success('邀请链接已重置'); qc.invalidateQueries({ queryKey: ['tenant-invite-link', tenantId] }) },
    onError: (err: any) => appToast.error(err?.message || '重置失败'),
  })

  const addMembers = useMutation({
    mutationFn: () => addTenantMembers(tenantId, {
      emails: inviteEmails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean),
      role: inviteRole,
      expires_in_hours: expiresInHours,
    }),
    onSuccess: () => { appToast.success('邀请已发出'); setInviteEmails(''); setExpiresInHours(72); qc.invalidateQueries({ queryKey: ['tenant-members', tenantId] }) },
    onError: (err: any) => appToast.error(err?.message || '邀请失败'),
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
    <div style={{ maxWidth: '640px' }}>
      {/* ── 邀请配置 ──────────────────────────────── */}
      <div style={{ ...cardStyle, padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '24px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--mg-text-1)', flexShrink: 0 }}>邀请配置</span>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 12px', height: '32px', borderRadius: '8px', border: '1px solid var(--mg-border)', backgroundColor: 'var(--mg-bg-1)', fontSize: '12px', color: 'var(--mg-text-2)', fontWeight: 500 }}>
            初始角色
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as any)}
              className="bg-transparent border-none outline-none font-semibold text-xs ml-1 cursor-pointer"
            >
              {TENANT_ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 12px', height: '32px', borderRadius: '8px', border: '1px solid var(--mg-border)', backgroundColor: 'var(--mg-bg-1)', fontSize: '12px', color: 'var(--mg-text-2)', fontWeight: 500 }}>
            有效期
            <select
              value={expiresInHours}
              onChange={(e) => setExpiresInHours(Number(e.target.value))}
              className="bg-transparent border-none outline-none font-semibold text-xs ml-1 cursor-pointer"
            >
              <option value={24}>24 小时</option>
              <option value={72}>3 天</option>
              <option value={168}>7 天</option>
              <option value={720}>30 天</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── 快速邀请链接 ──────────────────────────────────── */}
      <div style={cardStyle}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--mg-fill-0)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--mg-text-0)', marginBottom: '4px' }}>快速邀请链接</div>
            <span style={{ color: 'var(--mg-text-1)', fontSize: '13px' }}>将此链接发送给同事，他们点击后可直接申请加入</span>
          </div>
          <Button variant="outline" className="h-8 text-xs font-semibold px-3" onClick={() => resetLink.mutate()}>重置链接</Button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--mg-border)', backgroundColor: 'var(--mg-bg-1)', fontFamily: 'monospace', fontSize: '13px', color: 'var(--mg-text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {inviteLinkUrl ?? <span style={{ color: 'var(--mg-text-2)', fontStyle: 'italic' }}>加载中…</span>}
            </div>
            <Button
              variant="default"
              disabled={!inviteLinkUrl}
              onClick={handleCopyLink}
              className={`font-semibold h-10 px-5 rounded-[8px] border transition-colors ${
                linkCopied ? 'border-emerald-500 bg-transparent text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/20' : ''
              }`}
            >
              {linkCopied ? '已复制' : '复制链接'}
            </Button>
          </div>
        </div>
      </div>

      {/* ── 邮箱邀请 ─────────────────────────────────────── */}
      <div style={cardStyle}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--mg-fill-0)' }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--mg-text-0)', marginBottom: '4px' }}>邮箱邀请</div>
          <span style={{ color: 'var(--mg-text-1)', fontSize: '13px' }}>直接向特定邮箱发送邀请邮件</span>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>成员邮箱</label>
            <Input placeholder="example@company.com，多个用逗号分隔" value={inviteEmails} onChange={(e) => setInviteEmails(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMembers.mutate()} />
          </div>
          <Button variant="default" className="font-semibold h-10 px-5 rounded-[8px]" onClick={() => addMembers.mutate()}>发送邀请</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Management panel ─────────────────────────────────────────────────────────
function OrgManagePanel({ tenantId }: { tenantId: string }) {
  const tenantsQuery = useQuery({ queryKey: ['tenants'], queryFn: listTenants, staleTime: 30_000 })
  const tenant = tenantsQuery.data?.items.find((t) => t.tenant_id === tenantId)
  const canManage = tenant?.role === 'tenant_owner' || tenant?.role === 'tenant_admin'

  const sessionTenants = useAuthStore((s) => s.tenants)
  const tenantName = tenant?.name
    || sessionTenants.find((t) => t.tenant_id === tenantId)?.name
    || '…'

  const [activeSubTab, setActiveSubTab] = useState<'info' | 'members' | 'invite'>('info')

  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '20px',
        paddingBottom: '16px',
        borderBottom: '2px solid var(--mg-primary)',
      }}>
        <span style={{ fontSize: '13px', color: 'var(--mg-text-2)' }}>正在管理：</span>
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--mg-text-0)' }}>
          {tenantName}
        </span>
        {tenant && <RoleBadge role={tenant.role} />}
      </div>

      <div className="border-b border-mg-border flex gap-6 text-sm mb-6 bg-transparent">
        <button
          onClick={() => setActiveSubTab('info')}
          className={`pb-3 font-semibold transition-all border-b-2 cursor-pointer bg-transparent border-none ${
            activeSubTab === 'info'
              ? 'border-brand-base text-brand-base'
              : 'border-transparent text-mg-text-2 hover:text-mg-text-0'
          }`}
        >
          基本信息
        </button>
        <button
          onClick={() => setActiveSubTab('members')}
          className={`pb-3 font-semibold transition-all border-b-2 cursor-pointer bg-transparent border-none ${
            activeSubTab === 'members'
              ? 'border-brand-base text-brand-base'
              : 'border-transparent text-mg-text-2 hover:text-mg-text-0'
          }`}
        >
          组织成员
        </button>
        {canManage && (
          <button
            onClick={() => setActiveSubTab('invite')}
            className={`pb-3 font-semibold transition-all border-b-2 cursor-pointer bg-transparent border-none ${
              activeSubTab === 'invite'
                ? 'border-brand-base text-brand-base'
                : 'border-transparent text-mg-text-2 hover:text-mg-text-0'
            }`}
          >
            邀请成员
          </button>
        )}
      </div>

      <div style={{ paddingTop: '8px' }}>
        {activeSubTab === 'info' && <OrgInfoTab tenantId={tenantId} />}
        {activeSubTab === 'members' && <MembersTab tenantId={tenantId} />}
        {canManage && activeSubTab === 'invite' && <InviteTab tenantId={tenantId} />}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function OrganizationSettingsPage() {
  const { activeTenantId } = useAuthStore()
  const [managingId, setManagingId] = useState<string | null>(activeTenantId ?? null)

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--mg-text-0)', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
          组织管理
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--mg-text-1)', margin: 0 }}>
          一个账号最多创建 {MAX_TENANTS} 个组织，点击「管理」进入组织详情。
        </p>
      </div>

      <OrgListSection selectedId={managingId} onSelect={setManagingId} />

      {managingId && <OrgManagePanel key={managingId} tenantId={managingId} />}
    </div>
  )
}
