import { Button } from '@/components/ui/Button'
import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

import { AuthLayout } from '@/components/auth/AuthLayout'
import { forgotPassword } from '@/services/auth'

const schema = z.object({
  email: z.string().email('请填写有效的邮箱'),
})

type Fields = z.infer<typeof schema>

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: '40px',
  borderRadius: '8px',
  border: '1px solid var(--mg-border)',
  padding: '0 12px',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
  color: 'var(--mg-text-0)',
  background: 'var(--mg-bg-0)',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--mg-text-1)',
  marginBottom: '6px',
}

const errorStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--mg-danger)',
  marginTop: '4px',
}

export default function ForgotPasswordPage() {
  const [searchParams] = useSearchParams()
  const [sent, setSent] = useState(false)
  const [expiresIn, setExpiresIn] = useState(300)
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

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
      setServerError('发送失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const minutes = Math.floor(expiresIn / 60)

  if (sent) {
    return (
      <AuthLayout
        title="邮件已发送"
        subtitle="请检查你的收件箱"
        footer={
          <Link to="/login" style={{ color: 'var(--brand-base)', textDecoration: 'none' }}>
            返回登录
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
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto',
              fontSize: '24px',
            }}
          >
            ✉️
          </div>
          <p style={{ fontSize: '14px', color: 'var(--mg-text-1)', margin: 0 }}>
            重置链接已发送至
            <br />
            <strong>{getValues('email')}</strong>
          </p>
          <p style={{ fontSize: '12px', color: 'var(--mg-text-2)', margin: 0 }}>
            链接在 {minutes} 分钟内有效，请尽快操作
          </p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="忘记密码"
      subtitle="输入邮箱，我们将发送重置链接"
      footer={
        <Link to="/login" style={{ color: 'var(--brand-base)', textDecoration: 'none' }}>
          返回登录
        </Link>
      }
    >
      <form
        className="auth-fade-in"
        onSubmit={handleSubmit(onSubmit)}
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        <div>
          <label style={labelStyle}>邮箱</label>
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
          发送重置邮件
        </Button>
      </form>
    </AuthLayout>
  )
}
