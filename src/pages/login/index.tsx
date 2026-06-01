/**
 * 仪表盘鉴权中心 — 登录页面 (LoginPage)
 * 职责：负责渲染用户的登录交互，包含账号输入与密码输入的双阶段平滑跳转，支持第三方社交单点登录绑定
 * 路由：/login
 * API: POST /auth/login, POST /auth/check-email 等鉴权核心网络服务
 */

import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { SocialLogin } from '@/components/auth/SocialLogin'
import { checkLoginEmail, login } from '@/services/auth'
import { useAuthStore } from '@/store/auth'
import { getRedirectTarget } from '@/lib/redirect'

const emailSchema = z.object({
  email: z.string().email('请填写有效的邮箱'),
})

const passwordSchema = z.object({
  password: z.string().min(1, '请填写密码'),
})

type EmailFields = z.infer<typeof emailSchema>
type PasswordFields = z.infer<typeof passwordSchema>

/**
 * 极雅自适应登录页面组件 (Tailwind 样式抽离与全新 shadcn/ui 架构)
 */
export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isSessionLoading = useAuthStore((s) => s.isLoading)

  const [redirectAfterLogin] = useState(() => getRedirectTarget())
  const searchParams = new URLSearchParams(window.location.search)
  const accessDenied = searchParams.get('reason') === 'no_access'

  const [step, setStep] = useState<'email' | 'password'>('email')
  const [email, setEmail] = useState('')
  const [serverError, setServerError] = useState(
    accessDenied ? '你的账号当前不属于任何组织，请联系管理员邀请后再登录。' : ''
  )
  const [loading, setLoading] = useState(false)

  const emailForm = useForm<EmailFields>({ resolver: zodResolver(emailSchema) })
  const passwordForm = useForm<PasswordFields>({ resolver: zodResolver(passwordSchema) })

  useEffect(() => {
    if (!isSessionLoading && isAuthenticated) navigate(redirectAfterLogin, { replace: true })
  }, [isAuthenticated, isSessionLoading, navigate, redirectAfterLogin])

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
          <Link
            to="/signup"
            className="auth-redirect-link"
          >
            免费注册
          </Link>
        </span>
      }
    >
      {step === 'email' ? (
        <form
          key="email-step"
          className="auth-form-container auth-fade-in"
          onSubmit={emailForm.handleSubmit(onEmailSubmit)}
        >
          <div>
            <label className="modern-auth-label">邮箱</label>
            <Input
              {...emailForm.register('email')}
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
            />
            {emailForm.formState.errors.email && (
              <p className="auth-error-message">{emailForm.formState.errors.email.message}</p>
            )}
          </div>
          
          {serverError && <p className="auth-error-message">{serverError}</p>}
          
          <Button
            type="submit"
            loading={loading}
          >
            继续
          </Button>
          
          <SocialLogin redirectTo={redirectTo} />
        </form>
      ) : (
        <form
          key="password-step"
          className="auth-form-container auth-slide-in"
          onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
        >
          <div className="auth-email-preview">
            <span className="auth-email-text">{email}</span>
            <button
              type="button"
              onClick={() => { setStep('email'); setServerError('') }}
              className="auth-email-modify-btn"
            >
              修改
            </button>
          </div>
          
          <div>
            <div className="auth-password-header">
              <label className="modern-auth-label" style={{ marginBottom: 0 }}>密码</label>
              <Link
                to={`/forgot-password?email=${encodeURIComponent(email)}`}
                className="auth-forgot-password-link"
              >
                忘记密码？
              </Link>
            </div>
            <Input
              {...passwordForm.register('password')}
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              autoFocus
            />
            {passwordForm.formState.errors.password && (
              <p className="auth-error-message">{passwordForm.formState.errors.password.message}</p>
            )}
          </div>
          
          {serverError && <p className="auth-error-message">{serverError}</p>}
          
          <Button
            type="submit"
            loading={loading}
          >
            登录
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
