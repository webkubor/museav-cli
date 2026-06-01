import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSession } from '@/services/auth'
import { useAuthStore } from '@/store/auth'
import { getRedirectTarget } from '@/lib/redirect'

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
          result.active_workspace_id
        )
        navigate(redirect, { replace: true })
      })
      .catch(() => {
        navigate('/login', { replace: true })
      })
  }, [])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
      }}
    >
      <div style={{ textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
        <div
          style={{
            width: '32px',
            height: '32px',
            border: '3px solid #e2e8f0',
            borderTopColor: '#1890ff',
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
