import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { updateProfile, uploadAvatar, bindEmail } from '@/services/account'
import { sendEmailCode } from '@/services/auth'
import { getCaptchaParam } from '@/lib/aliyun-captcha'
import { useAuthStore } from '@/store/auth'
import type { AccountProfile } from '@/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { VerificationCodeButton } from '@/components/auth/VerificationCodeButton'
import { AvatarUpload } from '@/components/ui/AvatarUpload'
import { ReferralInviteCard } from '@/components/referral/ReferralInviteCard'
import { getReferralOverview } from '@/services/referral'
import { appToast } from '@/lib/app-toast'
import { trackEvent } from '@/lib/track'
import { errorCodeOf } from '@/lib/request-error-message'
import { useMarket } from '@/hooks/useMarket'
import { LuGift } from 'react-icons/lu'
import { ContactRebindDialog, type ContactRebindMode } from './ContactRebindDialog'
import { maskEmail, maskPhone } from '../contact-mask'

interface BasicInfoTabProps {
  profile: AccountProfile
}

export const BasicInfoTab: React.FC<BasicInfoTabProps> = ({ profile }) => {
  const { t } = useTranslation()
  const market = useMarket()
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

  // 绑定邮箱（qa#397）：闭环已有账户绑定能力（手机/OAuth 已有，补邮箱）
  const [emailBindOpen, setEmailBindOpen] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.trim())

  const handleSendEmailCode = async () => {
    try {
      // 公共邮箱发码端点后端要人机参数（缺参 40025「人机校验不通过」），与注册页同口径
      const captcha = await getCaptchaParam()
      const r = await sendEmailCode(emailInput.trim(), captcha)
      trackEvent('account.email:send_code', undefined, { result: 'success' })
      return r.expires_in
    } catch (err) {
      trackEvent('account.email:send_code', undefined, { result: 'fail', error_code: errorCodeOf(err) })
      throw err
    }
  }

  const bindEmailMutation = useMutation({
    mutationFn: () => bindEmail(emailInput.trim(), emailCode.trim()),
    onSuccess: (updated) => {
      appToast.success(t('account.info.bindEmailSuccess'))
      setEmailBindOpen(false)
      if (updated) queryClient.setQueryData<AccountProfile>(['account-profile'], updated)
      void queryClient.invalidateQueries({ queryKey: ['account-profile'] })
      trackEvent('account.email:bind', undefined, { result: 'success' })
    },
    onError: (err: unknown) => {
      appToast.requestError(err, t('account.info.bindEmailError'))
      trackEvent('account.email:bind', undefined, { result: 'fail', error_code: errorCodeOf(err) })
    },
  })

  // 换绑（shared/modelgo_prd#837）：手机号 / 邮箱字段本体保持脱敏只读，右侧入口弹三步换绑弹窗
  const [rebindMode, setRebindMode] = useState<ContactRebindMode | null>(null)
  const openRebind = (mode: ContactRebindMode) => {
    trackEvent(mode === 'phone' ? 'account.phone:rebind_open' : 'account.email:rebind_open')
    setRebindMode(mode)
  }

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
            {profile.email ? maskEmail(profile.email) : profile.phone ? maskPhone(profile.phone) : '—'}
          </div>
        </div>
      </div>

      {/* 表单 */}
      <div className="flex flex-col gap-5 max-w-[480px]">
        {/* 手机号仅国内(china)有意义:国外账号无手机号绑定,按 market 约束不展示该模块 */}
        {market === 'china' && profile.phone && (
          <div className="space-y-2">
            <span className="block text-xs font-semibold uppercase tracking-wider text-mg-text-2">
              {t('account.info.phoneLabel')}
            </span>
            <div className="flex gap-2.5">
              <Input className="flex-1" value={maskPhone(profile.phone)} readOnly aria-label={t('account.info.phoneLabel')} />
              <Button variant="outline" className="shrink-0 rounded-sm px-4 font-semibold" onClick={() => openRebind('phone')}>
                {t('account.info.rebind.changePhone')}
              </Button>
            </div>
            <span className="block text-xs leading-relaxed text-mg-text-3">
              {t('account.info.phoneHint')}
            </span>
          </div>
        )}

        <div className="space-y-2">
          <span className="block text-xs font-semibold uppercase tracking-wider text-mg-text-2">
            {t('account.info.emailLabel')}
          </span>
          <div className="flex gap-2.5">
            <Input
              className="flex-1"
              value={profile.email ? maskEmail(profile.email) : ''}
              placeholder={profile.email ? undefined : t('account.info.emailUnbound')}
              readOnly
              aria-label={t('account.info.emailLabel')}
            />
            {profile.email && (
              <Button variant="outline" className="shrink-0 rounded-sm px-4 font-semibold" onClick={() => openRebind('email')}>
                {t('account.info.rebind.changeEmail')}
              </Button>
            )}
          </div>
          {profile.email ? (
            <span className="block text-xs leading-relaxed text-mg-text-3">{t('account.info.emailHint')}</span>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs leading-relaxed text-mg-text-3">{t('account.info.emailUnboundHint')}</span>
              <button
                type="button"
                onClick={() => { setEmailInput(''); setEmailCode(''); setEmailBindOpen(true); trackEvent('account.email:bind_open') }}
                className="shrink-0 text-xs font-bold text-brand-base hover:text-brand-base/80 bg-transparent border-none p-0 cursor-pointer transition-colors"
              >
                {t('account.info.bindEmail')}
              </button>
            </div>
          )}

          {/* modal={false} + 拦外部交互：人机验证浮层 portal 在 Dialog 之外，见 ContactRebindDialog 同款注释 */}
          <Modal
            open={emailBindOpen}
            onClose={() => { if (!bindEmailMutation.isPending) setEmailBindOpen(false) }}
            size="md"
            modal={false}
            onPointerDownOutside={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
            title={t('account.info.bindEmailTitle')}
            description={t('account.info.bindEmailDesc')}
            footer={(
              <>
                <Button variant="outline" disabled={bindEmailMutation.isPending} className="h-8 rounded-lg px-3 text-xs" onClick={() => setEmailBindOpen(false)}>{t('common.cancel')}</Button>
                <Button variant="brand" loading={bindEmailMutation.isPending} disabled={!emailValid || emailCode.trim().length === 0} className="h-8 rounded-lg px-4 text-xs font-semibold" onClick={() => bindEmailMutation.mutate()}>{t('account.info.bindEmailConfirm')}</Button>
              </>
            )}
          >
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-mg-text-2">{t('account.info.emailLabel')}</label>
                <Input value={emailInput} disabled={bindEmailMutation.isPending} onChange={(e) => setEmailInput(e.target.value)} placeholder="you@example.com" size="sm" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-mg-text-2">{t('account.auth.fields.code')}</label>
                <Input
                  value={emailCode}
                  disabled={bindEmailMutation.isPending}
                  onChange={(e) => setEmailCode(e.target.value)}
                  placeholder={t('account.info.emailCodePlaceholder')}
                  size="sm"
                  suffix={<VerificationCodeButton onSend={handleSendEmailCode} disabled={!emailValid} />}
                />
              </div>
            </div>
          </Modal>
        </div>

        <div className="space-y-2">
          <span className="block text-xs font-semibold uppercase tracking-wider text-mg-text-2">
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

        {rebindMode && (
          <ContactRebindDialog key={rebindMode} mode={rebindMode} profile={profile} onClose={() => setRebindMode(null)} />
        )}

        {referral?.inviteLink && (
          <div className="pt-4 border-t border-mg-border/40">
            <p className="text-xs font-bold text-mg-text-3 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <LuGift className="h-3.5 w-3.5 text-brand-base" />
              {t('account.info.referralLabel')}
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
