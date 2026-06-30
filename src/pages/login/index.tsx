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
import { LuEye, LuEyeOff } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { SocialLogin } from '@/components/auth/SocialLogin'
import { PhoneAuth } from '@/components/auth/PhoneAuth'
import { SliderCaptcha } from '@/components/auth/SliderCaptcha'
import { useMarket } from '@/hooks/useMarket'
import { checkLoginEmail, login, getSession } from '@/services/auth'
import { useAuthStore } from '@/store/auth'
import {
  checkAuthGuard,
  clearAuthGuard,
  getAuthGuardFailures,
  recordAuthGuardFailure,
  type AuthGuardAction,
} from '@/lib/auth/front-guard'
import { getRedirectTarget } from '@/lib/redirect'
import { storageKeys } from '@/lib/storage'

const emailSchema = z.object({
  email: z.string().email('请填写有效的邮箱'),
})

const passwordSchema = z.object({
  password: z.string().min(1, '请填写密码'),
})

type EmailFields = z.infer<typeof emailSchema>
type PasswordFields = z.infer<typeof passwordSchema>

function readRememberedLogin(): string | null {
  if (typeof window === 'undefined') return null

  const raw = window.localStorage.getItem(storageKeys.rememberedLogin())
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as { email?: string }
    if (typeof parsed.email === 'string') return parsed.email
  } catch {
    window.localStorage.removeItem(storageKeys.rememberedLogin())
  }

  return null
}

function saveRememberedEmail(email: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(storageKeys.rememberedLogin(), JSON.stringify({ email }))
}

function clearRememberedLogin() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(storageKeys.rememberedLogin())
}

/**
 * 极雅自适应登录页面组件 (Tailwind 样式抽离与全新 shadcn/ui 架构)
 */
/**
 * 登录页入口：国内（domestic）走手机号一键登录/注册，海外走邮箱登录。
 * 在此切换而非组件内部 early-return，避免市场运行时切换导致 hooks 数量不一致。
 */
export default function LoginPage() {
  const market = useMarket()
  return market === 'domestic' ? <PhoneAuth /> : <EmailLoginPage />
}

function EmailLoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isSessionLoading = useAuthStore((s) => s.isLoading)

  const [redirectAfterLogin] = useState(() => getRedirectTarget())

  // 记住的登录邮箱在挂载时读取一次，作为各状态的初始值，避免 effect 同步 setState
  const [remembered] = useState(() => readRememberedLogin())

  const [step, setStep] = useState<'email' | 'password'>('email')
  const [email, setEmail] = useState(remembered || '')
  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberPassword, setRememberPassword] = useState(Boolean(remembered))
  // 人机校验：同一邮箱连续 3 次密码错误后要求滑块（按邮箱计数，换邮箱各自归零）
  const [captchaVerified, setCaptchaVerified] = useState(false)
  // 失败后 bump 触发重渲染，从而重读 localStorage 里的失败次数
  const [, setFailureTick] = useState(0)
  // 当前邮箱的连续密码失败次数（每次渲染直接读，按邮箱各自计数）
  const pwdFailures = getAuthGuardFailures({ action: 'login-password', subject: email })
  const captchaRequired = pwdFailures >= 3

  const emailForm = useForm<EmailFields>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: remembered || '' },
  })
  const passwordForm = useForm<PasswordFields>({ resolver: zodResolver(passwordSchema) })

  // 已登录即离开登录页；无组织的账号到受保护路由由 ProtectedRoute 渲染 403（不回弹登录，无循环）
  useEffect(() => {
    if (!isSessionLoading && isAuthenticated) {
      navigate(redirectAfterLogin, { replace: true })
    }
  }, [isAuthenticated, isSessionLoading, navigate, redirectAfterLogin])

  const canSubmitAuth = (action: AuthGuardAction, subject: string) => {
    const decision = checkAuthGuard({ action, subject })
    if (decision.allowed) return true
    setServerError(decision.message ?? '操作过于频繁，请稍后再试')
    return false
  }

  const onEmailSubmit = async (data: EmailFields) => {
    if (!canSubmitAuth('login-email', data.email)) return
    setLoading(true)
    setServerError('')
    try {
      const result = await checkLoginEmail(data.email)
      clearAuthGuard({ action: 'login-email', subject: data.email })
      if (!result.registered) {
        navigate(`/signup?email=${encodeURIComponent(data.email)}`)
        return
      }
      setEmail(data.email)
      setStep('password')
    } catch {
      recordAuthGuardFailure({ action: 'login-email', subject: data.email })
      setServerError('邮箱验证失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const onPasswordSubmit = async (data: PasswordFields) => {
    if (captchaRequired && !captchaVerified) {
      setServerError('请先完成滑块验证')
      return
    }
    if (!canSubmitAuth('login-password', email)) return
    setLoading(true)
    setServerError('')
    let loginOk = false
    try {
      await login({ email, password: data.password })
      loginOk = true
      const session = await getSession()
      clearAuthGuard({ action: 'login-password', subject: email })
      if (rememberPassword) {
        saveRememberedEmail(email)
      } else {
        clearRememberedLogin()
      }
      setAuth(
        {
          account_id: session.account.account_id,
          display_name: session.account.display_name,
          email: session.account.email,
          avatar_url: session.account.avatar_url,
        },
        session.active_tenant_id,
        session.tenants,
        session.active_workspace_id,
        session.permissions?.granted ?? null
      )
      navigate(redirectAfterLogin, { replace: true })
    } catch {
      if (!loginOk) {
        recordAuthGuardFailure({ action: 'login-password', subject: email })
        // 失败后重置滑块并 bump，重读次数（达到 3 次即显示滑块）
        setCaptchaVerified(false)
        setFailureTick((t) => t + 1)
      }
      setServerError(loginOk ? '登录成功但获取会话失败，请刷新重试' : '邮箱或密码错误')
    } finally {
      setLoading(false)
    }
  }

  const onRememberPasswordChange = (checked: boolean) => {
    setRememberPassword(checked)
    if (!checked) {
      clearRememberedLogin()
    }
  }

  // OAuth 回跳到专用回调页 /auth/callback（API 域处理完登录后跳回控制台域），
  // 由它拉取 session 并落地到目标页；最终目标作为其 ?redirect 透传。
  const redirectTo =
    typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(getRedirectTarget())}`
      : '/'

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
            variant="brand"
            size="lg"
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
              onClick={() => { setStep('email'); setServerError(''); setCaptchaVerified(false) }}
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
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="current-password"
              autoFocus
              suffix={
                <button
                  type="button"
                  className="auth-password-visibility-btn"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? <LuEyeOff size={17} /> : <LuEye size={17} />}
                </button>
              }
            />
            {passwordForm.formState.errors.password && (
              <p className="auth-error-message">{passwordForm.formState.errors.password.message}</p>
            )}
            <label className="auth-remember-password">
              <input
                type="checkbox"
                checked={rememberPassword}
                onChange={(event) => onRememberPasswordChange(event.target.checked)}
              />
              <span>记住密码</span>
            </label>
          </div>
          
          {captchaRequired && (
            <div className="auth-fade-in">
              <label className="modern-auth-label">安全验证</label>
              <p className="mb-2 text-xs text-mg-text-3">多次密码错误，请完成下方验证后再登录</p>
              <SliderCaptcha onChange={(verified) => setCaptchaVerified(verified)} />
            </div>
          )}

          {serverError && <p className="auth-error-message">{serverError}</p>}

          <Button
            type="submit"
            variant="brand"
            size="lg"
            loading={loading}
            disabled={captchaRequired && !captchaVerified}
          >
            登录
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
