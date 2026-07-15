import React, { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { LuCheck, LuLock } from 'react-icons/lu'
import { changePassword } from '@/services/account'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { appToast } from '@/lib/app-toast'

/**
 * 登录密码：对齐原型 AccountPasswordDialog——「行 + 按钮 → 两步弹窗(验证身份 → 设新密码)」。
 *
 * ⚠️ 待后端(凌霄，见 GitLab 单)三项，到位前只有「修改密码(输当前密码)」可用：
 *  1. AccountProfile.has_password —— 判断显示「设置密码」还是「修改密码」；现无字段，暂按已设密码。
 *  2. 免当前密码的「设置密码」接口 —— 手机/OAuth 注册的无密码用户首次设密码。
 *  3. 手机验证码验证改/设密码接口 —— 「忘记密码？改用手机验证码验证」。
 * 上述未就绪的入口先 disabled 并标注，接口到位后点亮。
 */
const HAS_PASSWORD = true // TODO(待后端 has_password)：暂无法探测，按已设密码处理

function PasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const [step, setStep] = useState<'verify' | 'set'>('verify')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')

  const reset = () => {
    setStep('verify')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setError('')
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
      size="sm"
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
              type="password"
              autoFocus
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={t('account.security.currentPlaceholder')}
            />
          </div>
          {/* 待后端(凌霄)：手机验证码验证接口就绪后点亮 */}
          <button
            type="button"
            disabled
            title="待后端支持"
            className="cursor-not-allowed text-xs font-medium text-mg-text-3/70"
          >
            忘记密码？改用手机验证码验证（待后端）
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <span className="mb-2 block text-xs font-semibold text-mg-text-2">{t('account.security.newPassword')}</span>
            <Input
              type="password"
              autoFocus
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t('account.security.newPlaceholder')}
            />
          </div>
          <div>
            <span className="mb-2 block text-xs font-semibold text-mg-text-2">{t('account.security.confirmPassword')}</span>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('account.security.confirmPlaceholder')}
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
