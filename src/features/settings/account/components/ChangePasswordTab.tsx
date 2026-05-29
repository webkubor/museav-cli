import React, { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { changePassword } from '@/services/account'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { appToast } from '@/lib/app-toast'

export const ChangePasswordTab: React.FC = () => {
  const { t } = useTranslation()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      changePassword({ current_password: currentPassword, new_password: newPassword }),
    onSuccess: () => {
      appToast.success(t('account.security.toastSuccess'))
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    },
    onError: (err: any) => {
      appToast.error(err?.message || t('account.security.toastError'))
    },
  })

  function handleSubmit() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      appToast.warning(t('account.security.warningEmpty'))
      return
    }
    if (newPassword !== confirmPassword) {
      appToast.error(t('account.security.errorMismatch'))
      return
    }
    if (newPassword.length < 8) {
      appToast.error(t('account.security.errorLength'))
      return
    }
    mutation.mutate()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '480px', paddingTop: '8px' }}>
      <div>
        <span style={{ fontSize: '12.5px', color: 'var(--semi-color-text-1)', fontWeight: 600, display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {t('account.security.currentPassword')}
        </span>
        <Input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder={t('account.security.currentPlaceholder')}
          style={{ borderRadius: '8px' }}
        />
      </div>

      <div>
        <span style={{ fontSize: '12.5px', color: 'var(--semi-color-text-1)', fontWeight: 600, display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {t('account.security.newPassword')}
        </span>
        <Input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder={t('account.security.newPlaceholder')}
          style={{ borderRadius: '8px' }}
        />
      </div>

      <div>
        <span style={{ fontSize: '12.5px', color: 'var(--semi-color-text-1)', fontWeight: 600, display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {t('account.security.confirmPassword')}
        </span>
        <Input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder={t('account.security.confirmPlaceholder')}
          style={{ borderRadius: '8px' }}
        />
      </div>

      <div style={{ marginTop: '8px' }}>
        <Button
          variant="default"
          onClick={handleSubmit}
          className="rounded-[8px] px-6 font-semibold transition-all"
        >
          {mutation.isPending ? t('common.loading') : t('common.save')}
        </Button>
      </div>
    </div>
  )
}
