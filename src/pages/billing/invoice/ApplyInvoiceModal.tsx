/**
 * 申请开票弹窗（对齐 PRD `modal === "invoice"`，从账单「发票」tab 的「申请开票」按钮拉起）
 */
import { LuReceipt } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import { ApplyInvoiceTab } from './ApplyInvoiceTab'

export function ApplyInvoiceModal({
  open,
  onClose,
  tenantId,
  currencySymbol,
  onInvoiced,
  onGoTitles,
}: {
  open: boolean
  onClose: () => void
  tenantId: string
  currencySymbol: string
  onInvoiced: () => void
  onGoTitles: () => void
}) {
  const { t } = useTranslation('billing')

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <LuReceipt size={18} className="text-brand-base" />
          {t('billing.invoice.applyModalTitle')}
        </span>
      }
    >
      <div className="min-h-[360px] max-h-[60vh] overflow-y-auto pr-1">
        <ApplyInvoiceTab
          tenantId={tenantId}
          currencySymbol={currencySymbol}
          onInvoiced={() => {
            onInvoiced()
            onClose()
          }}
          onGoTitles={() => {
            onClose()
            onGoTitles()
          }}
        />
      </div>
    </Modal>
  )
}
