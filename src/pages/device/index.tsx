import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Avatar, Typography } from '@douyinfe/semi-ui'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { useAuthStore } from '@/store/auth'
import { deviceApprove } from '@/services/auth'

const { Text, Title } = Typography

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
      let message = '授权失败，请重试'
      if (code === 40401) message = '授权码不存在或已过期，请重新在终端执行登录命令'
      else if (code === 40901) message = '此授权码已被使用'
      else if (code === 40101) message = '当前未登录，请刷新页面后重试'
      else if (code === 40302) message = 'CSRF 校验失败，请刷新页面后重试'
      setState({ kind: 'error', message })
    }
  }

  function handleCancel() {
    navigate('/dashboard', { replace: true })
  }

  // ── 渲染 ──────────────────────────────────────────────

  if (state.kind === 'missing_code') {
    return (
      <AuthLayout title="授权链接无效">
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <Text style={{ color: '#64748b', fontSize: '14px' }}>
            此链接缺少授权码，请在终端重新执行登录命令获取新的链接。
          </Text>
        </div>
      </AuthLayout>
    )
  }

  if (state.kind === 'invalid_code') {
    return (
      <AuthLayout title="授权码无效">
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <Text style={{ color: '#64748b', fontSize: '14px' }}>
            授权码格式无效或已损坏，请在终端重新执行登录命令。
          </Text>
        </div>
      </AuthLayout>
    )
  }

  if (state.kind === 'checking_auth') {
    return (
      <AuthLayout title="正在验证身份">
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
      <AuthLayout title="授权成功">
        <div style={{ textAlign: 'center', padding: '8px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '40px' }}>✓</div>
          <Text style={{ color: '#0f172a', fontSize: '15px', fontWeight: 600 }}>
            ModelGo CLI 已获得登录授权
          </Text>
          <Text style={{ color: '#64748b', fontSize: '13px' }}>
            可以回到终端继续使用了。此页面可以关闭。
          </Text>
        </div>
      </AuthLayout>
    )
  }

  if (state.kind === 'error') {
    return (
      <AuthLayout title="授权失败">
        <div style={{ textAlign: 'center', padding: '8px 0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Text style={{ color: '#ef4444', fontSize: '14px' }}>{state.message}</Text>
          <Button
            onClick={() => navigate('/dashboard')}
            style={{ borderRadius: '8px' }}
          >
            返回控制台
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
      title="CLI 登录授权"
      subtitle="请确认以下信息，然后点击授权"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* 当前账号 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '14px 16px', borderRadius: '10px',
          background: '#f8fafc', border: '1px solid #e2e8f0',
        }}>
          <Avatar size="small" style={{ background: 'var(--semi-color-primary)', flexShrink: 0 }}>
            {initials}
          </Avatar>
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
          <Text style={{ fontSize: '13px', color: '#92400e', lineHeight: '1.6' }}>
            <strong>ModelGo CLI</strong> 正在请求登录授权。确认后，终端里的 CLI
            将获得与当前账号相同的访问凭证。
          </Text>
        </div>

        {/* 授权码展示 */}
        <div style={{ textAlign: 'center' }}>
          <Text style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px', display: 'block' }}>
            本次授权码
          </Text>
          <Title heading={4} style={{ margin: 0, letterSpacing: '0.15em', fontFamily: 'monospace', color: '#0f172a' }}>
            {userCode}
          </Title>
        </div>

        {/* 操作按钮 */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <Button
            style={{ flex: 1, height: '40px', borderRadius: '8px' }}
            disabled={isApproving}
            onClick={handleCancel}
          >
            取消
          </Button>
          <Button
            type="primary"
            style={{ flex: 2, height: '40px', borderRadius: '8px', fontWeight: 600 }}
            loading={isApproving}
            onClick={handleApprove}
          >
            确认授权
          </Button>
        </div>

        <Text style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
          授权后终端 CLI 会获得登录凭证，请确认是你本人在终端操作。
        </Text>
      </div>
    </AuthLayout>
  )
}
