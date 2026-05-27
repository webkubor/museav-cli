import React, { useState } from 'react'
import { Avatar, Button, Input, Toast, Typography } from '@douyinfe/semi-ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateProfile } from '@/services/account'
import type { AccountProfile } from '@/types'

const { Text } = Typography

interface BasicInfoTabProps {
  profile: AccountProfile
}

export const BasicInfoTab: React.FC<BasicInfoTabProps> = ({ profile }) => {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', paddingTop: '8px' }}>
      {/* 头像区域：质感呼吸边缘 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        {profile.avatar_url ? (
          <Avatar 
            src={profile.avatar_url} 
            size="large" 
            style={{ boxShadow: '0 0 0 3px rgba(24, 144, 255, 0.1), 0 4px 10px rgba(0,0,0,0.06)' }}
          />
        ) : (
          <Avatar 
            size="large" 
            style={{ 
              backgroundColor: 'var(--semi-color-primary)', 
              boxShadow: '0 0 0 3px rgba(24, 144, 255, 0.1), 0 4px 10px rgba(0,0,0,0.06)' 
            }}
          >
            {avatarLetter}
          </Avatar>
        )}
        <div>
          <div style={{ fontWeight: 700, color: 'var(--semi-color-text-0)', fontSize: '16px', letterSpacing: '-0.01em' }}>
            {profile.display_name || '—'}
          </div>
          <div style={{ color: 'var(--semi-color-text-1)', fontSize: '13px', marginTop: '3.5px' }}>
            {profile.email}
          </div>
        </div>
      </div>

      {/* 表单区域：限宽 480px，保留呼吸感的网格 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '480px' }}>
        <div>
          <Text style={{ fontSize: '12.5px', color: 'var(--semi-color-text-1)', fontWeight: 600, display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            邮箱地址
          </Text>
          <Input 
            value={profile.email} 
            disabled 
            style={{ 
              backgroundColor: 'var(--semi-color-bg-1)',
              borderRadius: '8px',
              border: '1px solid var(--semi-color-border)'
            }} 
          />
          <span style={{ fontSize: '11.5px', color: 'var(--semi-color-text-2)', marginTop: '6px', display: 'block' }}>
            登录和接收系统通知时使用的主要邮箱，暂不支持自主修改。
          </span>
        </div>

        <div>
          <Text style={{ fontSize: '12.5px', color: 'var(--semi-color-text-1)', fontWeight: 600, display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            显示名称
          </Text>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Input
              value={displayName}
              onChange={(val) => setDisplayName(val)}
              placeholder="请输入显示名称"
              style={{ flex: 1, borderRadius: '8px' }}
            />
            <Button
              theme="solid"
              disabled={!isDirty || updateMutation.isPending}
              loading={updateMutation.isPending}
              onClick={() => updateMutation.mutate()}
              style={{ 
                borderRadius: '8px', 
                padding: '0 20px',
                fontWeight: 600
              }}
            >
              保存修改
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
