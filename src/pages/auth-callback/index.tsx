import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { getSession } from '@/services/auth'
import { useAuthStore } from '@/store/auth'
import { getRedirectTarget } from '@/lib/redirect'
import { navigateAfterLogin } from '@/lib/login-intent'
import { appToast } from '@/lib/app-toast'
import { trackEvent } from '@/lib/track'

export default function AuthCallbackPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const setLoading = useAuthStore((s) => s.setLoading)
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true

    const redirect = getRedirectTarget()

    setLoading(true)
    getSession()
      .then((result) => {
        // 透传完整 account：之前手工挑字段把 phone 丢了，导致已绑手机号的账户
        // 微信登录后 PhoneBindingGuard 误判未绑定又弹绑定浮层（需求方#593）
        setAuth(
          result.account,
          result.active_tenant_id,
          result.tenants,
          result.active_workspace_id,
          result.permissions?.granted ?? null
        )
        trackEvent('login_success', { method: 'oauth' }, { result: 'success' })
        void navigateAfterLogin(navigate, redirect)
      })
      .catch(async () => {
        try {
          const result = await getSession()
          setAuth(
            result.account,
            result.active_tenant_id,
            result.tenants,
            result.active_workspace_id,
            result.permissions?.granted ?? null
          )
          trackEvent('login_success', { method: 'oauth' }, { result: 'success' })
          void navigateAfterLogin(navigate, redirect)
        } catch {
          // 回调换取与会话兜底都失败 = 登录确实没成：先提示再跳登录，不静默
          trackEvent('login_fail', { method: 'oauth' }, { result: 'fail', error_code: 'callback_failed' })
          appToast.error(t('common.authCallback.failed'))
          navigate('/login', { replace: true })
        }
      })
  }, [navigate, setAuth, setLoading, t])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--mg-bg-1)',
      }}
    >
      <div style={{ textAlign: 'center', color: 'var(--mg-text-3)', fontSize: '14px' }}>
        <div
          style={{
            width: '32px',
            height: '32px',
            border: '3px solid var(--mg-border)',
            borderTopColor: 'var(--brand-base)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 12px',
          }}
        />
        {t('common.authCallback.verifying')}
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  )
}
