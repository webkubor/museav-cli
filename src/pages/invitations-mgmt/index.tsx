import { useState } from 'react'
import { Button, Table, Tag, Toast, Select } from '@douyinfe/semi-ui'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import {
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

  const [status, setStatus] = useState<'pending' | 'accepted' | 'expired' | 'revoked' | 'all'>('pending')
  const [linkCopied, setLinkCopied] = useState(false)
  const [resetRole, setResetRole] = useState<'ws_member' | 'ws_admin'>('ws_member')

  // ─── Invite link ──────────────────────────────────────────────────────────
  const inviteLinkQuery = useQuery({
    queryKey: ['workspace-invite-link', activeWorkspaceId],
    queryFn: () => getInviteLink(activeWorkspaceId!),
    enabled: Boolean(activeWorkspaceId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const resetLinkMutation = useMutation({
    mutationFn: (role: 'ws_member' | 'ws_admin') => resetInviteLink(activeWorkspaceId!, role),
    onSuccess: () => {
      Toast.success('邀请链接已重置')
      qc.invalidateQueries({ queryKey: ['workspace-invite-link', activeWorkspaceId] })
    },
    onError: (err: any) => Toast.error(err?.message || '重置失败'),
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
          查看当前工作区的成员邀请记录。
        </p>
      </div>

      {/* ── 邀请链接 ──────────────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--semi-color-bg-0)',
        border: '1px solid var(--semi-color-border)',
        borderRadius: '12px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        marginBottom: '20px',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          padding: '18px 24px',
          borderBottom: '1px solid var(--semi-color-fill-0)',
        }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--semi-color-text-0)', margin: '0 0 4px 0' }}>
              邀请链接
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', margin: 0 }}>
              将此链接发给外部成员，对方点击后可申请加入当前工作区。
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '16px' }}>
            <Select
              value={resetRole}
              onChange={(v) => setResetRole(v as 'ws_member' | 'ws_admin')}
              style={{ width: '100px' }}
              size="small"
            >
              <Select.Option value="ws_member">成员</Select.Option>
              <Select.Option value="ws_admin">管理员</Select.Option>
            </Select>
            <Button size="small" loading={resetLinkMutation.isPending} onClick={() => resetLinkMutation.mutate(resetRole)}>
              重置链接
            </Button>
          </div>
        </div>
        <div style={{ padding: '18px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
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
            }}>
              {inviteLinkQuery.isLoading
                ? <span style={{ color: 'var(--semi-color-text-2)', fontStyle: 'italic' }}>加载中…</span>
                : inviteLinkUrl ?? <span style={{ color: 'var(--semi-color-text-2)', fontStyle: 'italic' }}>暂无链接</span>}
            </div>
            {inviteLinkQuery.data && (
              <Tag style={{ backgroundColor: 'var(--semi-color-fill-0)', color: 'var(--semi-color-text-1)', border: '1px solid var(--semi-color-border)', fontSize: '11px', fontWeight: 600, borderRadius: '4px', flexShrink: 0 }}>
                {ROLE_LABEL[inviteLinkQuery.data.role]}
              </Tag>
            )}
            <Button
              theme="solid"
              disabled={!inviteLinkUrl}
              onClick={handleCopyLink}
              style={linkCopied ? { borderColor: '#10b981', backgroundColor: 'transparent', color: '#10b981' } : undefined}
            >
              {linkCopied ? '已复制' : '复制链接'}
            </Button>
          </div>
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
