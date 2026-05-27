import React, { useState } from 'react'
import { Button, Input, Toast, Typography } from '@douyinfe/semi-ui'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { changePassword } from '@/services/account'

const { Text } = Typography

export const ChangePasswordTab: React.FC = () => {
  const { t } = useTranslation()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      changePassword({ current_password: currentPassword, new_password: newPassword }),
    onSuccess: () => {
      Toast.success(t('account.security.toastSuccess'))
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    },
    onError: (err: any) => {
      Toast.error(err?.message || t('account.security.toastError'))
    },
  })

  function handleSubmit() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Toast.warning(t('account.security.warningEmpty'))
      return
    }
    if (newPassword !== confirmPassword) {
      Toast.error(t('account.security.errorMismatch'))
      return
    }
    if (newPassword.length < 8) {
      Toast.error(t('account.security.errorLength'))
      return
    }
    mutation.mutate()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '480px', paddingTop: '8px' }}>
      <div>
        <Text style={{ fontSize: '12.5px', color: 'var(--semi-color-text-1)', fontWeight: 600, display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {t('account.security.currentPassword')}
        </Text>
        <Input
          mode="password"
          value={currentPassword}
          onChange={(val) => setCurrentPassword(val)}
          placeholder={t('account.security.currentPlaceholder')}
          style={{ borderRadius: '8px' }}
        />
      </div>

      <div>
        <Text style={{ fontSize: '12.5px', color: 'var(--semi-color-text-1)', fontWeight: 600, display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {t('account.security.newPassword')}
        </Text>
        <Input
          mode="password"
          value={newPassword}
          onChange={(val) => setNewPassword(val)}
          placeholder={t('account.security.newPlaceholder')}
          style={{ borderRadius: '8px' }}
        />
      </div>

      <div>
        <Text style={{ fontSize: '12.5px', color: 'var(--semi-color-text-1)', fontWeight: 600, display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {t('account.security.confirmPassword')}
        </Text>
        <Input
          mode="password"
          value={confirmPassword}
          onChange={(val) => setConfirmPassword(val)}
          placeholder={t('account.security.confirmPlaceholder')}
          style={{ borderRadius: '8px' }}
        />
      </div>

      <div style={{ marginTop: '8px' }}>
        <Button
          theme="solid"
          loading={mutation.isPending}
          onClick={handleSubmit}
          style={{ 
            borderRadius: '8px', 
            padding: '0 24px',
            fontWeight: 600
          }}
        >
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}
