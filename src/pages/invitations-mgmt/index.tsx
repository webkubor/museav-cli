import { useState } from 'react'
import { Table, Button, Input, Tag, Toast, Select } from '@douyinfe/semi-ui'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import {
  createInvitations,
  listInvitations,
  revokeInvitation,
  getInviteLink,
  resetInviteLink,
} from '@/services/invitations'
import type { InvitationItem } from '@/types'
import { formatDateTime } from '@/lib/format-date'

const STATUS_STYLE: Record<InvitationItem['status'], { color: string; bg: string; border: string }> = {
  pending:  { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  accepted: { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  expired:  { color: 'var(--semi-color-text-2)', bg: 'var(--semi-color-bg-1)', border: 'var(--semi-color-border)' },
  revoked:  { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
}

const STATUS_LABEL: Record<InvitationItem['status'] | 'all', string> = {
  pending:  '待接受',
  accepted: '已接受',
  expired:  '已过期',
  revoked:  '已撤销',
  all:      '全部',
}

const ROLE_LABEL: Record<'ws_member' | 'ws_admin', string> = {
  ws_member: '成员',
  ws_admin:  '管理员',
}


export default function InvitationsMgmtPage() {
  const qc = useQueryClient()
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)

  const [emailInput, setEmailInput] = useState('')
  const [role, setRole] = useState<'ws_member' | 'ws_admin'>('ws_member')
  const [status, setStatus] = useState<'pending' | 'accepted' | 'expired' | 'revoked' | 'all'>('pending')
  const [copied, setCopied] = useState(false)

  // ─── Invite link ──────────────────────────────────────────────────────────
  const inviteLinkQuery = useQuery({
    queryKey: ['workspace-invite-link', activeWorkspaceId],
    queryFn: () => getInviteLink(activeWorkspaceId!),
    enabled: Boolean(activeWorkspaceId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const resetLinkMutation = useMutation({
    mutationFn: (linkRole: 'ws_member' | 'ws_admin') =>
      resetInviteLink(activeWorkspaceId!, linkRole),
    onSuccess: () => {
      Toast.success('邀请链接已重置')
      qc.invalidateQueries({ queryKey: ['workspace-invite-link', activeWorkspaceId] })
    },
    onError: (err: any) => {
      Toast.error(err?.message || '重置链接失败')
    },
  })

  // ─── Invitation list ──────────────────────────────────────────────────────
  const invitationsQuery = useQuery({
    queryKey: ['workspace-invitations', activeWorkspaceId, status],
    queryFn: () => listInvitations(activeWorkspaceId!, { status }),
    enabled: Boolean(activeWorkspaceId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  // ─── Create invitations ───────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (emails: string[]) =>
      createInvitations(activeWorkspaceId!, {
        invites: emails.map((email) => ({ email, role })),
        expires_in_hours: 168,
      }),
    onSuccess: (result) => {
      Toast.success(`已成功发送 ${result.items.length} 封邀请邮件`)
      setEmailInput('')
      qc.invalidateQueries({ queryKey: ['workspace-invitations', activeWorkspaceId] })
    },
    onError: (err: any) => {
      Toast.error(err?.message || '发送邀请失败')
    },
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

  // ─── Derived values ───────────────────────────────────────────────────────
  const inviteLink = inviteLinkQuery.data
  const inviteLinkBase = `${window.location.origin}/invitations/`
  const inviteLinkUrl = inviteLink ? `${inviteLinkBase}${inviteLink.token}` : ''
  const invitations = invitationsQuery.data?.items ?? []

  // ─── Handlers ─────────────────────────────────────────────────────────────
  function handleCopyLink() {
    if (!inviteLinkUrl) return
    navigator.clipboard.writeText(inviteLinkUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      Toast.success('邀请链接已复制')
    })
  }

  function handleSendInvites() {
    const raw = emailInput.trim()
    if (!raw) {
      Toast.error('请输入邮箱地址')
      return
    }
    const emails = raw
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    const invalid = emails.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    if (invalid.length > 0) {
      Toast.error(`以下邮箱格式无效：${invalid.join('、')}`)
      return
    }
    createMutation.mutate(emails)
  }

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
          {ROLE_LABEL[r]}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (s: InvitationItem['status']) => {
        const style = STATUS_STYLE[s]
        return (
          <Tag
            style={{
              backgroundColor: style.bg,
              color: style.color,
              border: `1px solid ${style.border}`,
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '12px',
            }}
          >
            {STATUS_LABEL[s]}
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
        ),
    },
  ]

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div>
      {/* 页面标题 */}
      <div style={{ marginBottom: '28px' }}>
        <h1
          style={{
            fontSize: '24px',
            fontWeight: 700,
            color: 'var(--semi-color-text-0)',
            margin: '0 0 6px 0',
            letterSpacing: '-0.02em',
          }}
        >
          工作区邀请管理
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', margin: 0 }}>
          通过邮箱或邀请链接将成员加入当前工作区。
        </p>
      </div>

      {/* ── 邀请链接区块 ─────────────────────────────────────────────────── */}
      <div
        style={{
          background: 'var(--semi-color-bg-0)',
          border: '1px solid var(--semi-color-border)',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '20px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--semi-color-text-0)', margin: 0 }}>
            开放邀请链接
          </h3>
          <span
            style={{
              fontSize: '12px',
              color: 'var(--semi-color-text-1)',
              background: 'var(--semi-color-fill-0)',
              border: '1px solid var(--semi-color-border)',
              borderRadius: '999px',
              padding: '2px 10px',
            }}
          >
            角色：{ROLE_LABEL[inviteLink?.role ?? 'ws_member']}
          </span>
        </div>

        {/* 链接展示 + 复制按钮 */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div
            style={{
              flex: 1,
              background: 'var(--semi-color-bg-1)',
              border: '1px solid var(--semi-color-border)',
              borderRadius: '8px',
              padding: '10px 14px',
              fontFamily: 'monospace',
              fontSize: '13px',
              color: 'var(--semi-color-text-1)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {inviteLinkQuery.isLoading
              ? '加载中…'
              : inviteLinkUrl || `${inviteLinkBase}{token}`}
          </div>
          <Button
            theme="solid"
            disabled={!inviteLink}
            onClick={handleCopyLink}
            style={{
              background: copied
                ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)'
                : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              color: 'var(--semi-color-bg-0)',
              border: 'none',
              borderRadius: '8px',
              height: '40px',
              padding: '0 20px',
              fontSize: '13px',
              fontWeight: 600,
              flexShrink: 0,
              transition: 'background 0.2s ease',
            }}
          >
            {copied ? '已复制' : '复制链接'}
          </Button>
        </div>

        {/* 角色切换 + 重置链接 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '16px',
            paddingTop: '16px',
            borderTop: '1px solid var(--semi-color-fill-0)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', color: 'var(--semi-color-text-2)', fontWeight: 600 }}>链接角色</span>
            <Select
              value={inviteLink?.role ?? 'ws_member'}
              onChange={(v) => resetLinkMutation.mutate(v as 'ws_member' | 'ws_admin')}
              disabled={!inviteLink || resetLinkMutation.isPending}
              style={{ width: '120px' }}
            >
              <Select.Option value="ws_member">成员</Select.Option>
              <Select.Option value="ws_admin">管理员</Select.Option>
            </Select>
          </div>
          <Button
            type="tertiary"
            size="small"
            loading={resetLinkMutation.isPending}
            disabled={!inviteLink}
            onClick={() => resetLinkMutation.mutate(inviteLink?.role ?? 'ws_member')}
            style={{ fontSize: '12px', color: 'var(--semi-color-text-1)' }}
          >
            重置链接
          </Button>
        </div>
      </div>

      {/* ── 邮箱邀请区块 ──────────────────────────────────────────────────── */}
      <div
        style={{
          background: 'var(--semi-color-bg-0)',
          border: '1px solid var(--semi-color-border)',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '20px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}
      >
        <h3
          style={{
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--semi-color-text-0)',
            margin: '0 0 16px 0',
          }}
        >
          邮箱批量邀请
        </h3>
        <div
          style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1, minWidth: '240px' }}>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--semi-color-text-2)',
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              邮箱地址
            </div>
            <Input
              value={emailInput}
              onChange={(val) => setEmailInput(val)}
              placeholder="多个邮箱用逗号分隔"
              style={{ borderRadius: '8px', height: '40px' }}
            />
          </div>
          <div style={{ width: '160px' }}>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--semi-color-text-2)',
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              角色
            </div>
            <Select
              value={role}
              onChange={(v) => setRole(v as 'ws_member' | 'ws_admin')}
              style={{ width: '100%' }}
            >
              <Select.Option value="ws_member">成员</Select.Option>
              <Select.Option value="ws_admin">管理员</Select.Option>
            </Select>
          </div>
          <Button
            theme="solid"
            loading={createMutation.isPending}
            disabled={!emailInput.trim() || !activeWorkspaceId}
            onClick={handleSendInvites}
            style={{
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              color: 'var(--semi-color-bg-0)',
              border: 'none',
              borderRadius: '8px',
              height: '40px',
              padding: '0 24px',
              fontSize: '13px',
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            发送邀请
          </Button>
        </div>
      </div>

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
            <Select.Option value="pending">待接受</Select.Option>
            <Select.Option value="accepted">已接受</Select.Option>
            <Select.Option value="expired">已过期</Select.Option>
            <Select.Option value="revoked">已撤销</Select.Option>
            <Select.Option value="all">全部</Select.Option>
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
