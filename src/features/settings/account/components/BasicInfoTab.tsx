import React, { useState } from 'react'
import { Avatar, Button, Input, Toast, Typography } from '@douyinfe/semi-ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { updateProfile } from '@/services/account'
import type { AccountProfile } from '@/types'

const { Text } = Typography

interface BasicInfoTabProps {
  profile: AccountProfile
}

export const BasicInfoTab: React.FC<BasicInfoTabProps> = ({ profile }) => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [displayName, setDisplayName] = useState(profile.display_name)

  const updateMutation = useMutation({
    mutationFn: () => updateProfile({ display_name: displayName }),
    onSuccess: (updated) => {
      Toast.success(t('account.info.toastSuccess'))
      queryClient.setQueryData<AccountProfile>(['account-profile'], updated)
    },
    onError: (err: any) => {
      Toast.error(err?.message || t('account.info.toastError'))
    },
  })

  const avatarLetter = (profile.display_name || profile.email).charAt(0).toUpperCase()
  const isDirty = displayName.trim() !== profile.display_name && displayName.trim() !== ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', paddingTop: '8px' }}>
      {/* 头像区域：质感呼吸边缘 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        {profile.avatar_url ? (
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%',
            overflow: 'hidden', flexShrink: 0,
            boxShadow: '0 0 0 3px var(--brand-glow), 0 4px 10px rgba(0,0,0,0.06)',
            backgroundColor: 'var(--semi-color-fill-0)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <img
              src={profile.avatar_url}
              alt={profile.display_name || 'avatar'}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
        ) : (
          <Avatar
            size="large"
            style={{
              backgroundColor: 'var(--semi-color-primary)',
              boxShadow: '0 0 0 3px var(--brand-glow), 0 4px 10px rgba(0,0,0,0.06)'
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
            {t('account.info.emailLabel')}
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
            {t('account.info.emailHint')}
          </span>
        </div>

        <div>
          <Text style={{ fontSize: '12.5px', color: 'var(--semi-color-text-1)', fontWeight: 600, display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {t('account.info.nameLabel')}
          </Text>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Input
              value={displayName}
              onChange={(val) => setDisplayName(val)}
              placeholder={t('account.info.namePlaceholder')}
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
              {t('common.save')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
