import { Button } from '@/components/ui/Button'
import { useEffect, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams, useParams, Link } from 'react-router-dom'

import { AuthLayout } from '@/components/auth/AuthLayout'
import { previewInvitation, acceptInvitation } from '@/services/invitations'
import { getSessionForActiveWorkspace, applySessionToStore } from '@/lib/auth/refresh-session'
import { useAuthStore } from '@/store/auth'
import { toLoginWithRedirect } from '@/lib/redirect'
import type { InvitationPreview } from '@/types'

export default function InvitationsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { token: tokenParam } = useParams<{ token: string }>()
  const [searchParams] = useSearchParams()
  // 优先 path 参数（/invitations/:token），兼容旧 query string（?token=xxx）
  const token = tokenParam ?? searchParams.get('token') ?? ''
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isSessionLoading = useAuthStore((s) => s.isLoading)

  const [preview, setPreview] = useState<InvitationPreview | null>(null)
  // token 为空属可在首次渲染判定的静态错误，直接作为初始状态，effect 只负责拉取预览
  const [loadError, setLoadError] = useState(token ? '' : t('invitations.acceptPage.invalidLink'))
  const [loading, setLoading] = useState(Boolean(token))
  const [accepting, setAccepting] = useState(false)
  const [serverError, setServerError] = useState('')
  const called = useRef(false)

  useEffect(() => {
    if (!token || called.current) return
    called.current = true

    previewInvitation(token)
      .then((data) => setPreview(data))
      .catch(() => setLoadError(t('invitations.acceptPage.expiredLink')))
      .finally(() => setLoading(false))
  }, [t, token])

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
        const session = await getSessionForActiveWorkspace()
        applySessionToStore(session)
      } catch {
        // getSession 失败不阻塞跳转，SessionLoader 会在下次渲染时重新拉取
      }
      navigate(`/dashboard?workspace=${result.workspace_id}`, { replace: true })
    } catch (err) {
      // #85：组织关联上限（40904）必须给出准确原因，而不是误导为链接过期。
      const code = (err as { code?: number })?.code
      if (code === 40904) {
        setServerError(t('invitations.acceptPage.orgLimit'))
      } else {
        setServerError((err as { message?: string })?.message || t('invitations.acceptPage.acceptFailed'))
      }
    } finally {
      setAccepting(false)
    }
  }

  if (loading) {
    return (
      <AuthLayout title={t('invitations.acceptPage.loadingTitle')}>
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--mg-text-3)', fontSize: '14px' }}>
          {t('invitations.acceptPage.loading')}
        </div>
      </AuthLayout>
    )
  }

  if (loadError || !preview) {
    return (
      <AuthLayout
        title={t('invitations.acceptPage.invalidTitle')}
        footer={
          <Link to="/login" style={{ color: 'var(--mg-link)', textDecoration: 'none' }}>
            {t('invitations.acceptPage.backToLogin')}
          </Link>
        }
      >
        <p style={{ textAlign: 'center', fontSize: '14px', color: 'var(--mg-text-3)' }}>
          {loadError || t('invitations.acceptPage.expiredLink')}
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={t('invitations.acceptPage.title')}
      footer={
        !isAuthenticated && !isSessionLoading ? (
          <span style={{ fontSize: '13px', color: 'var(--mg-text-3)' }}>
            {t('invitations.acceptPage.signupPrompt')}{' '}
            <Link
              to={`/signup?invitation=${encodeURIComponent(token)}`}
              style={{ color: 'var(--mg-link)', textDecoration: 'none' }}
            >
              {t('invitations.acceptPage.signupFree')}
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
            {preview.tenant.name} · {preview.role === 'ws_admin' ? t('invitations.acceptPage.roleAdmin') : t('invitations.acceptPage.roleMember')}
          </div>
          {preview.invited_by && (
            <div style={{ fontSize: '12px', color: 'var(--mg-text-3)', marginTop: '8px' }}>
              <Trans
                i18nKey="invitations.acceptPage.invitedBy"
                values={{ name: preview.invited_by.display_name }}
                components={{ name: <strong className="text-mg-text-2" /> }}
              />
            </div>
          )}
          {preview.email && (
            <div style={{ fontSize: '12px', color: 'var(--mg-text-3)', marginTop: '2px' }}>
              {t('invitations.acceptPage.email', { email: preview.email })}
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
          {isAuthenticated ? t('invitations.acceptPage.accept') : t('invitations.acceptPage.loginAndAccept')}
        </Button>
      </div>
    </AuthLayout>
  )
}
