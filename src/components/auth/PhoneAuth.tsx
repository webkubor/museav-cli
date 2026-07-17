/**
 * 国内（china）手机号一键登录/注册入口
 * 职责：手机号 + 短信验证码统一入口，验证通过即建号或登录。登录与注册不分页。
 * 路由：复用 /login（不新增路由）；/signup 在 china（国内）重定向到此
 * API：POST /auth/sms-code/send；登录提交见 services/auth.ts phoneLoginRegister（接口待定）
 */

import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { SocialLogin } from '@/components/auth/SocialLogin'
import { VerificationCodeButton } from '@/components/auth/VerificationCodeButton'
import { sendSmsCode, phoneLoginRegister, getSession } from '@/services/auth'
import { useAuthStore } from '@/store/auth'
import {
  checkAuthGuard,
  clearAuthGuard,
  recordAuthGuardFailure,
} from '@/lib/auth/front-guard'
import { getRedirectTarget } from '@/lib/redirect'
import { getRequestErrorMessage, errorCodeOf } from '@/lib/request-error-message'
import { getCaptchaParam } from '@/lib/aliyun-captcha'
import { CaptchaGate, type CaptchaGateHandle } from '@/components/auth/CaptchaGate'
import { trackEvent } from '@/lib/track'

const schema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, '请填写有效的手机号'),
  code: z.string().regex(/^\d{6}$/, '请填写 6 位验证码'),
})

type Fields = z.infer<typeof schema>

export function PhoneAuth({ onUseEmail }: { onUseEmail?: () => void }) {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isSessionLoading = useAuthStore((s) => s.isLoading)

  const [redirectAfterLogin] = useState(() => getRedirectTarget())
  const [serverError, setServerError] = useState('')
  // 图形认证可见验证条：生效时发码前必须先通过（发码是刷量主入口）；发码消费
  // 一次性四元组后自动重置。不可用时回退弹窗流/放行。
  const [gateParam, setGateParam] = useState<string | null>(null)
  const [gateActive, setGateActive] = useState(false)
  const gateRef = useRef<CaptchaGateHandle | null>(null)
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    getValues,
    trigger,
    watch,
    formState: { errors },
  } = useForm<Fields>({ resolver: zodResolver(schema), mode: 'onTouched' })

  const phoneValue = watch('phone')
  const isPhoneValid = /^1[3-9]\d{9}$/.test(phoneValue ?? '')

  useEffect(() => {
    if (!isSessionLoading && isAuthenticated) {
      navigate(redirectAfterLogin, { replace: true })
    }
  }, [isAuthenticated, isSessionLoading, navigate, redirectAfterLogin])

  const handleSendCode = async () => {
    // 校验/限流失败必须 throw：VerificationCodeButton 仅在 onSend 不抛错时才启动倒计时，
    // 静默 return 会导致「没真正发码却显示已发送并锁 60s」的假倒计时。
    if (!(await trigger('phone'))) throw new Error('请填写有效的手机号')
    const phone = getValues('phone')
    const decision = checkAuthGuard({ action: 'phone-code', subject: phone })
    if (!decision.allowed) {
      throw new Error(decision.message ?? '操作过于频繁，请稍后再试')
    }
    setServerError('')
    // 验证条生效但未完成 → 调起挑战；完成后用户再点发送
    if (gateActive && !gateParam) {
      gateRef.current?.open()
      throw new Error('请先完成安全验证')
    }
    // 验证条已通过用其四元组；否则弹窗流（未启用/降级 → null 照常发码，后端 fail-open）
    const captchaParam = gateParam ?? (await getCaptchaParam())
    try {
      const result = await sendSmsCode(phone, captchaParam)
      clearAuthGuard({ action: 'phone-code', subject: phone })
      gateRef.current?.reset() // 四元组一次性，发码即消费
      return result.expires_in
    } catch (error) {
      recordAuthGuardFailure({ action: 'phone-code', subject: phone })
      throw error
    }
  }

  const onSubmit = async (data: Fields) => {
    const decision = checkAuthGuard({ action: 'phone-login', subject: data.phone })
    if (!decision.allowed) {
      setServerError(decision.message ?? '操作过于频繁，请稍后再试')
      return
    }
    setLoading(true)
    setServerError('')
    try {
      await phoneLoginRegister(data.phone, data.code)
      const session = await getSession()
      clearAuthGuard({ action: 'phone-login', subject: data.phone })
      setAuth(
        session.account,
        session.active_tenant_id,
        session.tenants,
        session.active_workspace_id,
        session.permissions?.granted ?? null
      )
      trackEvent('login_success', { method: 'phone' }, { result: 'success' })
      navigate(redirectAfterLogin, { replace: true })
    } catch (error) {
      recordAuthGuardFailure({ action: 'phone-login', subject: data.phone })
      // 展示后端返回的细分中文文案（验证码错误/已失效、账户冻结、发送过频等），
      // 5xxxx 内部错误由 getRequestErrorMessage 归一为通用「服务暂不可用」提示。
      trackEvent('login_fail', { method: 'phone' }, { result: 'fail', error_code: errorCodeOf(error) })
      setServerError(getRequestErrorMessage(error, '登录失败，请稍后重试'))
    } finally {
      setLoading(false)
    }
  }

  const redirectTo =
    typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(getRedirectTarget())}`
      : '/'

  return (
    <AuthLayout
      title="登录 / 注册"
      subtitle="未注册的手机号将自动注册并登录"
      footer={
        onUseEmail ? (
          <span>
            其他方式？{' '}
            <button type="button" onClick={onUseEmail} className="auth-redirect-link">
              使用邮箱登录
            </button>
          </span>
        ) : undefined
      }
    >
      <form className="auth-form-container auth-fade-in" onSubmit={handleSubmit(onSubmit)}>
        <div>
          <label className="modern-auth-label">手机号</label>
          <Input
            {...register('phone')}
            type="tel"
            inputMode="numeric"
            maxLength={11}
            placeholder="请输入手机号"
            autoComplete="tel"
            autoFocus
            prefix={<span className="text-sm text-mg-text-2">+86</span>}
          />
          {errors.phone && <p className="auth-error-message">{errors.phone.message}</p>}
        </div>

        <div>
          <label className="modern-auth-label">验证码</label>
          <Input
            {...register('code')}
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="6 位短信验证码"
            autoComplete="one-time-code"
            suffix={<VerificationCodeButton onSend={handleSendCode} disabled={!isPhoneValid} />}
          />
          {errors.code && <p className="auth-error-message">{errors.code.message}</p>}
        </div>

        <CaptchaGate onChange={setGateParam} onAvailability={setGateActive} handleRef={(h) => { gateRef.current = h }} />

        {serverError && <p className="auth-error-message">{serverError}</p>}

        <Button type="submit" variant="brand" size="lg" loading={loading}>
          登录 / 注册
        </Button>

        <p className="auth-policy-text">
          登录 / 注册即代表同意{' '}
          <Link to="/legal/terms" className="auth-muted-link">服务条款</Link>
          {' '}与{' '}
          <Link to="/legal/privacy" className="auth-muted-link">隐私政策</Link>
        </p>

        <SocialLogin redirectTo={redirectTo} />
      </form>
    </AuthLayout>
  )
}
