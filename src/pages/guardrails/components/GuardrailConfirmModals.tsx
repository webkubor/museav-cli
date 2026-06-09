import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

export function GuardrailConfirmModals({
  deleteTarget, onCloseDelete, deleting, onConfirmDelete,
  showClearBudget, onCloseClear, clearing, onConfirmClear,
}: {
  deleteTarget: { id: string; name: string } | null
  onCloseDelete: () => void
  deleting: boolean
  onConfirmDelete: () => void
  showClearBudget: boolean
  onCloseClear: () => void
  clearing: boolean
  onConfirmClear: () => void
}) {
  const { t } = useTranslation()

  return (
    <>
      {/* 删除确认 Modal */}
      <Modal
        open={!!deleteTarget}
        onClose={onCloseDelete}
        title={t('guardrails.deleteModal.title')}
        description={t('guardrails.deleteModal.description', { name: deleteTarget?.name })}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={onCloseDelete}>{t('guardrails.deleteModal.cancel')}</Button>
            <Button variant="destructive" loading={deleting} onClick={onConfirmDelete}>
              {t('guardrails.deleteModal.confirm')}
            </Button>
          </>
        }
      />

      {/* 清除预算确认 Modal */}
      <Modal
        open={showClearBudget}
        onClose={onCloseClear}
        title="确认清除预算限额？"
        description="此操作不可撤销。"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={onCloseClear}>取消</Button>
            <Button variant="destructive" loading={clearing} onClick={onConfirmClear}>
              确认清除
            </Button>
          </>
        }
      />
    </>
  )
}
