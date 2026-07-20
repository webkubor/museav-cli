/**
 * 控制台注册页面
 * 职责：负责账号注册、邮箱验证码、推荐码归属和前端提交拦截
 * 路由：/signup
 * API：POST /auth/email-code/send、POST /auth/register
 */

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams, Link, Navigate } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { LuEye, LuEyeOff } from 'react-icons/lu'

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

const schema = z.object({
  email: z.string().email('请填写有效的邮箱'),
  email_code: z.string().min(6, '请填写 6 位验证码'),
  password: z.string().min(8, '密码至少 8 位'),
  confirm_password: z.string().min(1, '请确认密码'),
  referral_code: z.string().optional(),
}).refine((data) => data.password === data.confirm_password, {
  message: '两次输入的密码不一致',
  path: ['confirm_password'],
})

type Fields = z.infer<typeof schema>

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
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  // 人机校验统一走阿里云验证码 2.0（getCaptchaParam）；旧纯前端滑块已移除。

  const defaultReferralCode = referralCodeFromSearchParams(searchParams)
  const hasReferralCode = !!defaultReferralCode

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
      setServerError(decision.message ?? '操作过于频繁，请稍后再试')
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

  const onSubmit = async (data: Fields) => {
    const decision = checkAuthGuard({
      action: 'signup',
      subject: data.email,
    })
    if (!decision.allowed) {
      setServerError(decision.message ?? '操作过于频繁，请稍后再试')
      return
    }

    // 验证条生效但未完成 → 调起挑战，等回填后再提交
    if (gateActive && !gateParam) {
      gateRef.current?.open()
      return
    }
    // 验证条已通过用其四元组；否则弹窗流（未启用/降级 → null 照常注册，后端 fail-open）
    const captchaParam = gateParam ?? (await getCaptchaParam())

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
        // 推荐计划邀请码：?aff= 预填或用户手填，注册时做返佣归属
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
      const msg = e instanceof ModelGoApiError ? e.message : '注册失败，请稍后重试'
      trackEvent('signup_fail', { method: 'email' }, { result: 'fail', error_code: errorCodeOf(e) })
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
      wide={true}
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
        onSubmit={(e) => void handleSubmit(onSubmit)(e)}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
          <div>
            <label className="modern-auth-label">邮箱</label>
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
            <label className="modern-auth-label">验证码</label>
            <Input
              {...field('email_code')}
              placeholder="6 位数字"
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
            <label className="modern-auth-label">密码</label>
            <Input
              {...field('password')}
              type={showPassword ? 'text' : 'password'}
              placeholder="至少 8 位"
              autoComplete="new-password"
              error={!!errors.password}
              success={touchedFields.password && !errors.password && !!passwordValue}
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
            <PasswordStrength password={passwordValue} />
            {errors.password && <p className="auth-error-message">{errors.password.message}</p>}
          </div>

          <div>
            <label className="modern-auth-label">确认密码</label>
            <Input
              {...field('confirm_password')}
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="请再次输入密码"
              autoComplete="new-password"
              error={!!errors.confirm_password}
              success={touchedFields.confirm_password && !errors.confirm_password && !!confirmPasswordValue}
              suffix={
                <button
                  type="button"
                  className="auth-password-visibility-btn"
                  onClick={() => setShowConfirmPassword((visible) => !visible)}
                  aria-label={showConfirmPassword ? '隐藏密码' : '显示密码'}
                >
                  {showConfirmPassword ? <LuEyeOff size={17} /> : <LuEye size={17} />}
                </button>
              }
            />
            {errors.confirm_password && <p className="auth-error-message">{errors.confirm_password.message}</p>}
          </div>


          {hasReferralCode && (
            <div>
              <label className="modern-auth-label">邀请码</label>
              <Input
                {...field('referral_code')}
                placeholder="如有推荐邀请码请填写，如 MG-XXXX"
                autoComplete="off"
                disabled={true}
              />
            </div>
          )}
        </div>

        <CaptchaGate onChange={setGateParam} onAvailability={setGateActive} handleRef={(h) => { gateRef.current = h }} />

        {serverError && <p className="auth-error-message">{serverError}</p>}

        <Button
          htmlType="submit"
          variant="brand"
          size="lg"
          loading={loading}
          className="mt-2"
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
