/** Two-step email OTP login and registration. */

import { useEffect, useMemo, useRef, useState, type FormEventHandler } from 'react'
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
import { CaptchaGate, type CaptchaGateHandle } from '@/components/auth/CaptchaGate'
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
import { getRequestErrorMessage, isApiErrorCode } from '@/lib/request-error-message'
import { useAuthStore } from '@/store/auth'
import { getRedirectTarget } from '@/lib/redirect'
import { navigateAfterLogin } from '@/lib/login-intent'
import { resolveReferralCode, clearPersistedReferralCode } from '@/pages/signup/referral-code'
import { resolveAdSource, resolveAdAttribution, clearPersistedAdSource } from '@/pages/signup/ad-source'
import { trackEvent } from '@/lib/track'
import { trackSignUp } from '@/lib/new-account'

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


const isSecondFactorError = (error: unknown) => isApiErrorCode(error, 40038) || isApiErrorCode(error, 40039)

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
  // 第二步「确认验证码」单独要求人机校验（后端 email-code/login 网关要求，跟手机号登录一致，
  // prd#1092 boss 反馈：不能像之前那样在提交函数里裸调 getCaptchaParam() 弹一个没有预兆的滑块）。
  // 照 PhoneAuth.tsx 的既有门禁写法：页面上放一条可见验证条，未通过时主动 open() 并提示，
  // 而不是静默弹窗；40025（一次性四元组失效/未过）时把验证条退回可重验，验证码本身不用重发。
  const [gateParam, setGateParam] = useState<string | null>(null)
  const [gateActive, setGateActive] = useState(false)
  const gateRef = useRef<CaptchaGateHandle | null>(null)

  const describeError = (error: unknown) => {
    if (isApiErrorCode(error, 40901)) return t('account.auth.globalEmailAuth.emailAlreadyRegistered')
    // 40038/40039 = 后端要求二次验证（身份验证器）。本页没有、也不该有 TOTP 输入（prd46#1205），
    // 后端原文「请输入身份验证器验证码」会指向一个不存在的输入框，改用前端自己的文案。
    if (isSecondFactorError(error)) return t('account.auth.globalEmailAuth.secondFactorUnavailable')
    return getRequestErrorMessage(error, t('account.auth.globalEmailAuth.failed'))
  }

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

  /** 真实人机校验：呈现挑战并等用户解题；未获得有效参数时不允许继续。 */
  const runHumanVerification = async () => {
    setServerError('')
    setHumanVerification('verifying')
    try {
      const { param } = await getCaptchaOutcome()
      if (!param) {
        // 呈现过但没解出来（关弹窗/超时）→ 退回未验证，不能放行
        setHumanVerification('idle')
        setServerError(t('account.auth.validation.securityVerificationRequired'))
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
      setCaptchaParam(null)
      setHumanVerification('idle')
      setServerError(describeError(error))
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendSeconds > 0 || loading) return
    // 验证条生效但未通过 → 主动调起挑战、给出提示后中止，等用户在可见 UI 里解完
    // 再点一次「重新发送」；不裸调 getCaptchaParam()（那样会在毫无预兆的情况下弹窗）。
    if (gateActive && !gateParam) {
      gateRef.current?.open()
      setServerError(t('account.auth.validation.securityVerificationRequired'))
      return
    }
    setLoading(true)
    setServerError('')
    try {
      // 重发同样要带四元组：优先复用验证条已通过的那一份，验证条不可用（未启用/
      // SDK 不可用）时才退回一次性弹窗流，两条路径都保留原有 fail-open 降级。
      await sendCode(emailForm.getValues('email'), gateParam ?? (await getCaptchaParam()))
      // 人机校验四元组是一次性的；重发成功已消费这一组，登录前必须重新验证。
      gateRef.current?.reset()
    } catch (error) {
      // 40025 人机验证未通过（四元组一次性/已失效）：退回可重验态，验证码本身仍在
      // 有效期内不用重新获取。
      if (isApiErrorCode(error, 40025)) {
        gateRef.current?.reset()
        setServerError(t('account.auth.globalEmailAuth.codeCaptchaExpired'))
      } else {
        setServerError(describeError(error))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCodeSubmit = async (data: CodeFields) => {
    trackEvent('login_submit', { method: 'email_code' })
    // 同上：确认验证码这步也要求人机校验（后端 email-code/login 强制要求，跟手机号
    // 登录一致），门禁未通过时先调起可见挑战，不在函数里静默弹窗把用户吓一跳。
    if (gateActive && !gateParam) {
      gateRef.current?.open()
      setServerError(t('account.auth.validation.securityVerificationRequired'))
      return
    }
    const email = emailForm.getValues('email')
    setLoading(true)
    setServerError('')
    try {
      // 完整来源（含只进埋点的 channel_id 等）先留一份给 sign_up：下面注册成功就会清掉持久化记录。
      const adAttribution = resolveAdAttribution(searchParams)
      const result = await emailCodeLoginRegister(
        email,
        data.code,
        gateParam ?? (await getCaptchaParam()),
        resolveReferralCode(searchParams) || undefined,
        searchParams.get('invitation') ?? undefined,
        resolveAdSource(searchParams),
      )
      clearPersistedAdSource()
      clearPersistedReferralCode()
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
      // 国际站「登录即注册」：同一次提交可能建了号。后端在响应里给 is_new_account（prd#1242），
      // true 才补发 sign_up —— 注册 CPA 的分母就靠它，老账号只走上面的 login_success。
      trackSignUp('email_code', result.is_new_account, adAttribution)
    } catch (error) {
      // 人机校验四元组一次性：本次提交已消费，任何失败都要重置，否则下一次提交必然先吃一次 40025。
      gateRef.current?.reset()
      if (isApiErrorCode(error, 40025)) {
        setServerError(t('account.auth.globalEmailAuth.codeCaptchaExpired'))
      } else {
        // 开了二次验证的账号拿邮箱验证码重提必然再被拒（本页不收 TOTP），清空以免用户原样重提。
        if (isSecondFactorError(error)) codeForm.reset({ code: '' })
        setServerError(describeError(error))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleOAuth = async (provider: GlobalOAuthProvider) => {
    if (pendingProvider) return
    trackEvent('login_submit', { method: 'oauth' })
    setPendingProvider(provider)
    setServerError('')
    try {
      // 与 SocialLogin 同口径：**先解题拿 token 再导航**。带空 token 会被后端 302 弹回
      // 登录页，用户看到的是"点一下立刻跳回来"；而挑战根本呈现不出来时必须照常导航。
      const { param, presented } = await getCaptchaOutcome()
      if (!param && presented) return
      window.location.assign(oauthAuthorizeUrl(provider, redirectAfterLogin, param))
    } catch (error) {
      setServerError(describeError(error))
    } finally {
      setPendingProvider(null)
    }
  }

  const useDifferentEmail = () => {
    setStep('entry')
    setHumanVerification('idle')
    setResendSeconds(0)
    setServerError('')
    // 同时重置 CaptchaGate 内部 verified 状态，避免重新进入第二步时 UI 与 gateParam 分裂。
    gateRef.current?.reset()
    codeForm.reset({ code: '' })
  }


  const onCodeFormSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    void codeForm.handleSubmit(handleCodeSubmit)(event)
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
            <label htmlFor="global-auth-email" className="modern-auth-label">{t('account.auth.fields.email')}</label>
            <Input
              {...emailForm.register('email')}
              id="global-auth-email"
              type="email"
              placeholder="you@company.com"
              autoComplete="email"
              autoFocus
            />
            {emailForm.formState.errors.email && (
              <p className="auth-error-message">{emailForm.formState.errors.email.message}</p>
            )}
          </div>

          {serverError && <p className="auth-error-message" role="alert">{serverError}</p>}

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
          onSubmit={onCodeFormSubmit}
        >
          <div className="auth-global-code-note">
            <LuInfo size={17} aria-hidden="true" />
            <span>{t('account.auth.globalEmailAuth.codeHelp')}</span>
          </div>

          <div>
            <label htmlFor="global-auth-code" className="modern-auth-label">{t('account.auth.globalEmailAuth.codeLabel')}</label>
            <Input
              {...codeForm.register('code')}
              id="global-auth-code"
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

          <CaptchaGate
            onChange={setGateParam}
            onAvailability={setGateActive}
            handleRef={(h) => { gateRef.current = h }}
          />

          {serverError && <p className="auth-error-message" role="alert">{serverError}</p>}

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
