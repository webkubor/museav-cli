import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { LuEye, LuEyeOff } from 'react-icons/lu'

import { AuthLayout } from '@/components/auth/AuthLayout'
import { SocialLogin } from '@/components/auth/SocialLogin'
import { PasswordStrength } from '@/components/auth/PasswordStrength'
import { VerificationCodeButton } from '@/components/auth/VerificationCodeButton'
import { sendEmailCode, register } from '@/services/auth'
import { useAuthStore } from '@/store/auth'
import { ModelGoApiError } from '@/lib/request'
import { toast } from '@/lib/toast'
import { getRedirectTarget } from '@/lib/redirect'
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

export default function SignupPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const setAuth = useAuthStore((s) => s.setAuth)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isSessionLoading = useAuthStore((s) => s.isLoading)
  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const defaultReferralCode = referralCodeFromSearchParams(searchParams)
  const hasReferralCode = !!defaultReferralCode

  const {
    register: field,
    handleSubmit,
    watch,
    formState: { errors, touchedFields },
  } = useForm<Fields>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      email: searchParams.get('email') ?? '',
      referral_code: defaultReferralCode,
    },
  })

  const emailValue = watch('email')
  const emailCodeValue = watch('email_code')
  const passwordValue = watch('password', '')
  const confirmPasswordValue = watch('confirm_password')
  const isEmailValid = !!emailValue && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)


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
      const displayName = data.email.split('@')[0] || 'User'
      const result = await register({
        email: data.email,
        password: data.password,
        display_name: displayName,
        email_code: data.email_code,
        invitation_token: invitationToken,
        // 推荐计划邀请码：?aff= 预填或用户手填，注册时做返佣归属
        referral_code: data.referral_code?.trim() || undefined,
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
        onSubmit={handleSubmit(onSubmit)}
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
