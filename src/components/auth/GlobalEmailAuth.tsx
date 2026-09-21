/**
 * Global 站两步式免密登录/注册原型。
 * 第一步选择 Google/GitHub 或提交邮箱，第二步单独完成邮箱验证码校验。
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  LuArrowLeft,
  LuArrowRight,
  LuCircleCheck,
  LuInfo,
  LuLoaderCircle,
  LuMailCheck,
  LuShieldCheck,
} from 'react-icons/lu'

import { AuthLayout } from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { OAUTH_ICONS, OAUTH_LABELS } from '@/constants/oauth'
import {
  emailCodeLoginRegister,
  mockGlobalOAuthLogin,
  sendGlobalEmailCode,
  type GlobalOAuthProvider,
} from '@/services/auth'

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
  const [step, setStep] = useState<EmailStep>('entry')
  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendSeconds, setResendSeconds] = useState(0)
  const [completedIdentity, setCompletedIdentity] = useState('')
  const [completedWithOAuth, setCompletedWithOAuth] = useState(false)
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

  useEffect(() => {
    if (humanVerification !== 'verifying') return
    const timer = window.setTimeout(() => setHumanVerification('verified'), 450)
    return () => window.clearTimeout(timer)
  }, [humanVerification])

  const sendCode = async (email: string) => {
    const result = await sendGlobalEmailCode(email)
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
      await sendCode(data.email)
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
      await sendCode(emailForm.getValues('email'))
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
        null,
        undefined,
        searchParams.get('invitation') ?? undefined,
      )
      setCompletedIdentity(email)
      setCompletedWithOAuth(false)
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
      await mockGlobalOAuthLogin(provider)
      setCompletedIdentity(OAUTH_LABELS[provider])
      setCompletedWithOAuth(true)
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

  const restart = () => {
    setCompletedIdentity('')
    setCompletedWithOAuth(false)
    setStep('entry')
    setResendSeconds(0)
    setServerError('')
    setHumanVerification('idle')
    emailForm.reset({ email: '' })
    codeForm.reset({ code: '' })
  }

  const title = completedIdentity
    ? t('account.auth.globalEmailAuth.successTitle')
    : step === 'code'
      ? t('account.auth.globalEmailAuth.checkEmailTitle')
      : t('account.auth.globalEmailAuth.entryTitle')
  const subtitle = completedIdentity
    ? undefined
    : step === 'code'
      ? t('account.auth.globalEmailAuth.checkEmailSubtitle', { email: emailValue })
      : t('account.auth.globalEmailAuth.entrySubtitle')

  return (
    <AuthLayout title={title} subtitle={subtitle} showMarketSwitcher>
      {completedIdentity ? (
        <div className="auth-form-container auth-fade-in items-center text-center">
          <div className="auth-prototype-success-icon" aria-hidden="true">
            <LuCircleCheck size={30} strokeWidth={1.8} />
          </div>
          <p className="auth-prototype-success-description">
            {t(
              completedWithOAuth
                ? 'account.auth.globalEmailAuth.oauthSuccessDescription'
                : 'account.auth.globalEmailAuth.successDescription',
              { identity: completedIdentity },
            )}
          </p>
          <Button type="button" variant="outline" size="lg" onClick={restart}>
            {t('account.auth.globalEmailAuth.restart')}
          </Button>
        </div>
      ) : step === 'entry' ? (
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
            onClick={() => {
              setServerError('')
              setHumanVerification('verifying')
            }}
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
