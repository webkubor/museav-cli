import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

import { AuthLayout } from '@/components/auth/AuthLayout'
import { SocialLogin } from '@/components/auth/SocialLogin'
import { PasswordStrength } from '@/components/auth/PasswordStrength'
import { VerificationCodeButton } from '@/components/auth/VerificationCodeButton'
import { sendEmailCode, register } from '@/services/auth'
import { useAuthStore } from '@/store/auth'
import { ModelGoApiError } from '@/lib/request'
import { toast } from '@/lib/toast'
import { getRedirectTarget } from '@/lib/redirect'

const schema = z.object({
  display_name: z.string().min(1, '请填写名称'),
  email: z.string().email('请填写有效的邮箱'),
  email_code: z.string().min(6, '请填写 6 位验证码'),
  password: z.string().min(8, '密码至少 8 位'),
})

type Fields = z.infer<typeof schema>

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

  // OAuth 回跳到专用回调页 /auth/callback，由它拉取 session 并落地到目标页
  const redirectTo =
    typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(getRedirectTarget())}`
      : '/'

  return (
    <AuthLayout
      title="创建账号"
      subtitle="免费开始，按用量付费"
      footer={
        <span>
          已有账号？{' '}
          <Link to="/login" className="auth-redirect-link">
            登录
          </Link>
        </span>
      }
    >
      <form
        className="auth-form-container auth-fade-in"
        onSubmit={handleSubmit(onSubmit)}
      >
        <div>
          <label className="modern-auth-label">名称</label>
          <Input
            {...field('display_name')}
            placeholder="你的名字或昵称"
            autoComplete="name"
          />
          {errors.display_name && <p className="auth-error-message">{errors.display_name.message}</p>}
        </div>

        <div>
          <label className="modern-auth-label">邮箱</label>
          <Input
            {...field('email')}
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
          />
          {errors.email && <p className="auth-error-message">{errors.email.message}</p>}
        </div>

        <div>
          <label className="modern-auth-label">验证码</label>
          <div className="auth-code-row">
            <Input
              {...field('email_code')}
              placeholder="6 位数字"
              maxLength={6}
              autoComplete="one-time-code"
            />
            <VerificationCodeButton onSend={handleSendCode} disabled={!emailValue} />
          </div>
          {errors.email_code && <p className="auth-error-message">{errors.email_code.message}</p>}
        </div>

        <div>
          <label className="modern-auth-label">密码</label>
          <Input
            {...field('password')}
            type="password"
            placeholder="至少 8 位"
            autoComplete="new-password"
          />
          <PasswordStrength password={passwordValue} />
          {errors.password && <p className="auth-error-message">{errors.password.message}</p>}
        </div>

        {serverError && <p className="auth-error-message">{serverError}</p>}

        <Button
          htmlType="submit"
          variant="brand"
          size="lg"
          loading={loading}
        >
          免费注册
        </Button>

        <p className="auth-policy-text">
          注册即代表同意{' '}
          <Link to="/legal/terms" className="auth-muted-link">服务条款</Link>
          {' '}与{' '}
          <Link to="/legal/privacy" className="auth-muted-link">隐私政策</Link>
        </p>

        <SocialLogin redirectTo={redirectTo} />
      </form>
    </AuthLayout>
  )
}
