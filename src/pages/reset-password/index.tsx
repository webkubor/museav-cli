import { Button } from '@/components/ui/Button'
import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

import { AuthLayout } from '@/components/auth/AuthLayout'
import { PasswordStrength } from '@/components/auth/PasswordStrength'
import { resetPassword } from '@/services/auth'

const schema = z
  .object({
    password: z.string().min(8, '密码至少 8 位'),
    confirm: z.string().min(1, '请确认密码'),
  })
  .refine((d) => d.password === d.confirm, {
    message: '两次密码不一致',
    path: ['confirm'],
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

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  const {
    register: field,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Fields>({ resolver: zodResolver(schema) })

  const passwordValue = watch('password', '')

  const onSubmit = async (data: Fields) => {
    if (!token) {
      setServerError('重置链接无效或已过期')
      return
    }
    setLoading(true)
    setServerError('')
    try {
      await resetPassword(token, data.password)
      setDone(true)
    } catch {
      setServerError('重置失败，链接可能已过期')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <AuthLayout title="链接无效" footer={
        <Link to="/forgot-password" style={{ color: 'var(--brand-base)', textDecoration: 'none' }}>
          重新发送重置邮件
        </Link>
      }>
        <p style={{ textAlign: 'center', fontSize: '14px', color: 'var(--mg-text-2)' }}>
          重置链接无效或已过期，请重新申请。
        </p>
      </AuthLayout>
    )
  }

  if (done) {
    return (
      <AuthLayout
        title="密码已重置"
        subtitle="你的密码已成功更新"
        footer={
          <Link to="/login" style={{ color: 'var(--brand-base)', textDecoration: 'none' }}>
            返回登录
          </Link>
        }
      >
        <div className="auth-fade-in" style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
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
            立即登录
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="重置密码"
      subtitle="设置一个新密码"
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
          <label style={labelStyle}>新密码</label>
          <input
            {...field('password')}
            type="password"
            placeholder="至少 8 位"
            autoComplete="new-password"
            autoFocus
            style={inputStyle}
          />
          <PasswordStrength password={passwordValue} />
          {errors.password && <p style={errorStyle}>{errors.password.message}</p>}
        </div>
        <div>
          <label style={labelStyle}>确认密码</label>
          <input
            {...field('confirm')}
            type="password"
            placeholder="再次输入密码"
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
          确认重置
        </Button>
      </form>
    </AuthLayout>
  )
}
