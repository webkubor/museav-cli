import { Button } from '@/components/ui/Button'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams, useParams, Link } from 'react-router-dom'

import { AuthLayout } from '@/components/auth/AuthLayout'
import { previewInvitation, acceptInvitation } from '@/services/invitations'
import { useAuthStore } from '@/store/auth'
import type { InvitationPreview } from '@/types'

export default function InvitationsPage() {
  const navigate = useNavigate()
  const { token: tokenParam } = useParams<{ token: string }>()
  const [searchParams] = useSearchParams()
  // 优先 path 参数（/invitations/:token），兼容旧 query string（?token=xxx）
  const token = tokenParam ?? searchParams.get('token') ?? ''
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isSessionLoading = useAuthStore((s) => s.isLoading)

  const [preview, setPreview] = useState<InvitationPreview | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [serverError, setServerError] = useState('')
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('')
  const called = useRef(false)

  useEffect(() => {
    if (!token) {
      setLoadError('邀请链接无效')
      setLoading(false)
      return
    }
    if (called.current) return
    called.current = true

    previewInvitation(token)
      .then((data) => {
        setPreview(data)
        if (data.workspaces?.length) {
          setSelectedWorkspaceId(data.workspaces[0].workspace_id)
        }
      })
      .catch(() => setLoadError('邀请链接无效或已过期'))
      .finally(() => setLoading(false))
  }, [token])

  const handleAccept = async () => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(`/invitations/${token}`)}`)
      return
    }
    setAccepting(true)
    setServerError('')
    try {
      const result = await acceptInvitation(token, selectedWorkspaceId || undefined)
      navigate(`/dashboard?workspace=${result.workspace_id}`, { replace: true })
    } catch {
      setServerError('接受邀请失败，链接可能已过期')
    } finally {
      setAccepting(false)
    }
  }

  if (loading) {
    return (
      <AuthLayout title="正在加载邀请…">
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b', fontSize: '14px' }}>
          加载中…
        </div>
      </AuthLayout>
    )
  }

  if (loadError || !preview) {
    return (
      <AuthLayout
        title="邀请无效"
        footer={
          <Link to="/login" style={{ color: '#1890ff', textDecoration: 'none' }}>
            返回登录
          </Link>
        }
      >
        <p style={{ textAlign: 'center', fontSize: '14px', color: '#64748b' }}>
          {loadError || '邀请链接无效或已过期'}
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="你被邀请加入"
      footer={
        !isAuthenticated && !isSessionLoading ? (
          <span style={{ fontSize: '13px', color: '#64748b' }}>
            还没有账号？{' '}
            <Link
              to={`/signup?invitation=${encodeURIComponent(token)}`}
              style={{ color: '#1890ff', textDecoration: 'none' }}
            >
              免费注册
            </Link>
          </span>
        ) : undefined
      }
    >
      <div className="auth-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* 邀请信息卡 */}
        <div
          style={{
            padding: '16px',
            background: '#f8fafc',
            borderRadius: '10px',
            border: '1px solid #f1f5f9',
          }}
        >
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
            {preview.workspace.name}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            {preview.tenant.name} · {preview.role === 'ws_admin' ? '管理员' : '成员'}
          </div>
          {preview.invited_by && (
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px' }}>
              由 <strong style={{ color: '#64748b' }}>{preview.invited_by.display_name}</strong> 邀请
            </div>
          )}
          {preview.email && (
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
              邀请邮箱：{preview.email}
            </div>
          )}
        </div>

        {/* 组织邀请链接时允许选择工作区 */}
        {preview.workspaces && preview.workspaces.length > 1 && (
          <div>
            <label
              style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}
            >
              选择加入的工作区
            </label>
            <select
              value={selectedWorkspaceId}
              onChange={(e) => setSelectedWorkspaceId(e.target.value)}
              style={{
                width: '100%',
                height: '40px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                padding: '0 12px',
                fontSize: '14px',
                color: '#0f172a',
                background: '#fff',
                outline: 'none',
              }}
            >
              {preview.workspaces.map((ws) => (
                <option key={ws.workspace_id} value={ws.workspace_id}>
                  {ws.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {serverError && (
          <p style={{ fontSize: '12px', color: '#f43f5e', margin: 0 }}>{serverError}</p>
        )}

        <Button
           variant="brand"
          loading={accepting}
          onClick={handleAccept}
          style={{ width: '100%', height: '40px', borderRadius: '8px', fontWeight: 600 }}
        >
          {isAuthenticated ? '接受邀请' : '登录并接受邀请'}
        </Button>
      </div>
    </AuthLayout>
  )
}
