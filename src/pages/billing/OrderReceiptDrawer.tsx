import { LuReceipt, LuX } from 'react-icons/lu'
import type { RechargeOrder } from '@/types'
import { useTranslation } from 'react-i18next'
import { useSite } from '@/hooks/use-platform-config'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { StatusConfig } from '@/components/ui/StatusBadge'
import { formatDateTime } from '@/lib/format-date'

// ─── Sub-components: OrderReceiptDrawer ───────────────────────────────────

interface OrderReceiptDrawerProps {
  isOpen: boolean
  order: RechargeOrder
  onClose: () => void
  cancelMutation: { isPending: boolean; mutate: (orderNo: string) => void }
  labels: Record<string, string>
  onCancelRequest?: (orderNo: string) => void
}

export function OrderReceiptDrawer({ isOpen, order, onClose, cancelMutation, labels, onCancelRequest }: OrderReceiptDrawerProps) {
  const { t } = useTranslation()
  const site = useSite()
  if (!isOpen || !order) return null

  const isPending = order.status === 'pending'

  const orderStatusMap: Record<string, StatusConfig> = {
    paid: { label: labels['paid'] ?? 'paid', variant: 'success' },
    pending: { label: labels['pending'] ?? 'pending', variant: 'warning', dot: true },
    failed: { label: labels['failed'] ?? 'failed', variant: 'danger' },
    cancelled: { label: labels['cancelled'] ?? 'cancelled', variant: 'outline' },
  }

  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Drawer Body */}
      <div className="relative w-full max-w-[380px] h-full bg-mg-bg-1/95 backdrop-blur-xl border-l border-mg-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 ease-out z-10">

        {/* Drawer Header */}
        <div className="p-4 border-b border-mg-border/60 flex items-center justify-between bg-mg-fill-0/20">
          <span className="text-xs font-bold text-mg-text-2 uppercase tracking-wider flex items-center gap-1.5">
            <LuReceipt size={14} className="text-brand-base" />
            {t('billing.orders.detailTitle')}
          </span>
          <button
            onClick={onClose}
            className="text-mg-text-2 hover:text-mg-text-0 hover:bg-mg-fill-0/80 p-1.5 rounded-lg transition-colors cursor-pointer outline-none"
          >
            <LuX size={16} />
          </button>
        </div>

        {/* Tactile Receipt Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Visual Invoice Page style */}
          <div className="rounded-xl border border-mg-border bg-mg-fill-0/30 p-5 space-y-5 relative shadow-inner overflow-hidden">
            {/* Top decorative receipt cut lines */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-[linear-gradient(to_right,var(--mg-border)_50%,transparent_50%)] bg-[size:10px_100%]" />

            {/* Receipt Brand Head */}
            <div className="text-center pt-2 pb-4 border-b border-dashed border-mg-border/80 space-y-1">
              <div className="text-[10px] font-bold text-brand-base uppercase tracking-widest">
                ModelGo Ledger
              </div>
              <div className="text-sm font-mono font-bold tracking-tight text-mg-text-0">
                {t('billing.orders.detail.receiptTitle')}
              </div>
            </div>

            {/* Status Big Badge */}
            <div className="flex flex-col items-center py-2 space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-mg-text-3 font-bold">
                {t('billing.orders.detail.status')}
              </div>
              <StatusBadge status={order.status} statusMap={orderStatusMap} />
            </div>

            {/* Receipt Details rows inside monospace grid */}
            <div className="font-mono text-xs space-y-3.5 border-t border-b border-dashed border-mg-border/80 py-4 text-mg-text-1">
              <div className="flex justify-between gap-4">
                <span className="text-mg-text-3">{t('billing.orders.detail.orderNo')}:</span>
                <span className="text-mg-text-0 font-bold select-all truncate max-w-[180px]" title={order.order_no}>
                  {order.order_no}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-mg-text-3">{t('billing.orders.detail.amount')}:</span>
                <span className="text-mg-text-0 font-extrabold text-sm leading-none">
                  {order.currency} {order.amount}
                </span>
              </div>
              {order.credited_amount && (
                <div className="flex justify-between gap-4">
                  <span className="text-mg-text-3">{t('billing.orders.detail.credited')}:</span>
                  <span className="text-mg-success font-extrabold">
                    {order.currency} {order.credited_amount}
                  </span>
                </div>
              )}
              {order.channel && (
                <div className="flex justify-between gap-4">
                  <span className="text-mg-text-3">{t('billing.orders.detail.channel')}:</span>
                  <span className="text-mg-text-0 uppercase font-semibold">
                    {order.channel}
                  </span>
                </div>
              )}
              {order.paid_at && (
                <div className="flex justify-between gap-4">
                  <span className="text-mg-text-3">{t('billing.orders.detail.paidAt')}:</span>
                  <span className="text-mg-text-2 text-[11px]">
                    {formatDateTime(order.paid_at)}
                  </span>
                </div>
              )}
              {order.promo_code && (
                <div className="flex justify-between gap-4">
                  <span className="text-mg-text-3">{t('billing.orders.detail.promo')}:</span>
                  <span className="text-brand-base font-bold bg-brand-glow/10 px-1.5 rounded text-[11px]">
                    {order.promo_code}
                  </span>
                </div>
              )}
            </div>

            {/* Fake High-Tech Barcode simulation for receipt realism */}
            <div className="flex flex-col items-center pt-2 space-y-1">
              <div className="h-9 w-full max-w-[200px] flex items-stretch gap-[1.5px] opacity-25">
                {[2, 1, 3, 1, 4, 2, 1, 2, 3, 1, 2, 4, 1, 3, 2, 1, 3, 4, 1, 2, 1, 3, 2, 4, 1].map((w, idx) => (
                  <div
                    key={idx}
                    className="bg-mg-text-0 h-full rounded-sm"
                    style={{ flexGrow: w }}
                  />
                ))}
              </div>
              <span className="text-[8px] text-mg-text-3 font-mono tracking-widest font-semibold uppercase">
                * M G - O R D E R - {order.order_no.slice(-8)} *
              </span>
            </div>

            <div className="text-center text-[9px] text-mg-text-3 font-semibold pt-2">
              {t('billing.orders.detail.receiptFooter')}
            </div>

            {/* Bottom decorative receipt cut lines */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-[linear-gradient(to_right,var(--mg-border)_50%,transparent_50%)] bg-[size:10px_100%]" />
          </div>

          {/* Actions Inside Drawer */}
          <div className="space-y-3">
            {site === 'china' && order.invoice_url && (
              <Button
                variant="outline"
                className="w-full h-10 text-xs font-bold rounded-xl border border-mg-border hover:bg-mg-fill-0 transition-all select-none text-mg-text-1"
                onClick={() => window.open(order.invoice_url!, '_blank')}
              >
                {t('billing.orders.detail.viewInvoice')}
              </Button>
            )}

            {isPending && (
              <Button
                variant="destructive"
                disabled={cancelMutation.isPending}
                className="w-full h-10 text-xs font-bold rounded-xl bg-mg-danger/10 hover:bg-mg-danger/20 text-mg-danger border border-mg-danger/20 active:scale-[0.98] transition-all select-none"
                onClick={() => {
                  if (onCancelRequest) {
                    onCancelRequest(order.order_no)
                  } else {
                    cancelMutation.mutate(order.order_no)
                    onClose()
                  }
                }}
              >
                {cancelMutation.isPending ? t('billing.rechargeModal.submitting') : t('billing.orders.table.cancel')}
              </Button>
            )}
          </div>

        </div>

      </div>
    </div>
  )
}
