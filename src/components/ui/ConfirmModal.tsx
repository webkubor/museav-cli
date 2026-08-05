import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface ConfirmModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'destructive' | 'default'
  loading?: boolean
  requireTyping?: string
  children?: React.ReactNode
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = 'default',
  loading = false,
  requireTyping,
  children,
}: ConfirmModalProps) {
  const { t } = useTranslation()
  const [typedValue, setTypedValue] = useState('')
  const confirmText = confirmLabel ?? t('common.confirm')
  const cancelText = cancelLabel ?? t('common.cancel')

  function handleClose() {
    setTypedValue('')
    onClose()
  }

  const confirmDisabled = loading || (requireTyping !== undefined && typedValue !== requireTyping)

  return (
    <Modal open={open} onClose={handleClose} title={title} description={description} size="sm"
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={loading}>{cancelText}</Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            loading={loading}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      {children}
      {requireTyping !== undefined && (
        <div className="mt-3 space-y-1.5">
          <p className="mg-text-caption text-mg-text-3">
            {t('common.confirmModal.typeToConfirm')} <span className="font-mono font-semibold text-mg-text-1">{requireTyping}</span> {t('common.confirmModal.toConfirm')}
          </p>
          <Input
            value={typedValue}
            onChange={(e) => setTypedValue(e.target.value)}
            placeholder={requireTyping}
            className="mg-control-md mg-text-caption rounded-lg"
          />
        </div>
      )}
    </Modal>
  )
}

export default ConfirmModal
