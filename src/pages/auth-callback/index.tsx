import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSession } from '@/services/auth'
import { useAuthStore } from '@/store/auth'
import { getRedirectTarget } from '@/lib/redirect'
import { appToast } from '@/lib/app-toast'
import { trackEvent } from '@/lib/track'

export default function AuthCallbackPage() {
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
        setAuth(
          {
            account_id: result.account.account_id,
            display_name: result.account.display_name,
            email: result.account.email,
            avatar_url: result.account.avatar_url,
          },
          result.active_tenant_id,
          result.tenants,
          result.active_workspace_id,
          result.permissions?.granted ?? null
        )
        trackEvent('login_success', { method: 'oauth' })
        navigate(redirect, { replace: true })
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
          trackEvent('login_success', { method: 'oauth' })
          navigate(redirect, { replace: true })
        } catch {
          // 回调换取与会话兜底都失败 = 登录确实没成：先提示再跳登录，不静默
          trackEvent('login_fail', { method: 'oauth', reason: 'callback_failed' })
          appToast.error('登录失败，请重新登录')
          navigate('/login', { replace: true })
        }
      })
  }, [])

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
        正在验证身份…
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  )
}
