import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Modal, Select, Table, Tabs, Tag, Toast, Typography } from '@douyinfe/semi-ui'
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

const { Text } = Typography

const MAX_TENANTS = 5

// ─── Shared styles ────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--semi-color-bg-0)',
  borderRadius: '12px',
  border: '1px solid var(--semi-color-fill-0)',
  overflow: 'hidden',
  boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
  marginBottom: '24px',
}

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--semi-color-text-1)',
  display: 'block',
  marginBottom: '6px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

// ─── Role badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: TenantItem['role'] }) {
  const s = TENANT_ROLE_CONFIG[role]
  return (
    <span style={{ fontSize: '11px', fontWeight: 600, color: s.color, backgroundColor: s.bg, border: `1px solid ${s.border}`, borderRadius: '100px', padding: '2px 8px' }}>
      {s.label}
    </span>
  )
}

// ─── Org list section ─────────────────────────────────────────────────────────

function OrgListSection({
  selectedId,
  onSelect,
}: {
  selectedId: string | null
  onSelect: (id: string) => void
}) {
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
      Toast.success(`组织「${org.name}」已创建`)
      setCreateVisible(false)
      setNewName('')
      setNewSlug('')
      qc.invalidateQueries({ queryKey: ['tenants'] })
      onSelect(org.tenant_id)
    },
    onError: (err: any) => {
      Toast.error(err?.message || '创建失败')
    },
  })

  function handleCreate() {
    if (!newName.trim()) { Toast.error('组织名称不能为空'); return }
    if (!newSlug.trim()) { Toast.error('唯一标识不能为空'); return }
    if (!/^[a-z0-9-]+$/.test(newSlug)) { Toast.error('唯一标识仅支持小写字母、数字和连字符'); return }
    createMutation.mutate()
  }

  const columns = [
    {
      title: '组织名称',
      dataIndex: 'name',
      render: (v: string, record: TenantItem) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--semi-color-text-0)' }}>{v}</span>
          {record.is_default && (
            <Tag size="small" style={{ fontSize: '11px', borderRadius: '100px' }}>默认</Tag>
          )}
        </div>
      ),
    },
    {
      title: '我的角色',
      dataIndex: 'role',
      render: (v: TenantItem['role']) => <RoleBadge role={v} />,
    },
    {
      title: '类型',
      dataIndex: 'type',
      render: (v: string) => (
        <span style={{ fontSize: '13px', color: 'var(--semi-color-text-1)' }}>
          {v === 'personal' ? '个人' : '企业'}
        </span>
      ),
    },
    {
      title: '工作区',
      dataIndex: 'current_workspace_count',
      render: (v: number, record: TenantItem) => (
        <span style={{ fontSize: '13px', color: 'var(--semi-color-text-1)' }}>
          {v} / {record.max_workspaces}
        </span>
      ),
    },
    {
      title: '操作',
      dataIndex: 'tenant_id',
      render: (_: unknown, record: TenantItem) => (
        <span
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: selectedId === record.tenant_id ? 'var(--semi-color-primary)' : '#0066ff',
            cursor: 'pointer',
            transition: 'color 0.2s',
          }}
          onClick={() => onSelect(record.tenant_id)}
        >
          {selectedId === record.tenant_id ? '管理中 ↓' : '管理'}
        </span>
      ),
    },
  ]

  return (
    <div style={cardStyle}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 24px',
        borderBottom: '1px solid var(--semi-color-fill-0)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--semi-color-text-0)' }}>
            我的组织
          </span>
          <span style={{
            fontSize: '12px',
            color: atLimit ? '#ef4444' : 'var(--semi-color-text-2)',
            backgroundColor: atLimit ? '#fef2f2' : 'var(--semi-color-bg-1)',
            border: `1px solid ${atLimit ? '#fecaca' : 'var(--semi-color-border)'}`,
            borderRadius: '100px',
            padding: '1px 8px',
            fontWeight: 500,
          }}>
            {tenants.length} / {MAX_TENANTS}
          </span>
        </div>
        <Button
          theme="solid"
          icon={<LuPlus />}
          disabled={atLimit}
          onClick={() => setCreateVisible(true)}
          style={{
            borderRadius: '24px',
            fontSize: '13px',
            fontWeight: 600,
            height: '36px',
          }}
        >
          创建组织
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={tenants}
        rowKey="tenant_id"
        loading={tenantsQuery.isLoading}
        pagination={false}
        style={{ borderRadius: 0 }}
        onRow={(record: TenantItem | undefined) => ({
          style: {
            backgroundColor: record && selectedId === record.tenant_id
              ? 'rgba(var(--semi-color-primary-rgb, 99,102,241), 0.04)'
              : undefined,
          },
        })}
      />

      <Modal
        title="创建新组织"
        visible={createVisible}
        onOk={handleCreate}
        onCancel={() => setCreateVisible(false)}
        confirmLoading={createMutation.isPending}
        width={460}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '16px 0' }}>
          <div>
            <label style={labelStyle}>组织名称</label>
            <Input value={newName} onChange={(v) => setNewName(v)} placeholder="如：我的团队" style={{ borderRadius: '8px' }} />
          </div>
          <div>
            <label style={labelStyle}>唯一标识 (Slug)</label>
            <Input value={newSlug} onChange={(v) => setNewSlug(v)} placeholder="如：my-team" style={{ borderRadius: '8px' }} />
            <Text style={{ fontSize: '12px', color: 'var(--semi-color-text-2)', marginTop: '4px', display: 'block' }}>
              仅支持小写字母、数字和连字符
            </Text>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── Org info tab ─────────────────────────────────────────────────────────────

function OrgInfoTab({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(false)
  const [logoHover, setLogoHover] = useState(false)

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
      Toast.success('组织名称已更新')
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] })
      qc.invalidateQueries({ queryKey: ['tenants'] })
      setEditing(false)
    },
    onError: (err: any) => Toast.error(err?.message || '更新失败'),
  })

  const logoMutation = useMutation({
    mutationFn: (file: File) => uploadTenantLogo(tenantId, file),
    onSuccess: () => {
      Toast.success('组织头像已更新')
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] })
      qc.invalidateQueries({ queryKey: ['tenants'] })
    },
    onError: (err: any) => Toast.error(err?.message || '上传失败，请重试'),
  })

  function handleLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      Toast.error('图片大小不能超过 2MB')
      return
    }
    logoMutation.mutate(file)
    e.target.value = ''
  }

  if (tenantQuery.isLoading) {
    return (
      <div style={{ height: 100, backgroundColor: 'var(--semi-color-fill-0)', borderRadius: '8px', animation: 'pulse 1.5s ease-in-out infinite' }} />
    )
  }

  if (!tenant) return null

  const logoLetter = tenant?.name.charAt(0).toUpperCase() ?? '?'

  return (
    <div style={{ ...cardStyle, maxWidth: '640px' }}>
      <div style={{ padding: '20px 24px' }}>
        {/* 组织头像 */}
        <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <label
            htmlFor="org-logo-upload"
            style={{ cursor: logoMutation.isPending ? 'wait' : 'pointer', flexShrink: 0 }}
            onMouseEnter={() => setLogoHover(true)}
            onMouseLeave={() => setLogoHover(false)}
          >
            <div style={{
              width: '72px', height: '72px', borderRadius: '16px', overflow: 'hidden',
              position: 'relative', border: '2px solid var(--semi-color-fill-0)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'var(--semi-color-bg-1)',
              transition: 'border-color 0.15s',
              borderColor: logoHover ? 'var(--semi-color-primary)' : undefined,
            }}>
              {tenant?.logo_url
                ? <img src={tenant.logo_url} alt={tenant.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: '28px', fontWeight: 700, color: 'var(--semi-color-text-1)' }}>{logoLetter}</span>
              }
              {/* 悬停遮罩 */}
              {(logoHover || logoMutation.isPending) && (
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '14px',
                  backgroundColor: 'rgba(0,0,0,0.45)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: 600, color: '#fff', letterSpacing: '0.02em',
                }}>
                  {logoMutation.isPending ? '上传中…' : '更换'}
                </div>
              )}
            </div>
            <input
              id="org-logo-upload"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={handleLogoFileChange}
            />
          </label>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--semi-color-text-0)', marginBottom: '4px' }}>
              {tenant?.name}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--semi-color-text-2)' }}>
              点击头像更换 · PNG/JPEG/WebP，最大 2MB
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={labelStyle}>组织名称</label>
          {editing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Input value={name} onChange={(v) => setName(v)} onKeyDown={(e) => e.key === 'Enter' && update.mutate()} autoFocus style={{ maxWidth: '320px' }} />
              <Button theme="solid" loading={update.isPending} disabled={update.isPending || name === tenant.name} onClick={() => update.mutate()}>保存</Button>
              <Button onClick={() => setEditing(false)}>取消</Button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '20px', fontWeight: 500, color: 'var(--semi-color-text-0)' }}>{tenant.name}</span>
              <button type="button" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '12px', fontWeight: 500, color: 'var(--semi-color-primary)' }} onClick={() => { setName(tenant.name); setEditing(true) }}>更名</button>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', paddingTop: '16px', borderTop: '1px solid var(--semi-color-fill-0)' }}>
          <div>
            <label style={labelStyle}>Slug</label>
            <span style={{ fontFamily: 'monospace', fontSize: '14px', color: 'var(--semi-color-text-0)' }}>{tenant.slug}</span>
          </div>
          <div>
            <label style={labelStyle}>账户类型</label>
            <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '6px', fontSize: '13px', backgroundColor: 'rgba(var(--semi-color-primary-rgb, 99,102,241),0.06)', color: 'var(--semi-color-primary)', border: '1px solid rgba(var(--semi-color-primary-rgb, 99,102,241),0.2)' }}>
              {tenant.type === 'personal' ? '个人账户' : '企业组织'}
            </span>
          </div>
          <div>
            <label style={labelStyle}>Owner</label>
            {owner ? (
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--semi-color-text-0)' }}>{owner.account.display_name || '—'}</div>
                <div style={{ fontSize: '12px', color: 'var(--semi-color-text-2)', marginTop: '2px' }}>{owner.account.email}</div>
              </div>
            ) : (
              <span style={{ fontSize: '14px', color: 'var(--semi-color-text-2)' }}>{membersQuery.isLoading ? '…' : '—'}</span>
            )}
          </div>
          <div>
            <label style={labelStyle}>最大工作区数</label>
            <span style={{ fontSize: '14px', color: 'var(--semi-color-text-0)' }}>{tenant.max_workspaces}</span>
          </div>
          <div>
            <label style={labelStyle}>最大成员数</label>
            <span style={{ fontSize: '14px', color: 'var(--semi-color-text-0)' }}>{tenant.max_members}</span>
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
    onSuccess: () => { Toast.success('角色已更新'); qc.invalidateQueries({ queryKey: ['tenant-members', tenantId] }) },
    onError: (err: any) => Toast.error(err?.message || '更新角色失败'),
  })

  const removeMember = useMutation({
    mutationFn: (accountId: string) => removeTenantMember(tenantId, accountId),
    onSuccess: () => { Toast.success('成员已移除'); qc.invalidateQueries({ queryKey: ['tenant-members', tenantId] }) },
    onError: (err: any) => Toast.error(err?.message || '移除成员失败'),
  })

  const members = membersQuery.data?.items ?? []

  const columns = [
    {
      title: '姓名 / 邮箱',
      dataIndex: 'account',
      render: (_: unknown, record: (typeof members)[number]) => (
        <div>
          <div style={{ fontWeight: 500, color: 'var(--semi-color-text-0)', fontSize: '14px' }}>{record.account.display_name || '—'}</div>
          <div style={{ color: 'var(--semi-color-text-1)', fontSize: '12px', marginTop: '2px' }}>{record.account.email}</div>
        </div>
      ),
    },
    {
      title: '角色权限',
      dataIndex: 'role',
      render: (_: unknown, record: (typeof members)[number]) => (
        <Select
          value={record.role}
          onChange={(value) => changeRole.mutate({ accountId: record.account.account_id, role: value as 'tenant_admin' | 'tenant_member' })}
          style={{ width: '130px' }}
          disabled={record.role === 'tenant_owner'}
        >
          {TENANT_ROLE_OPTIONS.map((o) => <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>)}
        </Select>
      ),
    },
    {
      title: '加入时间',
      dataIndex: 'joined_at',
      render: (val: string) => (
        <span style={{ color: 'var(--semi-color-text-1)', fontSize: '14px' }}>{formatDate(val)}</span>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: unknown, record: (typeof members)[number]) => (
        <button
          type="button"
          disabled={record.role === 'tenant_owner'}
          style={{ background: 'none', border: 'none', cursor: record.role === 'tenant_owner' ? 'not-allowed' : 'pointer', padding: '6px', borderRadius: '6px', color: 'var(--semi-color-text-3)', opacity: record.role === 'tenant_owner' ? 0.3 : 1 }}
          onMouseEnter={(e) => { if (record.role !== 'tenant_owner') { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = '#ef4444' } }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--semi-color-text-3)' }}
          onClick={() => record.role !== 'tenant_owner' && removeMember.mutate(record.account.account_id)}
        >
          ✕
        </button>
      ),
    },
  ]

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--semi-color-fill-0)' }}>
        <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--semi-color-text-0)' }}>组织成员</span>
        <span style={{ fontSize: '12px', color: 'var(--semi-color-text-1)', padding: '2px 10px', borderRadius: '6px', border: '1px solid var(--semi-color-border)', backgroundColor: 'var(--semi-color-bg-1)' }}>
          {membersQuery.isLoading ? '…' : `${members.length} 位成员`}
        </span>
      </div>
      <Table
        columns={columns}
        dataSource={members}
        rowKey={(record) => record?.account?.account_id || ''}
        loading={membersQuery.isLoading}
        pagination={false}
        style={{ borderRadius: 0 }}
      />
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
    onSuccess: () => { Toast.success('邀请链接已重置'); qc.invalidateQueries({ queryKey: ['tenant-invite-link', tenantId] }) },
    onError: (err: any) => Toast.error(err?.message || '重置失败'),
  })

  const addMembers = useMutation({
    mutationFn: () => addTenantMembers(tenantId, {
      emails: inviteEmails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean),
      role: inviteRole,
      expires_in_hours: expiresInHours,
    }),
    onSuccess: () => { Toast.success('邀请已发出'); setInviteEmails(''); setExpiresInHours(72); qc.invalidateQueries({ queryKey: ['tenant-members', tenantId] }) },
    onError: (err: any) => Toast.error(err?.message || '邀请失败'),
  })

  const inviteLinkUrl = inviteLinkQuery.data
    ? `${window.location.origin}/invitations/${inviteLinkQuery.data.token}`
    : null

  function handleCopyLink() {
    if (!inviteLinkUrl) return
    navigator.clipboard.writeText(inviteLinkUrl).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
      Toast.success('邀请链接已复制')
    })
  }

  return (
    <div style={{ maxWidth: '640px' }}>
      <div style={cardStyle}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--semi-color-fill-0)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--semi-color-text-0)', marginBottom: '4px' }}>快速邀请链接</div>
            <Text style={{ color: 'var(--semi-color-text-1)', fontSize: '13px' }}>将此链接发送给同事，他们点击后可直接申请加入</Text>
          </div>
          <Button size="small" loading={resetLink.isPending} onClick={() => resetLink.mutate()} style={{ flexShrink: 0, marginLeft: '16px' }}>重置链接</Button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--semi-color-border)', backgroundColor: 'var(--semi-color-bg-1)', fontFamily: 'monospace', fontSize: '13px', color: 'var(--semi-color-text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {inviteLinkUrl ?? <span style={{ color: 'var(--semi-color-text-2)', fontStyle: 'italic' }}>加载中…</span>}
            </div>
            <Button theme="solid" disabled={!inviteLinkUrl} onClick={handleCopyLink} style={linkCopied ? { borderColor: '#10b981', backgroundColor: 'transparent', color: '#10b981' } : undefined}>
              {linkCopied ? '已复制' : '复制链接'}
            </Button>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--semi-color-fill-0)' }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--semi-color-text-0)', marginBottom: '4px' }}>邮箱邀请</div>
          <Text style={{ color: 'var(--semi-color-text-1)', fontSize: '13px' }}>直接向特定邮箱发送邀请邮件</Text>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={labelStyle}>成员邮箱</label>
            <Input placeholder="example@company.com，多个用逗号分隔" value={inviteEmails} onChange={(val) => setInviteEmails(val)} onKeyDown={(e) => e.key === 'Enter' && addMembers.mutate()} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>邀请配置</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 12px', height: '32px', borderRadius: '8px', border: '1px solid var(--semi-color-border)', backgroundColor: 'var(--semi-color-bg-1)', fontSize: '12px', color: 'var(--semi-color-text-2)', fontWeight: 500 }}>
                  初始角色
                  <Select value={inviteRole} onChange={(v) => setInviteRole(v as any)} style={{ width: '100px', marginLeft: '2px' }} size="small" borderless>
                    {TENANT_ROLE_OPTIONS.map((o) => <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>)}
                  </Select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 12px', height: '32px', borderRadius: '8px', border: '1px solid var(--semi-color-border)', backgroundColor: 'var(--semi-color-bg-1)', fontSize: '12px', color: 'var(--semi-color-text-2)', fontWeight: 500 }}>
                  有效期
                  <Select value={expiresInHours} onChange={(v) => setExpiresInHours(v as number)} style={{ width: '100px', marginLeft: '2px' }} size="small" borderless>
                    <Select.Option value={24}>24 小时</Select.Option>
                    <Select.Option value={72}>3 天</Select.Option>
                    <Select.Option value={168}>7 天</Select.Option>
                    <Select.Option value={720}>30 天</Select.Option>
                  </Select>
                </div>
              </div>
            </div>
            <Button theme="solid" loading={addMembers.isPending} onClick={() => addMembers.mutate()} style={{ flexShrink: 0, height: '32px' }}>发送邀请</Button>
          </div>
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

  // session 里已有 tenants（含 name），作为 listTenants 未就绪时的即时 fallback
  const sessionTenants = useAuthStore((s) => s.tenants)
  const tenantName = tenant?.name
    || sessionTenants.find((t) => t.tenant_id === tenantId)?.name
    || '…'

  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '20px',
        paddingBottom: '16px',
        borderBottom: '2px solid var(--semi-color-primary)',
      }}>
        <span style={{ fontSize: '13px', color: 'var(--semi-color-text-2)' }}>正在管理：</span>
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--semi-color-text-0)' }}>
          {tenantName}
        </span>
        {tenant && <RoleBadge role={tenant.role} />}
      </div>

      <Tabs defaultActiveKey="info">
        <Tabs.TabPane tab="基本信息" itemKey="info">
          <div style={{ paddingTop: '20px' }}>
            <OrgInfoTab tenantId={tenantId} />
          </div>
        </Tabs.TabPane>
        <Tabs.TabPane tab="组织成员" itemKey="members">
          <div style={{ paddingTop: '20px' }}>
            <MembersTab tenantId={tenantId} />
          </div>
        </Tabs.TabPane>
        {canManage && (
          <Tabs.TabPane tab="邀请成员" itemKey="invite">
            <div style={{ paddingTop: '20px' }}>
              <InviteTab tenantId={tenantId} />
            </div>
          </Tabs.TabPane>
        )}

      </Tabs>
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
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--semi-color-text-0)', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
          组织管理
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', margin: 0 }}>
          一个账号最多创建 {MAX_TENANTS} 个组织，点击「管理」进入组织详情。
        </p>
      </div>

      <OrgListSection selectedId={managingId} onSelect={setManagingId} />

      {managingId && <OrgManagePanel key={managingId} tenantId={managingId} />}
    </div>
  )
}
