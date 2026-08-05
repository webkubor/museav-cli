/**
 * 忘记密码页面。
 * 职责：提交邮箱并发送密码重置链接。
 * 路由：/forgot-password
 * API：POST /auth/forgot-password
 */
import { Button } from '@/components/ui/Button'
import { useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

import { AuthLayout } from '@/components/auth/AuthLayout'
import { forgotPassword } from '@/services/auth'

function createForgotPasswordSchema(t: TFunction) {
  return z.object({
    email: z.string().email(t('account.auth.validation.email')),
  })
}

type Fields = { email: string }

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: '40px',
  borderRadius: '8px',
  border: '1px solid var(--mg-border)',
  padding: '0 12px',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
  color: 'var(--mg-text-1)',
  background: 'var(--mg-bg-0)',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--mg-text-2)',
  marginBottom: '6px',
}

const errorStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--mg-danger)',
  marginTop: '4px',
}

export default function ForgotPasswordPage() {
  const { t } = useTranslation('account')
  const [searchParams] = useSearchParams()
  const [sent, setSent] = useState(false)
  const [expiresIn, setExpiresIn] = useState(300)
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  const schema = useMemo(() => createForgotPasswordSchema(t), [t])

  const {
    register: field,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: { email: searchParams.get('email') ?? '' },
  })

  const onSubmit = async (data: Fields) => {
    setLoading(true)
    setServerError('')
    try {
      const result = await forgotPassword(data.email)
      setExpiresIn(result.expires_in)
      setSent(true)
    } catch {
      setServerError(t('account.auth.forgot.sendFailed'))
    } finally {
      setLoading(false)
    }
  }

  const minutes = Math.floor(expiresIn / 60)

  if (sent) {
    return (
      <AuthLayout
        title={t('account.auth.forgot.sentTitle')}
        subtitle={t('account.auth.forgot.sentSubtitle')}
        footer={
          <Link to="/login" style={{ color: 'var(--brand-base)', textDecoration: 'none' }}>
            {t('account.auth.common.backToLogin')}
          </Link>
        }
      >
        <div
          className="auth-fade-in"
          style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'center' }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              background: 'var(--mg-primary-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto',
              fontSize: '24px',
            }}
          >
            ✉️
          </div>
          <p style={{ fontSize: '14px', color: 'var(--mg-text-2)', margin: 0 }}>
            {t('account.auth.forgot.sentTo')}
            <br />
            <strong>{getValues('email')}</strong>
          </p>
          <p style={{ fontSize: '12px', color: 'var(--mg-text-3)', margin: 0 }}>
            {t('account.auth.forgot.expiresInMinutes', { minutes })}
          </p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={t('account.auth.forgot.title')}
      subtitle={t('account.auth.forgot.subtitle')}
      footer={
        <Link to="/login" style={{ color: 'var(--brand-base)', textDecoration: 'none' }}>
          {t('account.auth.common.backToLogin')}
        </Link>
      }
    >
      <form
        className="auth-fade-in"
        onSubmit={handleSubmit(onSubmit)}
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        <div>
          <label style={labelStyle}>{t('account.auth.fields.email')}</label>
          <input
            {...field('email')}
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
            style={inputStyle}
          />
          {errors.email && <p style={errorStyle}>{errors.email.message}</p>}
        </div>
        {serverError && <p style={errorStyle}>{serverError}</p>}
        <Button
          htmlType="submit"
           variant="brand"
          loading={loading}
          style={{ width: '100%', height: '40px', borderRadius: '8px', fontWeight: 600 }}
        >
          {t('account.auth.forgot.submit')}
        </Button>
      </form>
    </AuthLayout>
  )
}
