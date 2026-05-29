import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { useAuthStore } from '@/store/auth'
import { deviceApprove } from '@/services/auth'
import { Button } from '@/components/ui/Button'

// user_code 格式：8~16 位大写字母和数字，允许中间带连字符，如 ABCD-EFGH
function isValidUserCode(code: string) {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code) || /^[A-Z0-9]{8,16}$/.test(code)
}

type PageState =
  | { kind: 'missing_code' }
  | { kind: 'invalid_code' }
  | { kind: 'checking_auth' }
  | { kind: 'confirming'; userCode: string }
  | { kind: 'approving'; userCode: string }
  | { kind: 'success' }
  | { kind: 'error'; message: string }

export default function DevicePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const account = useAuthStore((s) => s.account)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)

  const params = new URLSearchParams(window.location.search)
  const rawCode = params.get('user_code') ?? ''

  const [state, setState] = useState<PageState>({ kind: 'checking_auth' })

  useEffect(() => {
    if (!rawCode) {
      setState({ kind: 'missing_code' })
      return
    }
    if (!isValidUserCode(rawCode.toUpperCase())) {
      setState({ kind: 'invalid_code' })
      return
    }
    if (isLoading) {
      setState({ kind: 'checking_auth' })
      return
    }
    if (!isAuthenticated) {
      const redirect = `/device?user_code=${encodeURIComponent(rawCode)}`
      navigate(`/login?redirect=${encodeURIComponent(redirect)}`, { replace: true })
      return
    }
    setState({ kind: 'confirming', userCode: rawCode.toUpperCase() })
  }, [isLoading, isAuthenticated, rawCode])

  async function handleApprove() {
    if (state.kind !== 'confirming') return
    const { userCode } = state
    setState({ kind: 'approving', userCode })
    try {
      await deviceApprove(userCode)
      setState({ kind: 'success' })
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code
      let message = t('device.error.default')
      if (code === 40401) message = t('device.error.40401')
      else if (code === 40901) message = t('device.error.40901')
      else if (code === 40101) message = t('device.error.40101')
      else if (code === 40302) message = t('device.error.40302')
      setState({ kind: 'error', message })
    }
  }

  function handleCancel() {
    navigate('/dashboard', { replace: true })
  }

  // ── 渲染 ──────────────────────────────────────────────

  if (state.kind === 'missing_code') {
    return (
      <AuthLayout title={t('device.title.missingCode')}>
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <span style={{ color: '#64748b', fontSize: '14px' }}>
            {t('device.desc.missingCode')}
          </span>
        </div>
      </AuthLayout>
    )
  }

  if (state.kind === 'invalid_code') {
    return (
      <AuthLayout title={t('device.title.invalidCode')}>
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <span style={{ color: '#64748b', fontSize: '14px' }}>
            {t('device.desc.invalidCode')}
          </span>
        </div>
      </AuthLayout>
    )
  }

  if (state.kind === 'checking_auth') {
    return (
      <AuthLayout title={t('device.title.checkingAuth')}>
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{
            width: '32px', height: '32px', border: '3px solid #e2e8f0',
            borderTopColor: '#1890ff', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto',
          }} />
        </div>
      </AuthLayout>
    )
  }

  if (state.kind === 'success') {
    return (
      <AuthLayout title={t('device.title.success')}>
        <div style={{ textAlign: 'center', padding: '8px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '40px' }}>✓</div>
          <span style={{ color: '#0f172a', fontSize: '15px', fontWeight: 600 }}>
            {t('device.success.title')}
          </span>
          <span style={{ color: '#64748b', fontSize: '13px' }}>
            {t('device.success.desc')}
          </span>
        </div>
      </AuthLayout>
    )
  }

  if (state.kind === 'error') {
    return (
      <AuthLayout title={t('device.title.error')}>
        <div style={{ textAlign: 'center', padding: '8px 0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <span style={{ color: 'var(--mg-danger)', fontSize: '14px' }}>{state.message}</span>
          <Button
            onClick={() => navigate('/dashboard')}
            className="rounded-[8px]"
          >
            {t('device.button.backToDashboard')}
          </Button>
        </div>
      </AuthLayout>
    )
  }

  // confirming | approving
  const userCode = state.kind === 'confirming' ? state.userCode : state.userCode
  const isApproving = state.kind === 'approving'
  const initials = account?.display_name
    ?.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) ?? '?'

  return (
    <AuthLayout
      title={t('device.title.confirm')}
      subtitle={t('device.subtitle.confirm')}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* 当前账号 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '14px 16px', borderRadius: '10px',
          background: '#f8fafc', border: '1px solid #e2e8f0',
        }}>
          <div
            style={{
              width: '32px', height: '32px', borderRadius: '50%',
              backgroundColor: 'var(--mg-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: '12px', fontWeight: 600, flexShrink: 0
            }}
          >
            {initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
              {account?.display_name ?? '—'}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {account?.email ?? '—'}
            </div>
          </div>
        </div>

        {/* 授权说明 */}
        <div style={{
          padding: '14px 16px', borderRadius: '10px',
          background: '#fffbeb', border: '1px solid #fde68a',
        }}>
          <span style={{ fontSize: '13px', color: '#92400e', lineHeight: '1.6', display: 'block' }}>
            <strong style={{ fontWeight: 600 }}>ModelGo CLI</strong> {t('device.authNotice')}
          </span>
        </div>

        {/* 授权码展示 */}
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px', display: 'block' }}>
            {t('device.codeLabel')}
          </span>
          <h4 style={{ margin: 0, letterSpacing: '0.15em', fontFamily: 'monospace', color: '#0f172a', fontSize: '18px', fontWeight: 700 }}>
            {userCode}
          </h4>
        </div>

        {/* 操作按钮 */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <Button
            variant="outline"
            style={{ flex: 1, height: '40px', borderRadius: '8px' }}
            disabled={isApproving}
            onClick={handleCancel}
          >
            {t('device.button.cancel')}
          </Button>
          <Button
            variant="default"
            style={{ flex: 2, height: '40px', borderRadius: '8px', fontWeight: 600 }}
            onClick={handleApprove}
          >
            {isApproving ? t('device.button.approving') : t('device.button.approve')}
          </Button>
        </div>

        <span style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', display: 'block' }}>
          {t('device.footer')}
        </span>
      </div>
    </AuthLayout>
  )
}
