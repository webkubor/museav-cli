import { useState } from 'react'
import { Avatar, Button, Input, Toast, Typography } from '@douyinfe/semi-ui'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProfile, updateProfile, changePassword } from '@/services/account'
import type { AccountProfile, OAuthConnection } from '@/types'

const { Title, Text } = Typography

// ─── Card shell ─────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: '12px',
  border: '1px solid #f1f5f9',
  padding: '28px',
  boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
  marginBottom: '24px',
}

const cardTitleStyle: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: 600,
  color: '#0f172a',
  marginBottom: '20px',
}

// ─── Provider display config ─────────────────────────────────────────────────

const PROVIDER_LABELS: Record<OAuthConnection['provider'], string> = {
  google: 'Google',
  github: 'GitHub',
  wechat: '微信',
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function BasicInfoCard({ profile }: { profile: AccountProfile }) {
  const queryClient = useQueryClient()
  const [displayName, setDisplayName] = useState(profile.display_name)

  const updateMutation = useMutation({
    mutationFn: () => updateProfile({ display_name: displayName }),
    onSuccess: (updated) => {
      Toast.success('显示名称已保存')
      queryClient.setQueryData<AccountProfile>(['account-profile'], updated)
    },
    onError: (err: any) => {
      Toast.error(err?.message || '保存失败，请重试')
    },
  })

  const avatarLetter = (profile.display_name || profile.email).charAt(0).toUpperCase()
  const isDirty = displayName.trim() !== profile.display_name && displayName.trim() !== ''

  return (
    <div style={cardStyle}>
      <div style={cardTitleStyle}>基本信息</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        {profile.avatar_url ? (
          <Avatar src={profile.avatar_url} size="large" />
        ) : (
          <Avatar size="large" style={{ backgroundColor: 'var(--semi-color-primary)' }}>
            {avatarLetter}
          </Avatar>
        )}
        <div>
          <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '15px' }}>
            {profile.display_name || '—'}
          </div>
          <div style={{ color: '#64748b', fontSize: '13px', marginTop: '2px' }}>
            {profile.email}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '16px', maxWidth: '480px' }}>
        <div>
          <Text style={{ fontSize: '13px', color: '#64748b', display: 'block', marginBottom: '6px' }}>
            邮箱地址
          </Text>
          <Input value={profile.email} disabled style={{ backgroundColor: '#f8fafc' }} />
        </div>

        <div>
          <Text style={{ fontSize: '13px', color: '#64748b', display: 'block', marginBottom: '6px' }}>
            显示名称
          </Text>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Input
              value={displayName}
              onChange={(val) => setDisplayName(val)}
              placeholder="请输入显示名称"
              style={{ flex: 1 }}
            />
            <Button
              theme="solid"
              disabled={!isDirty || updateMutation.isPending}
              loading={updateMutation.isPending}
              onClick={() => updateMutation.mutate()}
            >
              保存
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      changePassword({ current_password: currentPassword, new_password: newPassword }),
    onSuccess: () => {
      Toast.success('密码修改成功')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    },
    onError: (err: any) => {
      Toast.error(err?.message || '密码修改失败，请检查旧密码是否正确')
    },
  })

  function handleSubmit() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Toast.warning('请填写所有密码字段')
      return
    }
    if (newPassword !== confirmPassword) {
      Toast.error('两次输入的新密码不一致')
      return
    }
    if (newPassword.length < 8) {
      Toast.error('新密码长度不得少于 8 位')
      return
    }
    mutation.mutate()
  }

  return (
    <div style={cardStyle}>
      <div style={cardTitleStyle}>修改密码</div>
      <div style={{ display: 'grid', gap: '16px', maxWidth: '480px' }}>
        <div>
          <Text style={{ fontSize: '13px', color: '#64748b', display: 'block', marginBottom: '6px' }}>
            当前密码
          </Text>
          <Input
            mode="password"
            value={currentPassword}
            onChange={(val) => setCurrentPassword(val)}
            placeholder="请输入当前密码"
          />
        </div>
        <div>
          <Text style={{ fontSize: '13px', color: '#64748b', display: 'block', marginBottom: '6px' }}>
            新密码
          </Text>
          <Input
            mode="password"
            value={newPassword}
            onChange={(val) => setNewPassword(val)}
            placeholder="至少 8 位"
          />
        </div>
        <div>
          <Text style={{ fontSize: '13px', color: '#64748b', display: 'block', marginBottom: '6px' }}>
            确认新密码
          </Text>
          <Input
            mode="password"
            value={confirmPassword}
            onChange={(val) => setConfirmPassword(val)}
            placeholder="再次输入新密码"
          />
        </div>
        <div>
          <Button
            theme="solid"
            loading={mutation.isPending}
            onClick={handleSubmit}
          >
            修改密码
          </Button>
        </div>
      </div>
    </div>
  )
}

function OAuthBindingCard({ connections }: { connections: OAuthConnection[] }) {
  const PROVIDERS: OAuthConnection['provider'][] = ['google', 'github', 'wechat']

  // Build a lookup from the connections array
  const connMap = new Map<OAuthConnection['provider'], OAuthConnection>()
  connections.forEach((c) => connMap.set(c.provider, c))

  return (
    <div style={cardStyle}>
      <div style={cardTitleStyle}>第三方账号绑定</div>
      <div style={{ display: 'grid', gap: '12px' }}>
        {PROVIDERS.map((provider) => {
          const conn = connMap.get(provider)
          const isBound = !!conn?.connected_at

          return (
            <div
              key={provider}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderRadius: '8px',
                border: '1px solid #f1f5f9',
                backgroundColor: '#fafafa',
              }}
            >
              <div>
                <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px' }}>
                  {PROVIDER_LABELS[provider]}
                </span>
                {isBound ? (
                  <span style={{ fontSize: '12px', color: '#059669', marginLeft: '10px' }}>
                    {conn.external_email ?? '已绑定'}
                  </span>
                ) : (
                  <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: '10px' }}>
                    未绑定
                  </span>
                )}
              </div>
              <Button size="small" disabled>
                {isBound ? '解除绑定' : '立即绑定'}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AccountSettingsPage() {
  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ['account-profile'],
    queryFn: getProfile,
  })

  if (isLoading) {
    return (
      <div style={{ padding: '40px', color: '#64748b', fontSize: '14px' }}>加载中...</div>
    )
  }

  if (isError || !profile) {
    return (
      <div style={{ padding: '40px', color: '#ef4444', fontSize: '14px' }}>
        加载账号信息失败，请刷新重试。
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '720px' }}>
      <div style={{ marginBottom: '32px' }}>
        <Title
          heading={2}
          style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: 0 }}
        >
          账号设置
        </Title>
        <Text style={{ color: '#64748b', fontSize: '14px', marginTop: '6px', display: 'block' }}>
          管理你的个人信息、密码及第三方账号绑定。
        </Text>
      </div>

      <BasicInfoCard profile={profile} />
      <ChangePasswordCard />
      <OAuthBindingCard connections={profile.connected_oauth} />
    </div>
  )
}
