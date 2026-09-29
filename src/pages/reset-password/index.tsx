/**
 * 重置密码页面。
 * 职责：校验重置 token 并提交新密码。
 * 路由：/reset-password
 * API：POST /auth/reset-password
 */
import { Button } from '@/components/ui/Button'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

import { AuthLayout } from '@/components/auth/AuthLayout'
import { PasswordStrength } from '@/components/auth/PasswordStrength'
import { resetPassword } from '@/services/auth'
import { getCaptchaParam } from '@/lib/aliyun-captcha'

function createResetPasswordSchema(t: TFunction) {
  return z
    .object({
      password: z.string().min(8, t('account.auth.validation.passwordMin')),
      confirm: z.string().min(1, t('account.auth.validation.confirmPassword')),
    })
    .refine((d) => d.password === d.confirm, {
      message: t('account.auth.validation.passwordMismatchShort'),
      path: ['confirm'],
    })
}

type Fields = { password: string; confirm: string }

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

export default function ResetPasswordPage() {
  const { t } = useTranslation('account')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  const schema = useMemo(() => createResetPasswordSchema(t), [t])

  const {
    register: field,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Fields>({ resolver: zodResolver(schema) })

  const passwordValue = watch('password', '')

  const onSubmit = async (data: Fields) => {
    if (!token) {
      setServerError(t('account.auth.reset.invalidLink'))
      return
    }
    setLoading(true)
    setServerError('')
    try {
      // 这个页面是从邮件里打开的**新**页面，浏览器上没有任何先前的人机校验凭证 —— 所以它必须
      // 自己解一次题（未启用时返回 null，请求照常发出，后端此时也不要求）。
      const captchaParam = await getCaptchaParam()
      await resetPassword(token, data.password, captchaParam)
      setDone(true)
    } catch {
      setServerError(t('account.auth.reset.failed'))
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <AuthLayout title={t('account.auth.reset.invalidTitle')} footer={
        <Link to="/forgot-password" style={{ color: 'var(--brand-base)', textDecoration: 'none' }}>
          {t('account.auth.reset.resend')}
        </Link>
      }>
        <p style={{ textAlign: 'center', fontSize: '14px', color: 'var(--mg-text-3)' }}>
          {t('account.auth.reset.invalidDesc')}
        </p>
      </AuthLayout>
    )
  }

  if (done) {
    return (
      <AuthLayout
        title={t('account.auth.reset.doneTitle')}
        subtitle={t('account.auth.reset.doneSubtitle')}
        footer={
          <Link to="/login" style={{ color: 'var(--brand-base)', textDecoration: 'none' }}>
            {t('account.auth.common.backToLogin')}
          </Link>
        }
      >
        <div className="auth-fade-in" style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)', // allow-raw-color 成功态对勾图标的装饰渐变（green-100→200）；--mg-success 系 token 色相不同，无等值映射，改值即视觉回归
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              fontSize: '24px',
            }}
          >
            ✓
          </div>
          <Button
             variant="brand"
            onClick={() => navigate('/login')}
            style={{ width: '100%', height: '40px', borderRadius: '8px', fontWeight: 600, marginTop: '8px' }}
          >
            {t('account.auth.reset.loginNow')}
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={t('account.auth.reset.title')}
      subtitle={t('account.auth.reset.subtitle')}
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
          <label style={labelStyle}>{t('account.auth.fields.newPassword')}</label>
          <input
            {...field('password')}
            type="password"
            placeholder={t('account.auth.placeholders.passwordMin')}
            autoComplete="new-password"
            autoFocus
            style={inputStyle}
          />
          <PasswordStrength password={passwordValue} />
          {errors.password && <p style={errorStyle}>{errors.password.message}</p>}
        </div>
        <div>
          <label style={labelStyle}>{t('account.auth.fields.confirmPassword')}</label>
          <input
            {...field('confirm')}
            type="password"
            placeholder={t('account.auth.placeholders.confirmPasswordShort')}
            autoComplete="new-password"
            style={inputStyle}
          />
          {errors.confirm && <p style={errorStyle}>{errors.confirm.message}</p>}
        </div>
        {serverError && <p style={errorStyle}>{serverError}</p>}
        <Button
          htmlType="submit"
           variant="brand"
          loading={loading}
          style={{ width: '100%', height: '40px', borderRadius: '8px', fontWeight: 600 }}
        >
          {t('account.auth.reset.submit')}
        </Button>
      </form>
    </AuthLayout>
  )
}
