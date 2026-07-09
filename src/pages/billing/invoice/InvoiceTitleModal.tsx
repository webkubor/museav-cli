/**
 * 发票抬头弹窗（对齐 PRD `modal === "titles"`，从账单「发票」tab 的「发票抬头」按钮拉起）
 */
import { LuBuilding2 } from 'react-icons/lu'
import { Modal } from '@/components/ui/Modal'
import { InvoiceTitleTab } from './InvoiceTitleTab'

export function InvoiceTitleModal({
  open,
  onClose,
  tenantId,
}: {
  open: boolean
  onClose: () => void
  tenantId: string
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <LuBuilding2 size={18} className="text-brand-base" />
          发票抬头
        </span>
      }
    >
      <div className="min-h-[300px] max-h-[60vh] overflow-y-auto pr-1">
        <InvoiceTitleTab tenantId={tenantId} />
      </div>
    </Modal>
  )
}
