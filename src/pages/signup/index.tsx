import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@douyinfe/semi-ui'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { SocialLogin } from '@/components/auth/SocialLogin'
import { PasswordStrength } from '@/components/auth/PasswordStrength'
import { VerificationCodeButton } from '@/components/auth/VerificationCodeButton'
import { sendEmailCode, register } from '@/services/auth'
import { useAuthStore } from '@/store/auth'
import { ModelGoApiError } from '@/lib/request'
import { toast } from '@/lib/toast'

const schema = z.object({
  display_name: z.string().min(1, '请填写名称'),
  email: z.string().email('请填写有效的邮箱'),
  email_code: z.string().min(6, '请填写 6 位验证码'),
  password: z.string().min(8, '密码至少 8 位'),
})

type Fields = z.infer<typeof schema>

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
  flex: 1,
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

export default function SignupPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const setAuth = useAuthStore((s) => s.setAuth)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isSessionLoading = useAuthStore((s) => s.isLoading)
  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)

  const {
    register: field,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: { email: searchParams.get('email') ?? '' },
  })

  const emailValue = watch('email')
  const passwordValue = watch('password', '')

  useEffect(() => {
    if (!isSessionLoading && isAuthenticated) navigate('/dashboard', { replace: true })
  }, [isAuthenticated, isSessionLoading, navigate])

  const handleSendCode = async () => {
    const email = emailValue
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return
    }
    const result = await sendEmailCode(email)
    return result.expires_in
  }

  const onSubmit = async (data: Fields) => {
    setLoading(true)
    setServerError('')
    try {
      const invitationToken = searchParams.get('invitation') ?? undefined
      const result = await register({
        email: data.email,
        password: data.password,
        display_name: data.display_name,
        email_code: data.email_code,
        invitation_token: invitationToken,
      })
      setAuth(
        {
          account_id: result.account.account_id,
          display_name: result.account.display_name,
          email: result.account.email,
          avatar_url: result.account.avatar_url,
        },
        result.default_tenant_id,
        [],
        result.default_workspace_id
      )
      navigate('/dashboard')
    } catch (e) {
      const msg = e instanceof ModelGoApiError ? e.message : '注册失败，请稍后重试'
      setServerError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const redirectTo = typeof window !== 'undefined' ? window.location.href : '/'

  return (
    <AuthLayout
      title="创建账号"
      subtitle="免费开始，按用量付费"
      footer={
        <span>
          已有账号？{' '}
          <Link to="/login" style={{ color: '#1890ff', textDecoration: 'none' }}>
            登录
          </Link>
        </span>
      }
    >
      <form
        className="auth-fade-in"
        onSubmit={handleSubmit(onSubmit)}
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        <div>
          <label style={labelStyle}>名称</label>
          <input
            {...field('display_name')}
            placeholder="你的名字或昵称"
            autoComplete="name"
            style={inputStyle}
          />
          {errors.display_name && <p style={errorStyle}>{errors.display_name.message}</p>}
        </div>

        <div>
          <label style={labelStyle}>邮箱</label>
          <input
            {...field('email')}
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            style={inputStyle}
          />
          {errors.email && <p style={errorStyle}>{errors.email.message}</p>}
        </div>

        <div>
          <label style={labelStyle}>验证码</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              {...field('email_code')}
              placeholder="6 位数字"
              maxLength={6}
              style={inputStyle}
              autoComplete="one-time-code"
            />
            <VerificationCodeButton onSend={handleSendCode} disabled={!emailValue} />
          </div>
          {errors.email_code && <p style={errorStyle}>{errors.email_code.message}</p>}
        </div>

        <div>
          <label style={labelStyle}>密码</label>
          <input
            {...field('password')}
            type="password"
            placeholder="至少 8 位"
            autoComplete="new-password"
            style={inputStyle}
          />
          <PasswordStrength password={passwordValue} />
          {errors.password && <p style={errorStyle}>{errors.password.message}</p>}
        </div>

        {serverError && <p style={errorStyle}>{serverError}</p>}

        <Button
          htmlType="submit"
          type="primary"
          loading={loading}
          style={{ width: '100%', height: '40px', borderRadius: '8px', fontWeight: 600 }}
        >
          免费注册
        </Button>

        <p style={{ textAlign: 'center', fontSize: '11px', color: '#94a3b8', margin: 0 }}>
          注册即代表同意{' '}
          <Link to="/legal/terms" style={{ color: '#94a3b8' }}>服务条款</Link>
          {' '}与{' '}
          <Link to="/legal/privacy" style={{ color: '#94a3b8' }}>隐私政策</Link>
        </p>

        <SocialLogin redirectTo={redirectTo} />
      </form>
    </AuthLayout>
  )
}
