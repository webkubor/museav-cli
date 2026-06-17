import React, { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { changePassword, deleteAccount } from '@/services/account'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { appToast } from '@/lib/app-toast'
import { useAuthStore } from '@/store/auth'
import { formatDateTime } from '@/lib/format-date'

const DELETE_CONFIRM_TEXT = 'DELETE'

export const ChangePasswordTab: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const clearAuth = useAuthStore((state) => state.clearAuth)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteReason, setDeleteReason] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      changePassword({ current_password: currentPassword, new_password: newPassword }),
    onSuccess: () => {
      appToast.success(t('account.security.toastSuccess'))
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    },
    onError: (err: Error) => {
      appToast.error(err?.message || t('account.security.toastError'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteAccount({ password: deletePassword, reason: deleteReason.trim() }),
    onSuccess: (result) => {
      appToast.success(
        t('account.security.deleteSuccess'),
        t('account.security.deleteSuccessDesc', {
          date: formatDateTime(result.deletion_scheduled_at),
        })
      )
      setDeleteModalOpen(false)
      setDeletePassword('')
      setDeleteReason('')
      clearAuth()
      navigate('/login', { replace: true })
    },
    onError: (error) => {
      appToast.requestError(error, t('account.security.deleteError'))
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

  function handleDeleteSubmit() {
    if (!deletePassword) {
      appToast.warning(t('account.security.deletePasswordRequired'))
      return
    }
    deleteMutation.mutate()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '480px', paddingTop: '8px' }}>
      <div>
        <span style={{ fontSize: '12.5px', color: 'var(--mg-text-1)', fontWeight: 600, display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
        <span style={{ fontSize: '12.5px', color: 'var(--mg-text-1)', fontWeight: 600, display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
        <span style={{ fontSize: '12.5px', color: 'var(--mg-text-1)', fontWeight: 600, display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
          variant="brand"
          onClick={handleSubmit}
          className="rounded-sm px-6 font-semibold transition-all"
        >
          {mutation.isPending ? t('common.loading') : t('common.save')}
        </Button>
      </div>

      <div
        className="rounded-md border border-mg-danger/30 bg-mg-danger/5 p-5"
        style={{ marginTop: '12px' }}
      >
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--mg-danger)', marginBottom: '6px' }}>
            {t('account.security.deleteTitle')}
          </div>
          <div style={{ fontSize: '12.5px', lineHeight: 1.6, color: 'var(--mg-text-1)' }}>
            {t('account.security.deleteDesc')}
          </div>
        </div>
        <Button
          variant="destructive"
          onClick={() => setDeleteModalOpen(true)}
          className="rounded-sm px-5 font-semibold"
        >
          {t('account.security.deleteAction')}
        </Button>
      </div>

      <ConfirmModal
        open={deleteModalOpen}
        onClose={() => {
          if (deleteMutation.isPending) return
          setDeleteModalOpen(false)
        }}
        onConfirm={handleDeleteSubmit}
        title={t('account.security.deleteModalTitle')}
        description={t('account.security.deleteModalDesc', { text: DELETE_CONFIRM_TEXT })}
        confirmLabel={t('account.security.deleteConfirmAction')}
        cancelLabel={t('common.cancel')}
        variant="destructive"
        loading={deleteMutation.isPending}
        requireTyping={DELETE_CONFIRM_TEXT}
      >
        <div className="space-y-4">
          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-mg-text-1">
              {t('account.security.deletePassword')}
            </span>
            <Input
              type="password"
              value={deletePassword}
              disabled={deleteMutation.isPending}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder={t('account.security.deletePasswordPlaceholder')}
            />
          </div>
          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-mg-text-1">
              {t('account.security.deleteReason')}
            </span>
            <Textarea
              value={deleteReason}
              disabled={deleteMutation.isPending}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder={t('account.security.deleteReasonPlaceholder')}
            />
          </div>
        </div>
      </ConfirmModal>
    </div>
  )
}
