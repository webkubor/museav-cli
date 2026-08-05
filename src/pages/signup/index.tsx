/**
 * 控制台注册页面
 * 职责：负责账号注册、邮箱验证码、推荐码归属和前端提交拦截
 * 路由：/signup
 * API：POST /auth/email-code/send、POST /auth/register
 */

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams, Link, Navigate } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { LuEye, LuEyeOff } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

import { AuthLayout } from '@/components/auth/AuthLayout'
import { SocialLogin } from '@/components/auth/SocialLogin'
import { PasswordStrength } from '@/components/auth/PasswordStrength'
import { VerificationCodeButton } from '@/components/auth/VerificationCodeButton'
import { sendEmailCode, register } from '@/services/auth'
import { getCaptchaParam } from '@/lib/aliyun-captcha'
import { CaptchaGate, type CaptchaGateHandle } from '@/components/auth/CaptchaGate'
import { useAuthStore } from '@/store/auth'
import { ModelGoApiError } from '@/lib/request'
import { errorCodeOf } from '@/lib/request-error-message'
import { toast } from '@/lib/toast'
import { trackEvent } from '@/lib/track'
import { checkAuthGuard, clearAuthGuard, recordAuthGuardFailure } from '@/lib/auth/front-guard'
import { getRedirectTarget } from '@/lib/redirect'
import { useMarket } from '@/hooks/useMarket'
import { referralCodeFromSearchParams } from './referral-code'

function createSignupSchema(t: TFunction) {
  return z.object({
    email: z.string().email(t('account.auth.validation.email')),
    email_code: z.string().min(6, t('account.auth.validation.code6')),
    password: z.string().min(8, t('account.auth.validation.passwordMin')),
    confirm_password: z.string().min(1, t('account.auth.validation.confirmPassword')),
    referral_code: z.string().optional(),
  }).refine((data) => data.password === data.confirm_password, {
    message: t('account.auth.validation.passwordMismatch'),
    path: ['confirm_password'],
  })
}

interface Fields {
  email: string
  email_code: string
  password: string
  confirm_password: string
  referral_code?: string
}

/**
 * 注册页入口：国内（china）登录与注册统一为手机号一键入口，重定向到 /login；
 * 海外保留邮箱注册。在此切换而非组件内部 early-return，避免 hooks 数量不一致。
 */
export default function SignupPage() {
  const market = useMarket()
  return market === 'china' ? <DomesticSignupRedirect /> : <EmailSignupPage />
}

function DomesticSignupRedirect() {
  return <Navigate to="/login" replace />
}

function EmailSignupPage() {
  const { t } = useTranslation('account')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const setAuth = useAuthStore((s) => s.setAuth)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isSessionLoading = useAuthStore((s) => s.isLoading)
  const [serverError, setServerError] = useState('')
  // 图形认证可见验证条：生效时注册前必须先通过；不可用时回退弹窗流/放行
  const [gateParam, setGateParam] = useState<string | null>(null)
  const [gateActive, setGateActive] = useState(false)
  const gateRef = useRef<CaptchaGateHandle | null>(null)
  // 验证通过后自动提交的标志
  const autoSubmitRef = useRef(false)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  // 人机校验统一走阿里云验证码 2.0（getCaptchaParam）；旧纯前端滑块已移除。

  const defaultReferralCode = referralCodeFromSearchParams(searchParams)
  const hasReferralCode = !!defaultReferralCode

  const schema = useMemo(() => createSignupSchema(t), [t])

  const {
    register: field,
    handleSubmit,
    control,
    formState: { errors, touchedFields },
  } = useForm<Fields>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      email: searchParams.get('email') ?? '',
      referral_code: defaultReferralCode,
    },
  })

  const emailValue = useWatch({ control, name: 'email' })
  const emailCodeValue = useWatch({ control, name: 'email_code' })
  const passwordValue = useWatch({ control, name: 'password', defaultValue: '' })
  const confirmPasswordValue = useWatch({ control, name: 'confirm_password' })
  const isEmailValid = !!emailValue && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)

  useEffect(() => {
    if (!isSessionLoading && isAuthenticated) navigate('/dashboard', { replace: true })
  }, [isAuthenticated, isSessionLoading, navigate])

  const handleSendCode = async () => {
    const email = emailValue
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return
    }
    const decision = checkAuthGuard({
      action: 'signup-code',
      subject: email,
    })
    if (!decision.allowed) {
      setServerError(decision.message ?? t('account.auth.validation.rateLimited'))
      return
    }

    // qa#299 人机验证：通过取 param；未启用/降级/超时 → null → 照常发码（后端 fail-open）。
    const captchaParam = await getCaptchaParam()
    try {
      const result = await sendEmailCode(email, captchaParam)
      clearAuthGuard({ action: 'signup-code', subject: email })
      return result.expires_in
    } catch (error) {
      recordAuthGuardFailure({ action: 'signup-code', subject: email })
      throw error
    }
  }

  const doRegister = async (data: Fields, captchaParam: string | null) => {
    setLoading(true)
    setServerError('')
    try {
      const invitationToken = searchParams.get('invitation') ?? undefined
      const displayName = data.email.split('@')[0] || 'User'
      const result = await register({
        email: data.email,
        password: data.password,
        display_name: displayName,
        email_code: data.email_code,
        invitation_token: invitationToken,
        referral_code: data.referral_code?.trim() || undefined,
      }, captchaParam)
      setAuth(
        result.account,
        result.default_tenant_id,
        [],
        result.default_workspace_id
      )
      clearAuthGuard({ action: 'signup', subject: data.email })
      trackEvent('signup_success', { method: 'email' }, { result: 'success' })
      navigate('/dashboard')
    } catch (e) {
      recordAuthGuardFailure({ action: 'signup', subject: data.email })
      const msg = e instanceof ModelGoApiError ? e.message : t('account.auth.signup.failed')
      trackEvent('signup_fail', { method: 'email' }, { result: 'fail', error_code: errorCodeOf(e) })
      setServerError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async (data: Fields) => {
    const decision = checkAuthGuard({
      action: 'signup',
      subject: data.email,
    })
    if (!decision.allowed) {
      setServerError(decision.message ?? t('account.auth.validation.rateLimited'))
      return
    }

    // 验证条生效但未完成 → 调起挑战，等验证通过后自动提交
    if (gateActive && !gateParam) {
      autoSubmitRef.current = true
      gateRef.current?.open()
      return
    }
    // 验证条已通过用其四元组；否则弹窗流（未启用/降级 → null 照常注册，后端 fail-open）
    const captchaParam = gateParam ?? (await getCaptchaParam())
    await doRegister(data, captchaParam)
  }

  // CaptchaGate 验证通过后的回调：自动提交表单。
  // 用回调透传的 param（刚验证的四元组）直接注册，不能重跑 onSubmit：onChange/onVerified 同 tick 连调，
  // 此刻 gateParam 仍是旧值 null，会误判 gateActive && !gateParam 而重开验证条 / 掉进 getCaptchaParam 弹窗。
  // 仍走 handleSubmit 以复用 RHF 字段校验；rate-limit guard 已在首次 onSubmit（开验证条前）校验过。
  const handleCaptchaVerified = (param: string) => {
    if (autoSubmitRef.current) {
      autoSubmitRef.current = false
      void handleSubmit((data) => doRegister(data, param))()
    }
  }

  // OAuth 回跳到专用回调页 /auth/callback，由它拉取 session 并落地到目标页
  const redirectTo =
    typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(getRedirectTarget())}`
      : '/'

  return (
    <AuthLayout
      title={t('account.auth.signup.title')}
      subtitle={t('account.auth.signup.subtitle')}
      wide={true}
      footer={
        <span>
          {t('account.auth.signup.hasAccount')}{' '}
          <Link to="/login" className="auth-redirect-link">
            {t('account.auth.signup.login')}
          </Link>
        </span>
      }
    >
      <form
        className="auth-form-container auth-fade-in"
        onSubmit={(e) => void handleSubmit(onSubmit)(e)}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
          <div>
            <label className="modern-auth-label">{t('account.auth.fields.email')}</label>
            <Input
              {...field('email')}
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              error={!!errors.email}
              success={touchedFields.email && !errors.email && !!emailValue}
            />
            {errors.email && <p className="auth-error-message">{errors.email.message}</p>}
          </div>

          <div>
            <label className="modern-auth-label">{t('account.auth.fields.code')}</label>
            <Input
              {...field('email_code')}
              placeholder={t('account.auth.placeholders.code6')}
              maxLength={6}
              autoComplete="one-time-code"
              error={!!errors.email_code}
              success={touchedFields.email_code && !errors.email_code && !!emailCodeValue}
              suffix={
                <div className="flex items-center transition-all duration-300 ease-out min-h-[20px] pr-0.5">
                  <VerificationCodeButton onSend={handleSendCode} disabled={!isEmailValid} />
                </div>
              }
            />
            {errors.email_code && <p className="auth-error-message">{errors.email_code.message}</p>}
          </div>

          <div>
            <label className="modern-auth-label">{t('account.auth.fields.password')}</label>
            <Input
              {...field('password')}
              type={showPassword ? 'text' : 'password'}
              placeholder={t('account.auth.placeholders.passwordMin')}
              autoComplete="new-password"
              error={!!errors.password}
              success={touchedFields.password && !errors.password && !!passwordValue}
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
            <PasswordStrength password={passwordValue} />
            {errors.password && <p className="auth-error-message">{errors.password.message}</p>}
          </div>

          <div>
            <label className="modern-auth-label">{t('account.auth.fields.confirmPassword')}</label>
            <Input
              {...field('confirm_password')}
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder={t('account.auth.placeholders.confirmPassword')}
              autoComplete="new-password"
              error={!!errors.confirm_password}
              success={touchedFields.confirm_password && !errors.confirm_password && !!confirmPasswordValue}
              suffix={
                <button
                  type="button"
                  className="auth-password-visibility-btn"
                  onClick={() => setShowConfirmPassword((visible) => !visible)}
                  aria-label={showConfirmPassword ? t('account.auth.aria.hidePassword') : t('account.auth.aria.showPassword')}
                >
                  {showConfirmPassword ? <LuEyeOff size={17} /> : <LuEye size={17} />}
                </button>
              }
            />
            {errors.confirm_password && <p className="auth-error-message">{errors.confirm_password.message}</p>}
          </div>


          {hasReferralCode && (
            <div>
              <label className="modern-auth-label">{t('account.auth.fields.referralCode')}</label>
              <Input
                {...field('referral_code')}
                placeholder={t('account.auth.placeholders.referralCode')}
                autoComplete="off"
                disabled={true}
              />
            </div>
          )}
        </div>

        <CaptchaGate onChange={setGateParam} onVerified={handleCaptchaVerified} onAvailability={setGateActive} handleRef={(h) => { gateRef.current = h }} />

        {serverError && <p className="auth-error-message">{serverError}</p>}

        <Button
          htmlType="submit"
          variant="brand"
          size="lg"
          loading={loading}
          className="mt-2"
        >
          {t('account.auth.signup.submit')}
        </Button>

        <p className="auth-policy-text">
          {t('account.auth.legal.signupPrefix')}{' '}
          <Link to="/legal/terms" className="auth-muted-link">{t('account.auth.legal.terms')}</Link>
          {' '}{t('account.auth.legal.and')}{' '}
          <Link to="/legal/privacy" className="auth-muted-link">{t('account.auth.legal.privacy')}</Link>
        </p>

        <SocialLogin redirectTo={redirectTo} />
      </form>
    </AuthLayout>
  )
}
