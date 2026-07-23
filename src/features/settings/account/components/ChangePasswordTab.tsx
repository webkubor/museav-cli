import React, { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { LuCheck, LuLock, LuEye, LuEyeOff } from 'react-icons/lu'
import { changePassword } from '@/services/account'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { appToast } from '@/lib/app-toast'

/**
 * 登录密码：对齐原型 AccountPasswordDialog——「行 + 按钮 → 两步弹窗(验证身份 → 设新密码)」。
 *
 * 当前仅支持已设置密码的用户通过当前密码验证后修改密码；忘记密码走独立的邮箱重置流程。
 */
const HAS_PASSWORD = true // TODO(待后端 has_password)：暂无法探测，按已设密码处理

function PasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const [step, setStep] = useState<'verify' | 'set'>('verify')
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
      aria-label={showPwd ? '隐藏密码' : '显示密码'}
      className="inline-flex text-mg-text-3 transition-colors hover:text-mg-text-1 cursor-pointer"
    >
      {showPwd ? <LuEyeOff size={16} /> : <LuEye size={16} />}
    </button>
  )
  const pwdType = showPwd ? 'text' : 'password'

  const reset = () => {
    setStep('verify')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setError('')
    setShowPwd(false)
  }

  const mutation = useMutation({
    mutationFn: () =>
      changePassword({ current_password: currentPassword, new_password: newPassword }),
    onSuccess: () => {
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
      title={HAS_PASSWORD ? '修改密码' : '设置密码'}
      footer={
        step === 'verify' ? (
          <div className="flex justify-end gap-2">
            <Button size="small" variant="secondary" onClick={handleClose}>{t('common.cancel')}</Button>
            <Button size="small" variant="brand" onClick={goNext}>下一步</Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button size="small" variant="secondary" disabled={mutation.isPending} onClick={() => { setStep('verify'); setError('') }}>上一步</Button>
            <Button size="small" variant="brand" loading={mutation.isPending} onClick={complete}>
              {HAS_PASSWORD ? '完成修改' : '完成设置'}
            </Button>
          </div>
        )
      }
    >
      {/* 步骤指示：验证身份 → 设置新密码 */}
      <div className="mb-5 flex items-center gap-2 text-xs font-semibold">
        <span className={step === 'verify' ? 'text-brand-base' : 'text-mg-success'}>
          <span className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-current/10 align-middle">
            {step === 'set' ? <LuCheck size={11} /> : '1'}
          </span>
          验证身份
        </span>
        <span className="h-px flex-1 bg-mg-border" />
        <span className={step === 'set' ? 'text-brand-base' : 'text-mg-text-3'}>
          <span className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-current/10 align-middle">2</span>
          设置新密码
        </span>
      </div>

      {step === 'verify' ? (
        <div className="space-y-3">
          <div>
            <span className="mb-2 block text-xs font-semibold text-mg-text-2">{t('account.security.currentPassword')}</span>
            <Input
              type={pwdType}
              autoFocus
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
            <span className="mb-2 block text-xs font-semibold text-mg-text-2">{t('account.security.newPassword')}</span>
            <Input
              type={pwdType}
              autoFocus
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t('account.security.newPlaceholder')}
              suffix={eyeSuffix}
            />
          </div>
          <div>
            <span className="mb-2 block text-xs font-semibold text-mg-text-2">{t('account.security.confirmPassword')}</span>
            <Input
              type={pwdType}
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

export const ChangePasswordTab: React.FC = () => {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="max-w-[520px] pt-2">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-mg-border bg-mg-bg-1 px-5 py-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-mg-text-1">登录密码</div>
          <div className="mt-1 text-xs leading-relaxed text-mg-text-3">
            {HAS_PASSWORD ? '用于账号密码登录。' : '账号还未设置密码，设置后可用密码登录。'}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden items-center gap-1.5 text-mg-text-3 sm:flex">
            <LuLock size={13} />
            <span className="font-mono text-sm tracking-widest">{HAS_PASSWORD ? '••••••••' : '未设置'}</span>
          </span>
          <Button size="small" variant="brand" onClick={() => setDialogOpen(true)}>
            {HAS_PASSWORD ? '修改密码' : '设置密码'}
          </Button>
        </div>
      </div>

      <PasswordDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  )
}
