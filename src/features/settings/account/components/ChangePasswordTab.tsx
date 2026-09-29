import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { LuCheck, LuLock, LuEye, LuEyeOff } from 'react-icons/lu'
import { changePassword } from '@/services/account'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { appToast } from '@/lib/app-toast'

function PasswordDialog({ open, onClose, hasPassword }: { open: boolean; onClose: () => void; hasPassword: boolean }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<'verify' | 'set'>(hasPassword ? 'verify' : 'set')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  // 复用的小眼睛切换(显示/隐藏密码)
  const eyeSuffix = (
    <button
      type="button"
      onClick={() => setShowPwd((v) => !v)}
      aria-label={showPwd ? t('account.security.hidePassword') : t('account.security.showPassword')}
      className="inline-flex text-mg-text-3 transition-colors hover:text-mg-text-1 cursor-pointer"
    >
      {showPwd ? <LuEyeOff size={16} /> : <LuEye size={16} />}
    </button>
  )
  const pwdType = showPwd ? 'text' : 'password'

  const reset = () => {
    setStep(hasPassword ? 'verify' : 'set')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setError('')
    setShowPwd(false)
  }

  const mutation = useMutation({
    mutationFn: () =>
      changePassword({ ...(hasPassword ? { current_password: currentPassword } : {}), new_password: newPassword }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['account-profile'] })
      appToast.success(t('account.security.toastSuccess'))
      onClose()
      reset()
    },
    onError: (err: Error) => appToast.requestError(err, t('account.security.toastError')),
  })

  const handleClose = () => {
    if (mutation.isPending) return
    onClose()
    reset()
  }

  const goNext = () => {
    if (!currentPassword.trim()) {
      setError(t('account.security.warningEmpty'))
      return
    }
    setError('')
    setStep('set')
  }

  const complete = () => {
    if (newPassword.length < 8) {
      setError(t('account.security.errorLength'))
      return
    }
    if (newPassword !== confirmPassword) {
      setError(t('account.security.errorMismatch'))
      return
    }
    setError('')
    mutation.mutate()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="md"
      title={hasPassword ? t('account.security.changePassword') : t('account.security.setPassword')}
      footer={
        step === 'verify' ? (
          <div className="flex justify-end gap-2">
            <Button size="small" variant="secondary" onClick={handleClose}>{t('common.cancel')}</Button>
            <Button size="small" variant="brand" onClick={goNext}>{t('account.security.next')}</Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button size="small" variant="secondary" disabled={mutation.isPending} onClick={() => { if (hasPassword) { setStep('verify'); setError('') } else { handleClose() } }}>{t(hasPassword ? 'account.security.previous' : 'common.cancel')}</Button>
            <Button size="small" variant="brand" loading={mutation.isPending} onClick={complete}>
              {hasPassword ? t('account.security.completeChange') : t('account.security.completeSet')}
            </Button>
          </div>
        )
      }
    >
      {/* 步骤指示：验证身份 → 设置新密码 */}
      {hasPassword && <div className="mb-5 flex items-center gap-2 text-xs font-semibold">
          <span className={step === 'verify' ? 'text-brand-base' : 'text-mg-success'}>
            <span className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-current/10 align-middle">
              {step === 'set' ? <LuCheck size={11} /> : '1'}
            </span>
          {t('account.security.verifyIdentity')}
        </span>
        <span className="h-px flex-1 bg-mg-border" />
        <span className={step === 'set' ? 'text-brand-base' : 'text-mg-text-3'}>
          <span className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-current/10 align-middle">2</span>
          {t('account.security.setNewPassword')}
        </span>
      </div>}

      {step === 'verify' ? (
        <div className="space-y-3">
          <div>
            <label htmlFor="account-current-password" className="mb-2 block text-xs font-semibold text-mg-text-2">{t('account.security.currentPassword')}</label>
            <Input
              type={pwdType}
              autoFocus
              id="account-current-password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={t('account.security.currentPlaceholder')}
              suffix={eyeSuffix}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label htmlFor="account-new-password" className="mb-2 block text-xs font-semibold text-mg-text-2">{t('account.security.newPassword')}</label>
            <Input
              type={pwdType}
              autoFocus
              id="account-new-password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t('account.security.newPlaceholder')}
              suffix={eyeSuffix}
            />
          </div>
          <div>
            <label htmlFor="account-confirm-password" className="mb-2 block text-xs font-semibold text-mg-text-2">{t('account.security.confirmPassword')}</label>
            <Input
              type={pwdType}
              id="account-confirm-password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('account.security.confirmPlaceholder')}
              suffix={eyeSuffix}
            />
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-mg-danger">{error}</p>}
    </Modal>
  )
}

/**
 * 「登录密码」行——不自带卡片，由 index.tsx 的「安全与登录」统一卡片承载，
 * 与偏好设置页同一「一张卡 + 分隔行」结构（DESIGN.md Card 铁律）。
 */
export const ChangePasswordTab: React.FC<{ hasPassword: boolean }> = ({ hasPassword }) => {
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between gap-4 pb-5 border-b border-mg-border/40">
        <div className="min-w-0">
          <div className="text-[14px] font-bold text-mg-text-1">{t('account.security.passwordTitle')}</div>
          <div className="mt-1 text-xs leading-relaxed text-mg-text-3">
            {hasPassword ? t('account.security.passwordDesc') : t('account.security.passwordNotSetDesc')}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {/* prd#1093：未设置密码时只展示按钮，不展示锁图标/掩码预览（未设置态无锁可言） */}
          {hasPassword && (
            <span className="hidden items-center gap-1.5 text-mg-text-3 sm:flex">
              <LuLock size={13} />
              <span className="font-mono text-sm tracking-widest">••••••••</span>
            </span>
          )}
          <Button size="small" variant="brand" onClick={() => setDialogOpen(true)}>
            {hasPassword ? t('account.security.changePassword') : t('account.security.setPassword')}
          </Button>
        </div>
      </div>

      {dialogOpen && <PasswordDialog open hasPassword={hasPassword} onClose={() => setDialogOpen(false)} />}
    </>
  )
}
