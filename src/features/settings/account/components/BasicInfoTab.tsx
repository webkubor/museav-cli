import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { updateProfile, uploadAvatar } from '@/services/account'
import { useAuthStore } from '@/store/auth'
import type { AccountProfile } from '@/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AvatarUpload } from '@/components/ui/AvatarUpload'
import { appToast } from '@/lib/app-toast'

interface BasicInfoTabProps {
  profile: AccountProfile
}

export const BasicInfoTab: React.FC<BasicInfoTabProps> = ({ profile }) => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [displayName, setDisplayName] = useState(profile.display_name)

  const avatarMutation = useMutation({
    mutationFn: (file: File) => uploadAvatar(file),
    onSuccess: (res) => {
      appToast.success(t('account.info.avatarSuccess'))
      queryClient.setQueryData<AccountProfile>(['account-profile'], (prev) =>
        prev ? { ...prev, avatar_url: res.avatar_url } : prev
      )
      const account = useAuthStore.getState().account
      if (account) {
        useAuthStore.setState({ account: { ...account, avatar_url: res.avatar_url } })
      }
    },
    onError: (err: unknown) => appToast.error((err as Error)?.message || t('account.info.avatarError')),
  })

  const updateMutation = useMutation({
    mutationFn: () => updateProfile({ display_name: displayName }),
    onSuccess: (updated) => {
      appToast.success(t('account.info.toastSuccess'))
      queryClient.setQueryData<AccountProfile>(['account-profile'], updated)
    },
    onError: (err: unknown) => {
      appToast.error((err as Error)?.message || t('account.info.toastError'))
    },
  })

  const avatarLetter = (profile.display_name || profile.email).charAt(0).toUpperCase()
  const isDirty = displayName.trim() !== profile.display_name && displayName.trim() !== ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', paddingTop: '8px' }}>
      {/* 头像 + 基本信息 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <AvatarUpload
          src={profile.avatar_url}
          fallback={avatarLetter}
          size={64}
          loading={avatarMutation.isPending}
          onUpload={(file) => avatarMutation.mutate(file)}
        />
        <div>
          <div style={{ fontWeight: 700, color: 'var(--mg-text-0)', fontSize: '16px', letterSpacing: '-0.01em' }}>
            {profile.display_name || '—'}
          </div>
          <div style={{ color: 'var(--mg-text-1)', fontSize: '13px', marginTop: '3.5px' }}>
            {profile.email}
          </div>
        </div>
      </div>

      {/* 表单 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '480px' }}>
        <div>
          <span style={{ fontSize: '12.5px', color: 'var(--mg-text-1)', fontWeight: 600, display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {t('account.info.emailLabel')}
          </span>
          <Input
            value={profile.email}
            disabled
            style={{ backgroundColor: 'var(--mg-bg-1)', borderRadius: '8px', border: '1px solid var(--mg-border)' }}
          />
          <span style={{ fontSize: '11.5px', color: 'var(--mg-text-2)', marginTop: '6px', display: 'block' }}>
            {t('account.info.emailHint')}
          </span>
        </div>

        <div>
          <span style={{ fontSize: '12.5px', color: 'var(--mg-text-1)', fontWeight: 600, display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {t('account.info.nameLabel')}
          </span>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('account.info.namePlaceholder')}
              style={{ flex: 1, borderRadius: '8px' }}
            />
            <Button
              variant="brand"
              disabled={!isDirty || updateMutation.isPending}
              onClick={() => updateMutation.mutate()}
              className="rounded-[8px] px-5 font-semibold transition-all"
            >
              {updateMutation.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
