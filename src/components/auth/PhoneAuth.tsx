/**
 * 国内（domestic）手机号一键登录/注册入口
 * 职责：手机号 + 短信验证码统一入口，验证通过即建号或登录。登录与注册不分页。
 * 路由：复用 /login（不新增路由）；/signup 在 domestic 重定向到此
 * API：POST /auth/sms-code/send；登录提交见 services/auth.ts phoneLoginRegister（接口待定）
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
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
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    getValues,
    trigger,
    formState: { errors },
  } = useForm<Fields>({ resolver: zodResolver(schema), mode: 'onTouched' })

  useEffect(() => {
    if (!isSessionLoading && isAuthenticated) {
      navigate(redirectAfterLogin, { replace: true })
    }
  }, [isAuthenticated, isSessionLoading, navigate, redirectAfterLogin])

  const handleSendCode = async () => {
    // 仅校验手机号字段后再发码
    if (!(await trigger('phone'))) return
    const phone = getValues('phone')
    const decision = checkAuthGuard({ action: 'phone-code', subject: phone })
    if (!decision.allowed) {
      setServerError(decision.message ?? '操作过于频繁，请稍后再试')
      return
    }
    setServerError('')
    try {
      const result = await sendSmsCode(phone)
      clearAuthGuard({ action: 'phone-code', subject: phone })
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
      recordAuthGuardFailure({ action: 'phone-login', subject: data.phone })
      setServerError('验证码错误或已失效，请重试')
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
            suffix={<VerificationCodeButton onSend={handleSendCode} />}
          />
          {errors.code && <p className="auth-error-message">{errors.code.message}</p>}
        </div>

        {serverError && <p className="auth-error-message">{serverError}</p>}

        <Button type="submit" variant="brand" size="lg" loading={loading}>
          登录 / 注册
        </Button>

        <SocialLogin redirectTo={redirectTo} />
      </form>
    </AuthLayout>
  )
}
