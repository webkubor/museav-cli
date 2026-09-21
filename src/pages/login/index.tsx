/**
 * 仪表盘鉴权中心 — 登录页面 (LoginPage)
 * 职责：负责渲染用户的登录交互，包含账号输入与密码输入的双阶段平滑跳转，支持第三方社交单点登录绑定
 * 路由：/login
 * API: POST /auth/login, POST /auth/check-email 等鉴权核心网络服务
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { LuEye, LuEyeOff } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { SocialLogin } from '@/components/auth/SocialLogin'
import { PhoneAuth } from '@/components/auth/PhoneAuth'
import { GlobalEmailAuth } from '@/components/auth/GlobalEmailAuth'
import { getCaptchaParam } from '@/lib/aliyun-captcha'
import { CaptchaGate, type CaptchaGateHandle } from '@/components/auth/CaptchaGate'
import { useMarket } from '@/hooks/useMarket'
import { useEmailAuthEnabled } from '@/hooks/use-platform-config'
import { checkLoginEmail, login, getSession } from '@/services/auth'
import { useAuthStore } from '@/store/auth'
import { throttleMessage } from '@/lib/auth/server-throttle'
import { getRedirectTarget } from '@/lib/redirect'
import { navigateAfterLogin } from '@/lib/login-intent'
import { resolveReferralCode } from '@/pages/signup/referral-code'
import { storageKeys } from '@/lib/storage'
import { trackEvent } from '@/lib/track'
import type { Market } from '@/lib/market'

function createEmailSchema(t: TFunction) {
  return z.object({
    email: z.string().email(t('account.auth.validation.email')),
  })
}

function createPasswordSchema(t: TFunction) {
  return z.object({
    password: z.string().min(1, t('account.auth.validation.passwordRequired')),
  })
}

type EmailFields = { email: string }
type PasswordFields = { password: string }

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
 * 登录页入口：国内（china）走手机号一键登录/注册，海外走邮箱登录。
 * 在此切换而非组件内部 early-return，避免市场运行时切换导致 hooks 数量不一致。
 */
export default function LoginPage() {
  const market = useMarket()
  const [searchParams, setSearchParams] = useSearchParams()

  // qa#675：推荐码的解析与持久化必须放在 market 分流**之前**。
  // 根路径 /?aff=X 命中 RequireAuth 会被折成 /login?redirect=%2F%3Faff%3DX，码只藏在
  // redirect 的内嵌 query 里；resolveReferralCode 会把这层解开并落 sessionStorage。
  // 此前只有 PhoneAuth 与 /signup 调它 —— 国内走 PhoneAuth 所以是好的，海外走
  // EmailLoginPage 没人解，国际站根路径推荐链接 100% 丢码（2026-08-31 在
  // console.modelgo.ai 实测：国内站 mg_referral_code=CN1，国际站 null）。
  // 放这里而不是放进 EmailLoginPage：任何未登录入口最终都落到 /login，一处覆盖两条分支，
  // 也不必等将来新增第三种登录方式时再补一次。
  useEffect(() => {
    resolveReferralCode(searchParams)
  }, [searchParams])

  // 写活：国内是否提供邮箱登录入口，跟随平台配置（enabled_login_methods 含 password）。
  const emailAuthEnabled = useEmailAuthEnabled()
  // 国内默认手机号入口；邮箱入口显式写入 URL，刷新、分享及站点切换后都能保持当前方式。
  const emailMode = market === 'china' && emailAuthEnabled && searchParams.get('method') === 'email'
  const setDomesticMethod = (method: 'phone' | 'email') => {
    const next = new URLSearchParams(searchParams)
    if (method === 'email') next.set('method', 'email')
    else next.delete('method')
    setSearchParams(next, { replace: true })
  }

  if (market === 'global') {
    return <GlobalEmailAuth />
  }

  if (!emailMode) {
    return <PhoneAuth onUseEmail={emailAuthEnabled ? () => setDomesticMethod('email') : undefined} />
  }
  return (
    <EmailLoginPage
      market="china"
      onUsePhone={() => setDomesticMethod('phone')}
    />
  )
}

function EmailLoginPage({ market, onUsePhone }: { market: Market; onUsePhone?: () => void }) {
  const { t } = useTranslation('account')
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
  // 人机校验：图形认证生效时页面渲染可见验证条（gateParam=四元组 JSON）；
  // 验证条不可用/未启用时回退 getCaptchaParam 弹窗流（含验证码 2.0 与降级放行）。
  const [gateParam, setGateParam] = useState<string | null>(null)
  const [gateActive, setGateActive] = useState(false)
  const gateRef = useRef<CaptchaGateHandle | null>(null)
  // 验证通过后自动提交的标志
  const autoSubmitRef = useRef(false)

  const emailSchema = useMemo(() => createEmailSchema(t), [t])
  const passwordSchema = useMemo(() => createPasswordSchema(t), [t])

  const emailForm = useForm<EmailFields>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: remembered || '' },
  })
  const passwordForm = useForm<PasswordFields>({ resolver: zodResolver(passwordSchema) })

  // 已登录即离开登录页；无组织的账号到受保护路由由 ProtectedRoute 渲染 403（不回弹登录，无循环）
  // 走 navigateAfterLogin：重新校验保存的模型登录意图（qa#551），过期/失效降级为普通回跳
  useEffect(() => {
    if (!isSessionLoading && isAuthenticated) {
      void navigateAfterLogin(navigate, redirectAfterLogin)
    }
  }, [isAuthenticated, isSessionLoading, navigate, redirectAfterLogin])

  const onEmailSubmit = async (data: EmailFields) => {
    setLoading(true)
    setServerError('')
    try {
      const result = await checkLoginEmail(data.email)
      if (!result.registered) {
        const method = market === 'china' ? '&method=email' : ''
        navigate(`/signup?email=${encodeURIComponent(data.email)}${method}`)
        return
      }
      setEmail(data.email)
      setStep('password')
    } catch (err) {
      // 被服务端限流时显示它给的等待提示，而不是"邮箱校验失败" —— 后者会让用户以为邮箱有问题。
      setServerError(throttleMessage(err) ?? t('account.auth.login.emailCheckFailed'))
    } finally {
      setLoading(false)
    }
  }

  const doLogin = async (password: string, captchaParam: string | null) => {
    setLoading(true)
    setServerError('')
    let loginOk = false
    try {
      await login({ email, password }, captchaParam)
      loginOk = true
      const session = await getSession()
      if (rememberPassword) {
        saveRememberedEmail(email)
      } else {
        clearRememberedLogin()
      }
      setAuth(
        session.account,
        session.active_tenant_id,
        session.tenants,
        session.active_workspace_id,
        session.permissions?.granted ?? null
      )
      trackEvent('login_success', { method: 'password' }, { result: 'success' })
      // 导航统一交给下面 isAuthenticated 的 effect（navigateAfterLogin 是异步的模型
      // 意图重新校验，这里若再调一次会跟 effect 触发的那次抢跑，导致目的地被互相覆盖）
    } catch (err) {
      // 冷却/限流的判定与秒数都来自服务端（prd#721）：这里只负责把它显示出来。前端曾经自己算
      // （localStorage 的 front-guard），而那套对攻击者零作用、又比服务端更严 —— 多出来的严格
      // 全落在真实用户头上。
      const throttled = throttleMessage(err)
      // loginOk=true 但走进 catch = 登录成功但拉 session 失败；否则是凭据错误
      const errorCode = loginOk ? 'session_failed' : throttled ? 'throttled' : 'invalid_credentials'
      trackEvent('login_fail', { method: 'password' }, { result: 'fail', error_code: errorCode })
      setServerError(
        loginOk
          ? t('account.auth.login.sessionFailed')
          : (throttled ?? t('account.auth.login.invalidCredentials'))
      )
      if (!loginOk) gateRef.current?.reset()
    } finally {
      setLoading(false)
    }
  }

  const onPasswordSubmit = async (data: PasswordFields) => {
    // 验证条生效但未完成 → 调起挑战，等验证通过后自动提交
    if (gateActive && !gateParam) {
      autoSubmitRef.current = true
      gateRef.current?.open()
      return
    }
    // 验证条已通过用其四元组；否则走弹窗流（未启用/降级 → null 照常登录，后端 fail-open）
    const captchaParam = gateParam ?? (await getCaptchaParam())
    await doLogin(data.password, captchaParam)
  }

  // CaptchaGate 验证通过后的回调：自动提交表单。
  // 必须用回调透传的 param（刚验证的四元组），不能读 gateParam：onChange/onVerified 同 tick 连调，此刻 gateParam 仍是旧值 null。
  const handleCaptchaVerified = (param: string) => {
    if (autoSubmitRef.current) {
      autoSubmitRef.current = false
      // 获取当前密码值并提交
      const password = passwordForm.getValues('password')
      if (password) {
        void doLogin(password, param)
      }
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
      title={t(market === 'china' ? 'account.auth.domesticEmailLogin.title' : 'account.auth.login.title')}
      subtitle={t(market === 'china' ? 'account.auth.domesticEmailLogin.subtitle' : 'account.auth.login.subtitle')}
      showMarketSwitcher
      footer={
        onUsePhone ? (
          <span>
            {t('account.auth.login.otherMethod')}{' '}
            <button type="button" onClick={onUsePhone} className="auth-redirect-link">
              {t('account.auth.login.usePhone')}
            </button>
          </span>
        ) : (
          <span>
            {t('account.auth.login.noAccount')}{' '}
            <Link
              to="/signup"
              className="auth-redirect-link"
            >
              {t('account.auth.login.signupFree')}
            </Link>
          </span>
        )
      }
    >
      {step === 'email' ? (
        <form
          key="email-step"
          className="auth-form-container auth-fade-in"
          onSubmit={emailForm.handleSubmit(onEmailSubmit)}
        >
          <div>
            <label className="modern-auth-label">{t('account.auth.fields.email')}</label>
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
            {t('account.auth.login.continue')}
          </Button>
          
          {market === 'china' && <SocialLogin redirectTo={redirectTo} />}
        </form>
      ) : (
        <form
          key="password-step"
          className="auth-form-container auth-slide-in"
          onSubmit={(e) => void passwordForm.handleSubmit(onPasswordSubmit)(e)}
        >
          <div className="auth-email-preview">
            <span className="auth-email-text">{email}</span>
            <button
              type="button"
              onClick={() => { setStep('email'); setServerError('') }}
              className="auth-email-modify-btn"
            >
              {t('account.auth.login.changeEmail')}
            </button>
          </div>
          
          <div>
            <div className="auth-password-header">
              <label className="modern-auth-label" style={{ marginBottom: 0 }}>{t('account.auth.fields.password')}</label>
              <Link
                to={`/forgot-password?email=${encodeURIComponent(email)}`}
                className="auth-forgot-password-link"
              >
                {t('account.auth.login.forgotPassword')}
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
                  aria-label={showPassword ? t('account.auth.aria.hidePassword') : t('account.auth.aria.showPassword')}
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
              <span>{t('account.auth.login.rememberPassword')}</span>
            </label>
          </div>
          
          <CaptchaGate onChange={setGateParam} onVerified={handleCaptchaVerified} onAvailability={setGateActive} handleRef={(h) => { gateRef.current = h }} />

          {serverError && <p className="auth-error-message">{serverError}</p>}

          <Button
            type="submit"
            variant="brand"
            size="lg"
            loading={loading}
          >
            {t('account.auth.login.submit')}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
