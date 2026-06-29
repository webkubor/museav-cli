import { Button } from '@/components/ui/Button'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams, useParams, Link } from 'react-router-dom'

import { AuthLayout } from '@/components/auth/AuthLayout'
import { previewInvitation, acceptInvitation } from '@/services/invitations'
import { getSession } from '@/services/auth'
import { useAuthStore } from '@/store/auth'
import { storageKeys } from '@/lib/storage'
import { toLoginWithRedirect } from '@/lib/redirect'
import type { InvitationPreview } from '@/types'

export default function InvitationsPage() {
  const navigate = useNavigate()
  const { token: tokenParam } = useParams<{ token: string }>()
  const [searchParams] = useSearchParams()
  // 优先 path 参数（/invitations/:token），兼容旧 query string（?token=xxx）
  const token = tokenParam ?? searchParams.get('token') ?? ''
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isSessionLoading = useAuthStore((s) => s.isLoading)
  const setAuth = useAuthStore((s) => s.setAuth)

  const [preview, setPreview] = useState<InvitationPreview | null>(null)
  // token 为空属可在首次渲染判定的静态错误，直接作为初始状态，effect 只负责拉取预览
  const [loadError, setLoadError] = useState(token ? '' : '邀请链接无效')
  const [loading, setLoading] = useState(Boolean(token))
  const [accepting, setAccepting] = useState(false)
  const [serverError, setServerError] = useState('')
  const called = useRef(false)

  useEffect(() => {
    if (!token || called.current) return
    called.current = true

    previewInvitation(token)
      .then((data) => setPreview(data))
      .catch(() => setLoadError('邀请链接无效或已过期'))
      .finally(() => setLoading(false))
  }, [token])

  const handleAccept = async () => {
    if (!isAuthenticated) {
      navigate(toLoginWithRedirect(`/invitations/${token}`))
      return
    }
    setAccepting(true)
    setServerError('')
    try {
      const result = await acceptInvitation(token)
      try {
        const session = await getSession()
        const persistedWs = localStorage.getItem(storageKeys.activeWorkspaceId())
        setAuth(
          {
            account_id: session.account.account_id,
            display_name: session.account.display_name,
            email: session.account.email,
            avatar_url: session.account.avatar_url,
          },
          session.active_tenant_id,
          session.tenants,
          persistedWs || session.active_workspace_id,
          session.permissions?.granted ?? null
        )
      } catch {
        // getSession 失败不阻塞跳转，SessionLoader 会在下次渲染时重新拉取
      }
      navigate(`/dashboard?workspace=${result.workspace_id}`, { replace: true })
    } catch (err) {
      // #85：组织关联上限（40904）必须给出准确原因，而不是误导为链接过期。
      const code = (err as { code?: number })?.code
      if (code === 40904) {
        setServerError('您已加入 5 个企业组织，已达上限；请先退出一个组织后再接受邀请')
      } else {
        setServerError((err as { message?: string })?.message || '接受邀请失败，链接可能已过期')
      }
    } finally {
      setAccepting(false)
    }
  }

  if (loading) {
    return (
      <AuthLayout title="正在加载邀请…">
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--mg-text-3)', fontSize: '14px' }}>
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
          <Link to="/login" style={{ color: 'var(--mg-link)', textDecoration: 'none' }}>
            返回登录
          </Link>
        }
      >
        <p style={{ textAlign: 'center', fontSize: '14px', color: 'var(--mg-text-3)' }}>
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
          <span style={{ fontSize: '13px', color: 'var(--mg-text-3)' }}>
            还没有账号？{' '}
            <Link
              to={`/signup?invitation=${encodeURIComponent(token)}`}
              style={{ color: 'var(--mg-link)', textDecoration: 'none' }}
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
            background: 'var(--mg-bg-1)',
            borderRadius: '10px',
            border: '1px solid var(--mg-border)',
          }}
        >
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--mg-text-1)', marginBottom: '4px' }}>
            {preview.workspace.name}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--mg-text-3)' }}>
            {preview.tenant.name} · {preview.role === 'ws_admin' ? '管理员' : '成员'}
          </div>
          {preview.invited_by && (
            <div style={{ fontSize: '12px', color: 'var(--mg-text-3)', marginTop: '8px' }}>
              由 <strong style={{ color: 'var(--mg-text-2)' }}>{preview.invited_by.display_name}</strong> 邀请
            </div>
          )}
          {preview.email && (
            <div style={{ fontSize: '12px', color: 'var(--mg-text-3)', marginTop: '2px' }}>
              邀请邮箱：{preview.email}
            </div>
          )}
        </div>

        {serverError && (
          <p style={{ fontSize: '12px', color: 'var(--mg-danger)', margin: 0 }}>{serverError}</p>
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
