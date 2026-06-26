import { useState } from 'react'
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
  confirmLabel = '确认',
  cancelLabel = '取消',
  variant = 'default',
  loading = false,
  requireTyping,
  children,
}: ConfirmModalProps) {
  const [typedValue, setTypedValue] = useState('')

  function handleClose() {
    setTypedValue('')
    onClose()
  }

  const confirmDisabled = loading || (requireTyping !== undefined && typedValue !== requireTyping)

  return (
    <Modal open={open} onClose={handleClose} title={title} description={description} size="sm"
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={loading}>{cancelLabel}</Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            loading={loading}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {requireTyping !== undefined && (
        <div className="mt-3 space-y-1.5">
          <p className="mg-text-caption text-mg-text-2">
            请输入 <span className="font-mono font-semibold text-mg-text-0">{requireTyping}</span> 以确认
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
