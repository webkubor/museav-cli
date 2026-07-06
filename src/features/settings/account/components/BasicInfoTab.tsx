import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { updateProfile, uploadAvatar } from '@/services/account'
import { useAuthStore } from '@/store/auth'
import type { AccountProfile } from '@/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AvatarUpload } from '@/components/ui/AvatarUpload'
import { ReferralInviteCard } from '@/components/referral/ReferralInviteCard'
import { getReferralOverview } from '@/services/referral'
import { appToast } from '@/lib/app-toast'
import { LuGift, LuLock } from 'react-icons/lu'

interface BasicInfoTabProps {
  profile: AccountProfile
}

export const BasicInfoTab: React.FC<BasicInfoTabProps> = ({ profile }) => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [displayName, setDisplayName] = useState(profile.display_name)
  const tenantId = useAuthStore((s) => s.tenants.find((t) => t.is_default)?.tenant_id ?? '')

  const { data: referral } = useQuery({
    queryKey: ['referral', 'overview', tenantId],
    queryFn: () => getReferralOverview(tenantId),
    enabled: !!tenantId,
    staleTime: 60_000,
  })

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
    onError: (err: unknown) => appToast.requestError(err, t('account.info.avatarError')),
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

  const avatarLetter = (profile.display_name || profile.email || profile.phone || 'U').charAt(0).toUpperCase()
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
          <div style={{ fontWeight: 700, color: 'var(--mg-text-1)', fontSize: '16px', letterSpacing: '-0.01em' }}>
            {profile.display_name || '—'}
          </div>
          <div style={{ color: 'var(--mg-text-2)', fontSize: '13px', marginTop: '3.5px' }}>
            {profile.email || (profile.phone ? `${profile.phone.includes('+') ? '' : '+86 '}${profile.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}` : '—')}
          </div>
        </div>
      </div>

      {/* 表单 */}
      <div className="flex flex-col gap-5 max-w-[480px]">
        {profile.phone && (
          <div className="space-y-2">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-mg-text-2">
              手机号码
            </span>
            <Input
              value={`${profile.phone.includes('+') ? '' : '+86 '}${profile.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}`}
              readOnly
              suffix={<LuLock size={14} />}
            />
            <span className="block text-[11px] leading-relaxed text-mg-text-3">
              绑定的安全手机号，暂不支持自主修改。
            </span>
          </div>
        )}

        <div className="space-y-2">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-mg-text-2">
            {t('account.info.emailLabel')}
          </span>
          <Input
            value={profile.email || ''}
            placeholder={profile.email ? undefined : '未绑定'}
            readOnly
            suffix={profile.email ? <LuLock size={14} /> : undefined}
          />
          <span className="block text-[11px] leading-relaxed text-mg-text-3">
            {profile.email ? t('account.info.emailHint') : '暂未绑定电子邮箱。'}
          </span>
        </div>

        <div className="space-y-2">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-mg-text-2">
            {t('account.info.nameLabel')}
          </span>
          <div className="flex gap-2.5">
            <Input
              className="flex-1"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('account.info.namePlaceholder')}
            />
            <Button
              variant="brand"
              disabled={!isDirty || updateMutation.isPending}
              onClick={() => updateMutation.mutate()}
              className="rounded-sm px-5 font-semibold transition-all"
            >
              {updateMutation.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </div>
        </div>

        {referral?.inviteLink && (
          <div className="pt-4 border-t border-mg-border/40">
            <p className="text-xs font-bold text-mg-text-3 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <LuGift className="h-3.5 w-3.5 text-mg-brand" />
              {t('account.info.referralLabel') || '邀请链接'}
            </p>
            <ReferralInviteCard
              inviteLink={referral.inviteLink}
              inviteCode={referral.inviteCode ?? ''}
              compact
            />
          </div>
        )}
      </div>
    </div>
  )
}
