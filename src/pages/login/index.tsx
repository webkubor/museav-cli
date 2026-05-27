import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@douyinfe/semi-ui'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { SocialLogin } from '@/components/auth/SocialLogin'
import { checkLoginEmail, login } from '@/services/auth'
import { useAuthStore } from '@/store/auth'

const emailSchema = z.object({
  email: z.string().email('请填写有效的邮箱'),
})

const passwordSchema = z.object({
  password: z.string().min(1, '请填写密码'),
})

type EmailFields = z.infer<typeof emailSchema>
type PasswordFields = z.infer<typeof passwordSchema>

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: '40px',
  borderRadius: '8px',
  border: '1px solid #e2e8f0',
  padding: '0 12px',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
  color: '#0f172a',
  background: '#fff',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  color: '#374151',
  marginBottom: '6px',
}

const errorStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#f43f5e',
  marginTop: '4px',
}

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isSessionLoading = useAuthStore((s) => s.isLoading)

  const redirectAfterLogin = new URLSearchParams(window.location.search).get('redirect') || '/dashboard'

  const [step, setStep] = useState<'email' | 'password'>('email')
  const [email, setEmail] = useState('')
  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)

  const emailForm = useForm<EmailFields>({ resolver: zodResolver(emailSchema) })
  const passwordForm = useForm<PasswordFields>({ resolver: zodResolver(passwordSchema) })

  useEffect(() => {
    if (!isSessionLoading && isAuthenticated) navigate(redirectAfterLogin, { replace: true })
  }, [isAuthenticated, isSessionLoading, navigate])

  const onEmailSubmit = async (data: EmailFields) => {
    setLoading(true)
    setServerError('')
    try {
      const result = await checkLoginEmail(data.email)
      if (!result.registered) {
        navigate(`/signup?email=${encodeURIComponent(data.email)}`)
        return
      }
      setEmail(data.email)
      setStep('password')
    } catch {
      setServerError('邮箱验证失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const onPasswordSubmit = async (data: PasswordFields) => {
    setLoading(true)
    setServerError('')
    try {
      const result = await login({ email, password: data.password })
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
      navigate(redirectAfterLogin, { replace: true })
    } catch {
      setServerError('邮箱或密码错误')
    } finally {
      setLoading(false)
    }
  }

  const redirectTo = typeof window !== 'undefined' ? window.location.href : '/'

  return (
    <AuthLayout
      title="欢迎回来"
      subtitle="登录到你的 ModelGo 账号"
      footer={
        <span>
          没有账号？{' '}
          <Link to="/signup" style={{ color: '#1890ff', textDecoration: 'none' }}>
            免费注册
          </Link>
        </span>
      }
    >
      {step === 'email' ? (
        <form
          key="email-step"
          className="auth-fade-in"
          onSubmit={emailForm.handleSubmit(onEmailSubmit)}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          <div>
            <label style={labelStyle}>邮箱</label>
            <input
              {...emailForm.register('email')}
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
              style={inputStyle}
            />
            {emailForm.formState.errors.email && (
              <p style={errorStyle}>{emailForm.formState.errors.email.message}</p>
            )}
          </div>
          {serverError && <p style={errorStyle}>{serverError}</p>}
          <Button
            htmlType="submit"
            type="primary"
            loading={loading}
            style={{ width: '100%', height: '40px', borderRadius: '8px', fontWeight: 600 }}
          >
            继续
          </Button>
          <SocialLogin redirectTo={redirectTo} />
        </form>
      ) : (
        <form
          key="password-step"
          className="auth-slide-in"
          onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 12px',
              background: '#f8fafc',
              borderRadius: '8px',
              fontSize: '13px',
              color: '#64748b',
            }}
          >
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</span>
            <button
              type="button"
              onClick={() => { setStep('email'); setServerError('') }}
              style={{
                background: 'none',
                border: 'none',
                color: '#1890ff',
                cursor: 'pointer',
                fontSize: '12px',
                padding: 0,
                flexShrink: 0,
              }}
            >
              修改
            </button>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>密码</label>
              <Link
                to={`/forgot-password?email=${encodeURIComponent(email)}`}
                style={{ fontSize: '12px', color: '#1890ff', textDecoration: 'none' }}
              >
                忘记密码？
              </Link>
            </div>
            <input
              {...passwordForm.register('password')}
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              autoFocus
              style={inputStyle}
            />
            {passwordForm.formState.errors.password && (
              <p style={errorStyle}>{passwordForm.formState.errors.password.message}</p>
            )}
          </div>
          {serverError && <p style={errorStyle}>{serverError}</p>}
          <Button
            htmlType="submit"
            type="primary"
            loading={loading}
            style={{ width: '100%', height: '40px', borderRadius: '8px', fontWeight: 600 }}
          >
            登录
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
