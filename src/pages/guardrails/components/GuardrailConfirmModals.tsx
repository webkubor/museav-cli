import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

export function GuardrailConfirmModals({
  deleteTarget, onCloseDelete, deleting, onConfirmDelete,
}: {
  deleteTarget: { id: string; name: string; isActiveGlobal?: boolean } | null
  onCloseDelete: () => void
  deleting: boolean
  onConfirmDelete: () => void
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
      >
        {/* 删除启用中的全局护栏 = 该空间在全局护栏层放开使用，需二次提醒（文档§全局护栏） */}
        {deleteTarget?.isActiveGlobal && (
          <div role="alert" className="p-3 rounded-lg border border-mg-warning/40 bg-mg-warning/5 text-xs text-mg-warning">
            这是当前启用中的全局护栏。删除后该工作空间将无全局默认预算与模型/IP 边界，按「无全局护栏，放开使用」处理。
          </div>
        )}
      </Modal>
    </>
  )
}
