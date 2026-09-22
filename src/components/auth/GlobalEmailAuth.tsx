/**
 * Global 站两步式免密登录/注册。
 * 第一步选择 Google/GitHub 或提交邮箱，第二步单独完成邮箱验证码校验。
 *
 * 接口口径（2026-09-22 对齐真实后端，原型 mock 已全部拆除）：
 * - 发码 → `auth/email-code/send`（与国内邮箱腿同一个端点）
 * - 登录/注册 → `auth/email-code/login`（**后端尚未提供**，见 services/auth.ts 的 TODO；
 *   端点上线前这一步会返回 40401，页面按普通服务端错误展示，不再假装成功）
 * - 第三方 → 真实 `auth/oauth/:provider/authorize` 浏览器导航（先解人机校验再跳）
 * - 人机校验 → 真实 alicaptcha（getCaptchaOutcome），不再是定时器假通过
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  LuArrowLeft,
  LuArrowRight,
  LuInfo,
  LuLoaderCircle,
  LuMailCheck,
  LuShieldCheck,
} from 'react-icons/lu'

import { AuthLayout } from '@/components/auth/AuthLayout'
import { GlobalDiscountShowcase } from '@/components/auth/GlobalDiscountShowcase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { OAUTH_ICONS, OAUTH_LABELS } from '@/constants/oauth'
import {
  emailCodeLoginRegister,
  getSession,
  oauthAuthorizeUrl,
  sendEmailCode,
  type OAuthProvider,
} from '@/services/auth'
import { getCaptchaOutcome, getCaptchaParam } from '@/lib/aliyun-captcha'
import { useAuthStore } from '@/store/auth'
import { getRedirectTarget } from '@/lib/redirect'
import { navigateAfterLogin } from '@/lib/login-intent'
import { resolveReferralCode } from '@/pages/signup/referral-code'
import { trackEvent } from '@/lib/track'

/** 本页固定两个第三方入口（国际站允许集 = google / github，见 SocialLogin 的域名权威口径）。 */
type GlobalOAuthProvider = Extract<OAuthProvider, 'google' | 'github'>

function createEmailSchema(t: TFunction) {
  return z.object({ email: z.string().email(t('account.auth.validation.email')) })
}

function createCodeSchema(t: TFunction) {
  return z.object({ code: z.string().regex(/^\d{6}$/, t('account.auth.validation.code6')) })
}

type EmailFields = { email: string }
type CodeFields = { code: string }
type EmailStep = 'entry' | 'code'
type HumanVerificationState = 'idle' | 'verifying' | 'verified'

const RESEND_SECONDS = 60

export function GlobalEmailAuth() {
  const { t } = useTranslation('account')
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isSessionLoading = useAuthStore((s) => s.isLoading)
  const [redirectAfterLogin] = useState(() => getRedirectTarget())
  // 人机校验四元组一次性消费：发码用掉的那一组不能再拿去登录（手机号腿实测 40025）。
  // 用 state 而不是 ref —— 它要参与提交按钮可用性的渲染判断，ref 在 render 期读不合法。
  const [captchaParam, setCaptchaParam] = useState<string | null>(null)
  const [step, setStep] = useState<EmailStep>('entry')
  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendSeconds, setResendSeconds] = useState(0)
  const [pendingProvider, setPendingProvider] = useState<GlobalOAuthProvider | null>(null)
  const [humanVerification, setHumanVerification] = useState<HumanVerificationState>('idle')

  const emailSchema = useMemo(() => createEmailSchema(t), [t])
  const codeSchema = useMemo(() => createCodeSchema(t), [t])
  const emailForm = useForm<EmailFields>({
    resolver: zodResolver(emailSchema),
    mode: 'onTouched',
    defaultValues: { email: searchParams.get('email') ?? '' },
  })
  const codeForm = useForm<CodeFields>({
    resolver: zodResolver(codeSchema),
    mode: 'onTouched',
    defaultValues: { code: '' },
  })

  const emailValue = useWatch({ control: emailForm.control, name: 'email' })

  useEffect(() => {
    if (step !== 'code' || resendSeconds <= 0) return
    const timer = window.setInterval(() => {
      setResendSeconds((seconds) => Math.max(0, seconds - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [step, resendSeconds])

  // 已登录直接离开登录页；导航统一走 navigateAfterLogin（重新校验模型登录意图，qa#551）
  useEffect(() => {
    if (!isSessionLoading && isAuthenticated) {
      void navigateAfterLogin(navigate, redirectAfterLogin)
    }
  }, [isAuthenticated, isSessionLoading, navigate, redirectAfterLogin])

  /** 真实人机校验：呈现挑战并等用户解题；未启用/SDK 不可用时按放行处理（后端 fail-open）。 */
  const runHumanVerification = async () => {
    setServerError('')
    setHumanVerification('verifying')
    try {
      const { param, presented } = await getCaptchaOutcome()
      if (!param && presented) {
        // 呈现过但没解出来（关弹窗/超时）→ 退回未验证，不能放行
        setHumanVerification('idle')
        return
      }
      setCaptchaParam(param)
      setHumanVerification('verified')
    } catch {
      setHumanVerification('idle')
      setServerError(t('account.auth.globalEmailAuth.failed'))
    }
  }

  /** 发码。四元组由调用方给：它一次性消费，发完这组就作废，登录那一步必须另取一组。 */
  const sendCode = async (email: string, param: string | null) => {
    const result = await sendEmailCode(email, param)
    setCaptchaParam(null)
    setResendSeconds(RESEND_SECONDS)
    return result
  }

  const handleContinueEmail = async (data: EmailFields) => {
    if (humanVerification !== 'verified') {
      setServerError(t('account.auth.validation.securityVerificationRequired'))
      return
    }
    setLoading(true)
    setServerError('')
    try {
      await sendCode(data.email, captchaParam)
      codeForm.reset({ code: '' })
      setStep('code')
    } catch (error) {
      setServerError(error instanceof Error ? error.message : t('account.auth.globalEmailAuth.failed'))
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendSeconds > 0 || loading) return
    setLoading(true)
    setServerError('')
    try {
      // 重发同样要带四元组：上一组已在首次发码时消费。
      await sendCode(emailForm.getValues('email'), await getCaptchaParam())
    } catch (error) {
      setServerError(error instanceof Error ? error.message : t('account.auth.globalEmailAuth.failed'))
    } finally {
      setLoading(false)
    }
  }

  const handleCodeSubmit = async (data: CodeFields) => {
    const email = emailForm.getValues('email')
    setLoading(true)
    setServerError('')
    try {
      await emailCodeLoginRegister(
        email,
        data.code,
        await getCaptchaParam(),
        resolveReferralCode(searchParams) || undefined,
        searchParams.get('invitation') ?? undefined,
      )
      // 会话由服务端 cookie 下发，读回来填 store；导航交给上面 isAuthenticated 的 effect。
      const session = await getSession()
      setAuth(
        session.account,
        session.active_tenant_id,
        session.tenants,
        session.active_workspace_id,
        session.permissions?.granted ?? null,
      )
      trackEvent('login_success', { method: 'email_code' }, { result: 'success' })
    } catch (error) {
      setServerError(error instanceof Error ? error.message : t('account.auth.globalEmailAuth.failed'))
    } finally {
      setLoading(false)
    }
  }

  const handleOAuth = async (provider: GlobalOAuthProvider) => {
    if (pendingProvider) return
    setPendingProvider(provider)
    setServerError('')
    try {
      // 与 SocialLogin 同口径：**先解题拿 token 再导航**。带空 token 会被后端 302 弹回
      // 登录页，用户看到的是"点一下立刻跳回来"；而挑战根本呈现不出来时必须照常导航。
      const { param, presented } = await getCaptchaOutcome()
      if (!param && presented) return
      window.location.assign(oauthAuthorizeUrl(provider, redirectAfterLogin, param))
    } catch (error) {
      setServerError(error instanceof Error ? error.message : t('account.auth.globalEmailAuth.failed'))
    } finally {
      setPendingProvider(null)
    }
  }

  const useDifferentEmail = () => {
    setStep('entry')
    setHumanVerification('idle')
    setResendSeconds(0)
    setServerError('')
    codeForm.reset({ code: '' })
  }


  const title = step === 'code'
    ? t('account.auth.globalEmailAuth.checkEmailTitle')
    : t('account.auth.globalEmailAuth.entryTitle')
  const subtitle = step === 'code'
    ? t('account.auth.globalEmailAuth.checkEmailSubtitle', { email: emailValue })
    : t('account.auth.globalEmailAuth.entrySubtitle')

  return (
    <AuthLayout
      title={title}
      subtitle={subtitle}
      aside={<GlobalDiscountShowcase />}
      showMarketSwitcher
    >
      {step === 'entry' ? (
        <form
          className="auth-form-container auth-fade-in"
          onSubmit={emailForm.handleSubmit(handleContinueEmail)}
        >
          <div className="auth-global-social-group">
            {(['google', 'github'] as const).map((provider) => (
              <Button
                key={provider}
                type="button"
                variant="secondary"
                className="social-btn"
                aria-label={OAUTH_LABELS[provider]}
                loading={pendingProvider === provider}
                disabled={pendingProvider !== null}
                onClick={() => { void handleOAuth(provider) }}
              >
                {OAUTH_ICONS[provider]}
                <span>{t('account.auth.globalEmailAuth.continueWith', { provider: OAUTH_LABELS[provider] })}</span>
              </Button>
            ))}
          </div>

          <div className="social-divider auth-global-divider">
            <div className="social-divider-line" />
            <span className="social-divider-text">{t('account.auth.social.divider')}</span>
            <div className="social-divider-line" />
          </div>

          <div>
            <label className="modern-auth-label">{t('account.auth.fields.email')}</label>
            <Input
              {...emailForm.register('email')}
              type="email"
              placeholder="you@company.com"
              autoComplete="email"
              autoFocus
            />
            {emailForm.formState.errors.email && (
              <p className="auth-error-message">{emailForm.formState.errors.email.message}</p>
            )}
          </div>

          {serverError && <p className="auth-error-message">{serverError}</p>}

          <p className="auth-global-assurance">
            <span>{t('account.auth.globalEmailAuth.accountNotice')}</span>
          </p>

          <button
            type="button"
            className={`auth-captcha-gate${humanVerification === 'verified' ? ' is-verified' : ''}`}
            disabled={humanVerification !== 'idle'}
            aria-live="polite"
            onClick={() => { void runHumanVerification() }}
          >
            {humanVerification === 'verifying' ? (
              <LuLoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <LuShieldCheck size={16} aria-hidden="true" />
            )}
            <span>
              {t(
                humanVerification === 'verified'
                  ? 'account.auth.globalEmailAuth.humanVerified'
                  : humanVerification === 'verifying'
                    ? 'account.auth.globalEmailAuth.humanVerifying'
                    : 'account.auth.globalEmailAuth.humanVerification',
              )}
            </span>
          </button>

          <Button
            type="submit"
            variant="brand"
            size="lg"
            loading={loading}
            disabled={humanVerification !== 'verified'}
          >
            <span>{t('account.auth.globalEmailAuth.continueEmail')}</span>
            <LuArrowRight size={17} aria-hidden="true" />
          </Button>

          <p className="auth-policy-text">
            {t('account.auth.legal.emailCodePrefix')}{' '}
            <Link to="/legal/terms" className="auth-muted-link">{t('account.auth.legal.terms')}</Link>
            {' '}{t('account.auth.legal.and')}{' '}
            <Link to="/legal/privacy" className="auth-muted-link">{t('account.auth.legal.privacy')}</Link>
          </p>
        </form>
      ) : (
        <form
          className="auth-form-container auth-fade-in"
          onSubmit={codeForm.handleSubmit(handleCodeSubmit)}
        >
          <div className="auth-global-code-note">
            <LuInfo size={17} aria-hidden="true" />
            <span>{t('account.auth.globalEmailAuth.codeHelp')}</span>
          </div>

          <div>
            <label className="modern-auth-label">{t('account.auth.globalEmailAuth.codeLabel')}</label>
            <Input
              {...codeForm.register('code')}
              className="auth-global-code-input"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder={t('account.auth.placeholders.emailCode6')}
              autoComplete="one-time-code"
              autoFocus
            />
            {codeForm.formState.errors.code && (
              <p className="auth-error-message">{codeForm.formState.errors.code.message}</p>
            )}
            <p className="auth-prototype-code-hint">
              {t('account.auth.globalEmailAuth.codeSentHint')}
            </p>
          </div>

          {serverError && <p className="auth-error-message">{serverError}</p>}

          <Button type="submit" variant="brand" size="lg" loading={loading}>
            <LuMailCheck size={17} aria-hidden="true" />
            <span>{t('account.auth.globalEmailAuth.submit')}</span>
          </Button>

          <button
            type="button"
            className="auth-global-resend"
            disabled={resendSeconds > 0 || loading}
            onClick={() => { void handleResend() }}
          >
            {resendSeconds > 0
              ? t('account.auth.globalEmailAuth.resendCountdown', { seconds: resendSeconds })
              : t('account.auth.globalEmailAuth.resend')}
          </button>

          <button type="button" className="auth-global-back" onClick={useDifferentEmail}>
            <LuArrowLeft size={16} aria-hidden="true" />
            <span>{t('account.auth.globalEmailAuth.useAnotherEmail')}</span>
          </button>
        </form>
      )}
    </AuthLayout>
  )
}
