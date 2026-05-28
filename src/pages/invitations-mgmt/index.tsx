import { useState, useMemo } from 'react'
import { Avatar, Button, Checkbox, Input, Modal, Spin, Table, Tag, Toast, Select } from '@douyinfe/semi-ui'
import { LuSearch, LuUserPlus } from 'react-icons/lu'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import {
  listInvitations,
  revokeInvitation,
  createInvitations,
} from '@/services/invitations'
import { listTenantMembers } from '@/services/tenants'
import { listWorkspaces } from '@/services/workspaces'
import type { InvitationItem, TenantMember, WorkspaceItem } from '@/types'
import { formatDateTime } from '@/lib/format-date'
import { WS_ROLE_LABEL, WS_ROLE_OPTIONS, TENANT_ROLE_LABEL } from '@/constants/roles'
import { INVITATION_STATUS_CONFIG, INVITATION_STATUS_OPTIONS } from '@/constants/status'


export default function InvitationsMgmtPage() {
  const qc = useQueryClient()
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const tenants = useAuthStore((s) => s.tenants)
  const activeTenant = tenants.find((t) => t.tenant_id === activeTenantId)

  // 当前用户在此工作区的角色，ws_member 不能邀请/撤销
  const { data: workspaces = [] } = useQuery<WorkspaceItem[]>({
    queryKey: ['workspaces', activeTenantId],
    queryFn: () => listWorkspaces().then((r) => r.items || []),
    enabled: !!activeTenantId,
    staleTime: 60_000,
  })
  const myRole = workspaces.find((w) => w.workspace_id === activeWorkspaceId)?.my_role
  const canManage = myRole !== 'ws_member'
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
      Toast.success('邀请已发出')
      setModalOpen(false)
      setSelectedIds(new Set())
      setSearch('')
      setExpiresInHours(72)
      qc.invalidateQueries({ queryKey: ['workspace-invitations', activeWorkspaceId] })
    },
    onError: (err: any) => Toast.error(err?.message || '邀请失败'),
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
      Toast.success('邀请已撤销')
      qc.invalidateQueries({ queryKey: ['workspace-invitations', activeWorkspaceId] })
    },
    onError: (err: any) => {
      Toast.error(err?.message || '撤销邀请失败')
    },
  })

  const invitations = invitationsQuery.data?.items ?? []

  // ─── Table columns ────────────────────────────────────────────────────────
  const columns = [
    {
      title: '邮箱',
      dataIndex: 'email',
      render: (text: string) => (
        <span style={{ fontWeight: 600, color: 'var(--semi-color-text-0)', fontSize: '13.5px' }}>{text}</span>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      render: (r: InvitationItem['role']) => (
        <Tag
          style={{
            backgroundColor: 'var(--semi-color-fill-0)',
            color: 'var(--semi-color-text-1)',
            border: '1px solid var(--semi-color-border)',
            fontSize: '11px',
            fontWeight: 600,
            borderRadius: '4px',
          }}
        >
          {WS_ROLE_LABEL[r]}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (s: InvitationItem['status']) => {
        const cfg = INVITATION_STATUS_CONFIG[s]
        return (
          <Tag
            style={{
              backgroundColor: cfg.bg,
              color: cfg.color,
              border: `1px solid ${cfg.border}`,
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '12px',
            }}
          >
            {cfg.label}
          </Tag>
        )
      },
    },
    {
      title: '过期时间',
      dataIndex: 'expires_at',
      render: (val: string) => (
        <span style={{ color: 'var(--semi-color-text-1)', fontSize: '13px' }}>{formatDateTime(val)}</span>
      ),
    },
    {
      title: '操作',
      dataIndex: 'actions',
      render: (_: unknown, record: InvitationItem) =>
        record.status === 'pending' ? (
          canManage ? (
          <span
            style={{
              color: '#ef4444',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '13px',
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#dc2626')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#ef4444')}
            onClick={() => revokeMutation.mutate(record.invitation_id)}
          >
            撤销
          </span>
          ) : (
            <span style={{ color: 'var(--semi-color-text-3)', fontSize: '13px' }}>—</span>
          )
        ) : (
          <span style={{ color: 'var(--semi-color-text-3)', fontSize: '13px' }}>—</span>
        ),
    },
  ]

  // ─── Render ───────────────────────────────────────────────────────────────
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
          <Button theme="solid" icon={<LuUserPlus />} onClick={handleOpenModal}>
            邀请成员
          </Button>
        )}
      </div>

      {/* ── 邀请成员弹窗 ──────────────────────────────────────────────────── */}
      <Modal
        title="邀请组织成员"
        visible={modalOpen}
        onCancel={() => setModalOpen(false)}
        width={520}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--semi-color-text-2)', fontWeight: 500 }}>角色</span>
                <Select value={inviteRole} onChange={(v) => setInviteRole(v as 'ws_member' | 'ws_admin')} style={{ width: '110px' }} size="small">
                  {WS_ROLE_OPTIONS.map((o) => <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>)}
                </Select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--semi-color-text-2)', fontWeight: 500 }}>有效期</span>
                <Select value={expiresInHours} onChange={(v) => setExpiresInHours(v as number)} style={{ width: '110px' }} size="small">
                  <Select.Option value={24}>24 小时</Select.Option>
                  <Select.Option value={72}>3 天</Select.Option>
                  <Select.Option value={168}>7 天</Select.Option>
                  <Select.Option value={720}>30 天</Select.Option>
                </Select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button onClick={() => setModalOpen(false)}>取消</Button>
              <Button
                theme="solid"
                disabled={selectedIds.size === 0}
                loading={sendInvitesMutation.isPending}
                onClick={() => sendInvitesMutation.mutate()}
              >
                发送邀请 {selectedIds.size > 0 && `(${selectedIds.size})`}
              </Button>
            </div>
          </div>
        }
      >
        <Input
          prefix={<LuSearch />}
          placeholder="搜索姓名或邮箱"
          value={search}
          onChange={setSearch}
          style={{ marginBottom: '12px' }}
        />
        {orgMembersQuery.isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin /></div>
        ) : (
          <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
            {filteredMembers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--semi-color-text-2)', fontSize: '14px' }}>
                暂无匹配成员
              </div>
            ) : (
              filteredMembers.map((m: TenantMember) => (
                <div
                  key={m.account.account_id}
                  onClick={() => toggleMember(m.account.account_id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    background: selectedIds.has(m.account.account_id) ? 'var(--semi-color-primary-light-default)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!selectedIds.has(m.account.account_id))
                      e.currentTarget.style.background = 'var(--semi-color-fill-0)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = selectedIds.has(m.account.account_id)
                      ? 'var(--semi-color-primary-light-default)'
                      : 'transparent'
                  }}
                >
                  <Checkbox checked={selectedIds.has(m.account.account_id)} onChange={() => toggleMember(m.account.account_id)} />
                  <Avatar size="small" src={m.account.avatar_url ?? undefined} style={{ flexShrink: 0 }}>
                    {m.account.display_name[0]}
                  </Avatar>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--semi-color-text-0)' }}>
                      {m.account.display_name}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--semi-color-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.account.email}
                    </div>
                  </div>
                  <Tag style={{ fontSize: '11px', flexShrink: 0, borderRadius: '4px' }}>
                    {TENANT_ROLE_LABEL[m.role]}
                  </Tag>
                </div>
              ))
            )}
          </div>
        )}
      </Modal>

      {/* ── 邀请记录列表 ──────────────────────────────────────────────────── */}
      <div
        style={{
          background: 'var(--semi-color-bg-0)',
          border: '1px solid var(--semi-color-border)',
          borderRadius: '12px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '18px 24px',
            borderBottom: '1px solid var(--semi-color-fill-0)',
          }}
        >
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--semi-color-text-0)', margin: 0 }}>
            邀请记录
          </h3>
          <Select
            value={status}
            onChange={(v) =>
              setStatus(v as 'pending' | 'accepted' | 'expired' | 'revoked' | 'all')
            }
            style={{ width: '120px' }}
          >
            {INVITATION_STATUS_OPTIONS.map((o) => <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>)}
          </Select>
        </div>
        <div style={{ padding: '0 8px' }}>
          <Table
            columns={columns}
            dataSource={invitations}
            loading={invitationsQuery.isLoading}
            pagination={false}
            bordered={false}
            empty={
              <div
                style={{
                  padding: '48px 0',
                  textAlign: 'center',
                  color: 'var(--semi-color-text-2)',
                  fontSize: '14px',
                }}
              >
                暂无邀请记录
              </div>
            }
          />
        </div>
      </div>
    </div>
  )
}
