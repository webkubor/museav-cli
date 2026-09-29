import React, { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { deleteAccount } from '@/services/account'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { appToast } from '@/lib/app-toast'
import { useAuthStore } from '@/store/auth'
import { formatDateTime } from '@/lib/format-date'

const DELETE_CONFIRM_TEXT = 'DELETE'

/**
 * 注销账号危险区（自 ChangePasswordTab 拆出）。
 * 对齐原型「安全与登录」页序：密码 → OAuth 绑定 → 注销，注销恒为该 tab 最末的危险区。
 */
export const DeleteAccountSection: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const clearAuth = useAuthStore((state) => state.clearAuth)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteReason, setDeleteReason] = useState('')

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

  function handleDeleteSubmit() {
    if (!deletePassword) {
      appToast.warning(t('account.security.deletePasswordRequired'))
      return
    }
    deleteMutation.mutate()
  }

  return (
    <div className="rounded-md border border-mg-danger/30 bg-mg-danger/5 p-5" style={{ maxWidth: '480px' }}>
      <div className="mb-[14px]">
        <div className="mb-[6px] text-sm font-bold text-mg-danger">
          {t('account.security.deleteTitle')}
        </div>
        <div className="text-xs leading-relaxed text-mg-text-2">
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
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-mg-text-2">
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
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-mg-text-2">
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
