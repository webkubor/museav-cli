import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Select, Table, Tabs, Toast, Typography } from '@douyinfe/semi-ui'
import { useAuthStore } from '@/store/auth'
import {
  addTenantMembers,
  getTenant,
  getTenantInviteLink,
  listTenantMembers,
  removeTenantMember,
  resetTenantInviteLink,
  updateTenant,
  updateTenantMemberRole,
} from '@/services/tenants'

const { Title, Text } = Typography

// ─── Shared styles ────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--semi-color-bg-0)',
  borderRadius: '12px',
  border: '1px solid var(--semi-color-fill-0)',
  padding: '28px',
  boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
  marginBottom: '24px',
}

const cardTitleStyle: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: 600,
  color: 'var(--semi-color-text-0)',
  marginBottom: '20px',
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

// ─── Tab: 基本信息 ────────────────────────────────────────────────────────────

function OrgInfoTab({ tenantId }: { tenantId: string | null | undefined }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(false)

  const tenantQuery = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => getTenant(tenantId!),
    enabled: Boolean(tenantId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const tenant = tenantQuery.data

  const update = useMutation({
    mutationFn: () => updateTenant(tenantId!, { name }),
    onSuccess: () => {
      Toast.success('组织名称已更新')
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] })
      qc.invalidateQueries({ queryKey: ['tenants'] })
      setEditing(false)
    },
    onError: (err: any) => {
      Toast.error(err?.message || '更新失败，请重试')
    },
  })

  function startEdit() {
    setName(tenant?.name ?? '')
    setEditing(true)
  }

  if (tenantQuery.isLoading) {
    return (
      <div style={{ ...cardStyle, maxWidth: '640px' }}>
        <div
          style={{
            height: '128px',
            backgroundColor: 'var(--semi-color-fill-0)',
            borderRadius: '8px',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      </div>
    )
  }

  if (!tenant) {
    return (
      <div
        style={{
          height: '128px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '12px',
          border: '1px dashed var(--semi-color-border)',
          backgroundColor: 'var(--semi-color-bg-1)',
        }}
      >
        <Text style={{ color: 'var(--semi-color-text-2)', fontSize: '14px' }}>暂无组织信息</Text>
      </div>
    )
  }

  return (
    <div style={{ ...cardStyle, maxWidth: '640px' }}>
      <div style={{ marginBottom: '24px' }}>
        <span style={labelStyle}>组织名称</span>
        {editing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Input
              value={name}
              onChange={(val) => setName(val)}
              onKeyDown={(e) => e.key === 'Enter' && update.mutate()}
              autoFocus
              style={{ maxWidth: '320px' }}
            />
            <Button
              theme="solid"
              loading={update.isPending}
              disabled={update.isPending || name === tenant.name}
              onClick={() => update.mutate()}
            >
              保存
            </Button>
            <Button onClick={() => setEditing(false)}>取消</Button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '20px', fontWeight: 500, color: 'var(--semi-color-text-0)' }}>
              {tenant.name}
            </span>
            <button
              type="button"
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--semi-color-primary)',
              }}
              onClick={startEdit}
            >
              更名
            </button>
          </div>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '24px',
          paddingTop: '16px',
          borderTop: '1px solid var(--semi-color-fill-0)',
        }}
      >
        <div>
          <span style={labelStyle}>Slug</span>
          <Text style={{ fontFamily: 'monospace', fontSize: '14px', color: 'var(--semi-color-text-0)' }}>
            {tenant.slug}
          </Text>
        </div>
        <div>
          <span style={labelStyle}>账户类型</span>
          <span
            style={{
              display: 'inline-block',
              padding: '2px 10px',
              borderRadius: '6px',
              fontSize: '13px',
              backgroundColor: 'rgba(var(--semi-color-primary-rgb, 99,102,241),0.06)',
              color: 'var(--semi-color-primary)',
              border: '1px solid rgba(var(--semi-color-primary-rgb, 99,102,241),0.2)',
            }}
          >
            {tenant.type === 'personal' ? '个人账户' : '企业组织'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: 成员列表 ────────────────────────────────────────────────────────────

function MembersTab({ tenantId }: { tenantId: string | null | undefined }) {
  const qc = useQueryClient()

  const membersQuery = useQuery({
    queryKey: ['tenant-members', tenantId],
    queryFn: () => listTenantMembers(tenantId!),
    enabled: Boolean(tenantId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  const changeRole = useMutation({
    mutationFn: (values: { accountId: string; role: 'tenant_admin' | 'tenant_member' }) =>
      updateTenantMemberRole(tenantId!, values.accountId, values.role),
    onSuccess: () => {
      Toast.success('角色已更新')
      qc.invalidateQueries({ queryKey: ['tenant-members', tenantId] })
    },
    onError: (err: any) => {
      Toast.error(err?.message || '更新角色失败')
    },
  })

  const removeMember = useMutation({
    mutationFn: (accountId: string) => removeTenantMember(tenantId!, accountId),
    onSuccess: () => {
      Toast.success('成员已移除')
      qc.invalidateQueries({ queryKey: ['tenant-members', tenantId] })
    },
    onError: (err: any) => {
      Toast.error(err?.message || '移除成员失败')
    },
  })

  const members = membersQuery.data?.items ?? []

  const columns = [
    {
      title: '姓名 / 邮箱',
      dataIndex: 'account',
      key: 'account',
      render: (_: unknown, record: (typeof members)[number]) => (
        <div>
          <div style={{ fontWeight: 500, color: 'var(--semi-color-text-0)', fontSize: '14px' }}>
            {record.account.display_name || '—'}
          </div>
          <div style={{ color: 'var(--semi-color-text-1)', fontSize: '12px', marginTop: '2px' }}>
            {record.account.email}
          </div>
        </div>
      ),
    },
    {
      title: '角色权限',
      dataIndex: 'role',
      key: 'role',
      render: (_: unknown, record: (typeof members)[number]) => (
        <Select
          value={record.role}
          onChange={(value) =>
            changeRole.mutate({
              accountId: record.account.account_id,
              role: value as 'tenant_admin' | 'tenant_member',
            })
          }
          style={{ width: '130px' }}
          disabled={record.role === 'tenant_owner'}
        >
          <Select.Option value="tenant_admin">Admin</Select.Option>
          <Select.Option value="tenant_member">Member</Select.Option>
        </Select>
      ),
    },
    {
      title: '加入时间',
      dataIndex: 'joined_at',
      key: 'joined_at',
      render: (val: string) => (
        <span style={{ color: 'var(--semi-color-text-1)', fontSize: '14px' }}>
          {new Date(val).toLocaleDateString('zh-CN')}
        </span>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: unknown, record: (typeof members)[number]) => (
        <button
          type="button"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '6px',
            color: 'var(--semi-color-text-3)',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(239,68,68,0.08)'
            ;(e.currentTarget as HTMLButtonElement).style.color = '#ef4444'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
            ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--semi-color-text-3)'
          }}
          onClick={() => removeMember.mutate(record.account.account_id)}
          disabled={record.role === 'tenant_owner'}
        >
          ✕
        </button>
      ),
    },
  ]

  return (
    <div style={cardStyle}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
        }}
      >
        <div style={cardTitleStyle}>组织成员</div>
        <span
          style={{
            fontSize: '12px',
            color: 'var(--semi-color-text-1)',
            padding: '2px 10px',
            borderRadius: '6px',
            border: '1px solid var(--semi-color-border)',
            backgroundColor: 'var(--semi-color-bg-1)',
          }}
        >
          {membersQuery.isLoading ? '…' : `${members.length} 位成员`}
        </span>
      </div>
      <Table
        columns={columns}
        dataSource={members}
        rowKey={(record) => record?.account?.account_id || ''}
        loading={membersQuery.isLoading}
        pagination={false}
        empty={
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--semi-color-text-2)', fontSize: '14px' }}>
            暂无成员
          </div>
        }
      />
    </div>
  )
}

// ─── Tab: 邀请成员 ────────────────────────────────────────────────────────────

function InviteTab({ tenantId }: { tenantId: string | null | undefined }) {
  const qc = useQueryClient()
  const [inviteEmails, setInviteEmails] = useState('')
  const [inviteRole, setInviteRole] = useState<'tenant_admin' | 'tenant_member'>('tenant_member')
  const [linkCopied, setLinkCopied] = useState(false)

  const inviteLinkQuery = useQuery({
    queryKey: ['tenant-invite-link', tenantId],
    queryFn: () => getTenantInviteLink(tenantId!),
    enabled: Boolean(tenantId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const resetLink = useMutation({
    mutationFn: () => resetTenantInviteLink(tenantId!),
    onSuccess: () => {
      Toast.success('邀请链接已重置')
      qc.invalidateQueries({ queryKey: ['tenant-invite-link', tenantId] })
    },
    onError: (err: any) => {
      Toast.error(err?.message || '重置失败，请重试')
    },
  })

  const addMembers = useMutation({
    mutationFn: () =>
      addTenantMembers(tenantId!, {
        emails: inviteEmails
          .split(/[\s,;]+/)
          .map((e) => e.trim())
          .filter(Boolean),
        role: inviteRole,
      }),
    onSuccess: () => {
      Toast.success('邀请已发出')
      setInviteEmails('')
      qc.invalidateQueries({ queryKey: ['tenant-members', tenantId] })
    },
    onError: (err: any) => {
      Toast.error(err?.message || '邀请失败，请重试')
    },
  })

  const inviteLink = inviteLinkQuery.data
  const inviteLinkUrl = inviteLink
    ? `${window.location.origin}/invitations/${inviteLink.token}`
    : null

  function handleCopyLink() {
    if (!inviteLinkUrl) return
    navigator.clipboard.writeText(inviteLinkUrl).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
      Toast.success('邀请链接已复制')
    })
  }

  function handleInvite() {
    if (!tenantId) return Toast.error('未选择组织')
    if (!inviteEmails.trim()) return Toast.error('请输入成员邮箱')
    addMembers.mutate()
  }

  return (
    <div style={{ maxWidth: '640px' }}>
      {/* 邀请链接 */}
      <div style={cardStyle}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            marginBottom: '20px',
          }}
        >
          <div>
            <div style={cardTitleStyle}>快速邀请链接</div>
            <Text style={{ color: 'var(--semi-color-text-1)', fontSize: '13px' }}>
              将此链接发送给同事，他们点击后可直接申请加入当前组织
            </Text>
          </div>
          <Button
            size="small"
            loading={resetLink.isPending}
            disabled={!inviteLink || resetLink.isPending}
            onClick={() => resetLink.mutate()}
            style={{ flexShrink: 0, marginLeft: '16px' }}
          >
            重置链接
          </Button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {inviteLinkQuery.isLoading ? (
            <div
              style={{
                flex: 1,
                height: '40px',
                backgroundColor: 'var(--semi-color-fill-0)',
                borderRadius: '8px',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
          ) : (
            <div
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--semi-color-border)',
                backgroundColor: 'var(--semi-color-bg-1)',
                fontFamily: 'monospace',
                fontSize: '13px',
                color: 'var(--semi-color-text-0)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {inviteLinkUrl ?? (
                <span style={{ color: 'var(--semi-color-text-2)', fontStyle: 'italic' }}>
                  {window.location.origin}/invitations/&#123;token&#125;
                </span>
              )}
            </div>
          )}
          <Button
            theme="solid"
            disabled={!inviteLinkUrl || inviteLinkQuery.isLoading}
            onClick={handleCopyLink}
            style={
              linkCopied
                ? { borderColor: '#10b981', backgroundColor: 'transparent', color: '#10b981' }
                : undefined
            }
          >
            {linkCopied ? '已复制' : '复制链接'}
          </Button>
        </div>

        <div style={{ marginTop: '10px' }}>
          <Text style={{ fontSize: '12px', color: 'var(--semi-color-text-2)' }}>
            落地页路径：
            <code
              style={{
                backgroundColor: 'var(--semi-color-fill-0)',
                borderRadius: '4px',
                padding: '1px 6px',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
            >
              /invitations/:token
            </code>
          </Text>
          {inviteLinkQuery.isError && (
            <button
              type="button"
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                marginLeft: '12px',
                fontSize: '12px',
                color: 'var(--semi-color-primary)',
                textDecoration: 'underline',
              }}
              onClick={() => inviteLinkQuery.refetch()}
            >
              加载失败，点击重试
            </button>
          )}
        </div>
      </div>

      {/* 邮箱邀请 */}
      <div style={cardStyle}>
        <div style={{ marginBottom: '20px' }}>
          <div style={cardTitleStyle}>邮箱邀请</div>
          <Text style={{ color: 'var(--semi-color-text-1)', fontSize: '13px' }}>直接向特定邮箱发送邀请邮件</Text>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '16px' }}>
          <div style={{ flex: 1, minWidth: '280px' }}>
            <span style={labelStyle}>成员邮箱</span>
            <Input
              placeholder="example@company.com，多个用逗号分隔"
              value={inviteEmails}
              onChange={(val) => setInviteEmails(val)}
              onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
            />
          </div>
          <div style={{ width: '130px' }}>
            <span style={labelStyle}>初始角色</span>
            <Select
              value={inviteRole}
              onChange={(v) => setInviteRole(v as 'tenant_admin' | 'tenant_member')}
              style={{ width: '100%' }}
            >
              <Select.Option value="tenant_admin">Admin</Select.Option>
              <Select.Option value="tenant_member">Member</Select.Option>
            </Select>
          </div>
          <Button
            theme="solid"
            loading={addMembers.isPending}
            onClick={handleInvite}
            style={{ flexShrink: 0 }}
          >
            发送邀请
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function OrganizationSettingsPage() {
  const { activeTenantId } = useAuthStore()

  return (
    <div style={{ maxWidth: '800px' }}>
      <div style={{ marginBottom: '32px' }}>
        <Title
          heading={2}
          style={{ fontSize: '24px', fontWeight: 700, color: 'var(--semi-color-text-0)', margin: 0 }}
        >
          组织管理
        </Title>
        <Text style={{ color: 'var(--semi-color-text-1)', fontSize: '14px', marginTop: '6px', display: 'block' }}>
          管理组织基本信息与成员邀请。
        </Text>
      </div>

      <Tabs defaultActiveKey="info" style={{ marginTop: '0' }}>
        <Tabs.TabPane tab="基本信息" itemKey="info">
          <div style={{ paddingTop: '24px' }}>
            <OrgInfoTab tenantId={activeTenantId} />
          </div>
        </Tabs.TabPane>
        <Tabs.TabPane tab="组织成员" itemKey="members">
          <div style={{ paddingTop: '24px' }}>
            <MembersTab tenantId={activeTenantId} />
          </div>
        </Tabs.TabPane>
        <Tabs.TabPane tab="邀请成员" itemKey="invite">
          <div style={{ paddingTop: '24px' }}>
            <InviteTab tenantId={activeTenantId} />
          </div>
        </Tabs.TabPane>
      </Tabs>
    </div>
  )
}
