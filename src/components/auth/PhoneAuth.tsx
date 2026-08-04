/**
 * 国内（china）手机号一键登录/注册入口
 * 职责：手机号 + 短信验证码统一入口，验证通过即建号或登录。登录与注册不分页。
 * 路由：复用 /login（不新增路由）；/signup 在 china（国内）重定向到此
 * API：POST /auth/sms-code/send；登录提交见 services/auth.ts phoneLoginRegister（接口待定）
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { SocialLogin } from '@/components/auth/SocialLogin'
import { VerificationCodeButton, type VerificationCodeButtonHandle } from '@/components/auth/VerificationCodeButton'
import { sendSmsCode, phoneLoginRegister, getSession } from '@/services/auth'
import { useAuthStore } from '@/store/auth'
import {
  checkAuthGuard,
  clearAuthGuard,
  recordAuthGuardFailure,
} from '@/lib/auth/front-guard'
import { getRedirectTarget } from '@/lib/redirect'
import { navigateAfterLogin } from '@/lib/login-intent'
import { getRequestErrorMessage, errorCodeOf } from '@/lib/request-error-message'
import { getCaptchaParam } from '@/lib/aliyun-captcha'
import { CaptchaGate, type CaptchaGateHandle } from '@/components/auth/CaptchaGate'
import { trackEvent } from '@/lib/track'

function createPhoneAuthSchema(t: TFunction) {
  return z.object({
    phone: z.string().regex(/^1[3-9]\d{9}$/, t('account.auth.validation.phone')),
    code: z.string().regex(/^\d{6}$/, t('account.auth.validation.code6')),
  })
}

type Fields = { phone: string; code: string }

export function PhoneAuth({ onUseEmail }: { onUseEmail?: () => void }) {
  const { t } = useTranslation('account')
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
  // 发码按钮命令式句柄：人机验证通过后自动触发发码（须走按钮 handleClick 才会启动倒计时）
  const codeBtnRef = useRef<VerificationCodeButtonHandle | null>(null)
  // onVerified 透传的四元组暂存：同 tick gateParam state 尚未刷新，handleSendCode 直接读它（需求方 #248）
  const autoSendParamRef = useRef<string | null>(null)
  const [loading, setLoading] = useState(false)

  const schema = useMemo(() => createPhoneAuthSchema(t), [t])

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

  // 走 navigateAfterLogin：重新校验保存的模型登录意图（qa#551），过期/失效降级为普通回跳
  useEffect(() => {
    if (!isSessionLoading && isAuthenticated) {
      void navigateAfterLogin(navigate, redirectAfterLogin)
    }
  }, [isAuthenticated, isSessionLoading, navigate, redirectAfterLogin])

  const handleSendCode = async () => {
    // 校验/限流失败必须 throw：VerificationCodeButton 仅在 onSend 不抛错时才启动倒计时，
    // 静默 return 会导致「没真正发码却显示已发送并锁 60s」的假倒计时。
    if (!(await trigger('phone'))) throw new Error(t('account.auth.validation.phone'))
    const phone = getValues('phone')
    const decision = checkAuthGuard({ action: 'phone-code', subject: phone })
    if (!decision.allowed) {
      throw new Error(decision.message ?? t('account.auth.validation.rateLimited'))
    }
    setServerError('')
    // 人机验证通过后由 CaptchaGate onVerified 自动触发本函数，透传的四元组暂存在 autoSendParamRef
    // （同 tick gateParam state 尚未刷新，必须直接读 ref，消费即清）
    const pendingParam = autoSendParamRef.current
    autoSendParamRef.current = null
    // 验证条生效但未完成 → 调起挑战；通过后 onVerified 会自动重试发码，无需用户再点（需求方 #248）
    if (gateActive && !gateParam && !pendingParam) {
      gateRef.current?.open()
      throw new Error(t('account.auth.validation.securityVerificationRequired'))
    }
    // 验证条已通过用其四元组；否则弹窗流（未启用/降级 → null 照常发码，后端 fail-open）
    const captchaParam = pendingParam ?? gateParam ?? (await getCaptchaParam())
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
      setServerError(decision.message ?? t('account.auth.validation.rateLimited'))
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
      // 导航统一交给下面 isAuthenticated 的 effect，避免和它抢跑覆盖目的地
    } catch (error) {
      recordAuthGuardFailure({ action: 'phone-login', subject: data.phone })
      // 展示后端返回的细分中文文案（验证码错误/已失效、账户冻结、发送过频等），
      // 5xxxx 内部错误由 getRequestErrorMessage 归一为通用「服务暂不可用」提示。
      trackEvent('login_fail', { method: 'phone' }, { result: 'fail', error_code: errorCodeOf(error) })
      setServerError(getRequestErrorMessage(error, t('account.auth.login.failed')))
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
      title={t('account.auth.phoneLogin.title')}
      subtitle={t('account.auth.phoneLogin.subtitle')}
      footer={
        onUseEmail ? (
          <span>
            {t('account.auth.login.otherMethod')}{' '}
            <button type="button" onClick={onUseEmail} className="auth-redirect-link">
              {t('account.auth.phoneLogin.useEmail')}
            </button>
          </span>
        ) : undefined
      }
    >
      <form className="auth-form-container auth-fade-in" onSubmit={handleSubmit(onSubmit)}>
        <div>
          <label className="modern-auth-label">{t('account.auth.fields.phone')}</label>
          <Input
            {...register('phone')}
            type="tel"
            inputMode="numeric"
            maxLength={11}
            placeholder={t('account.auth.placeholders.phone')}
            autoComplete="tel"
            autoFocus
            prefix={<span className="text-sm text-mg-text-2">+86</span>}
          />
          {errors.phone && <p className="auth-error-message">{errors.phone.message}</p>}
        </div>

        <div>
          <label className="modern-auth-label">{t('account.auth.fields.code')}</label>
          <Input
            {...register('code')}
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder={t('account.auth.placeholders.smsCode6')}
            autoComplete="one-time-code"
            suffix={<VerificationCodeButton ref={codeBtnRef} onSend={handleSendCode} disabled={!isPhoneValid} />}
          />
          {errors.code && <p className="auth-error-message">{errors.code.message}</p>}
        </div>

        <CaptchaGate onChange={setGateParam} onVerified={(param) => { autoSendParamRef.current = param; codeBtnRef.current?.trigger() }} onAvailability={setGateActive} handleRef={(h) => { gateRef.current = h }} />

        {serverError && <p className="auth-error-message">{serverError}</p>}

        <Button type="submit" variant="brand" size="lg" loading={loading}>
          {t('account.auth.phoneLogin.submit')}
        </Button>

        <p className="auth-policy-text">
          {t('account.auth.legal.phonePrefix')}{' '}
          <Link to="/legal/terms" className="auth-muted-link">{t('account.auth.legal.terms')}</Link>
          {' '}{t('account.auth.legal.and')}{' '}
          <Link to="/legal/privacy" className="auth-muted-link">{t('account.auth.legal.privacy')}</Link>
        </p>

        <SocialLogin redirectTo={redirectTo} />
      </form>
    </AuthLayout>
  )
}
