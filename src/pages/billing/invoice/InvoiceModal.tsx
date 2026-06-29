/**
 * 发票 / 开票弹窗（V1.2 功能块 B · FR-B1）
 * 三页签：申请开票 / 发票记录 / 发票抬头。对照原型 #/console/billing 发票弹窗。
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LuReceipt } from 'react-icons/lu'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { listInvoiceRecords } from '@/services/invoice'
import { ApplyInvoiceTab } from './ApplyInvoiceTab'
import { InvoiceRecordsTab } from './InvoiceRecordsTab'
import { InvoiceTitleTab } from './InvoiceTitleTab'

type Tab = 'apply' | 'records' | 'titles'

export function InvoiceModal({
  open,
  onClose,
  tenantId,
  currencySymbol,
}: {
  open: boolean
  onClose: () => void
  tenantId: string
  currencySymbol: string
}) {
  const [tab, setTab] = useState<Tab>('apply')

  // 拉一次记录总数给「发票记录(N)」页签角标（与 RecordsTab 同 queryKey，缓存复用）
  const { data: recordsData } = useQuery({
    queryKey: ['invoice', 'records', tenantId, {}],
    queryFn: () => listInvoiceRecords(tenantId),
    enabled: open && Boolean(tenantId),
  })
  const recordsCount = recordsData?.total

  const tabs: { key: Tab; label: string }[] = [
    { key: 'apply', label: '申请开票' },
    { key: 'records', label: '发票记录' },
    { key: 'titles', label: '发票抬头' },
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <LuReceipt size={18} className="text-brand-base" />
          发票 / 开票
        </span>
      }
    >
      {/* 页签导航 */}
      <div className="flex gap-6 border-b border-mg-border mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'relative pb-2.5 text-sm font-semibold transition-colors',
              tab === t.key ? 'text-brand-base' : 'text-mg-text-3 hover:text-mg-text-2'
            )}
          >
            {t.label}
            {t.key === 'records' && recordsCount != null ? `（${recordsCount}）` : ''}
            {tab === t.key && (
              <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-brand-base" />
            )}
          </button>
        ))}
      </div>

      {/* 页签内容 */}
      <div className="min-h-[360px] max-h-[60vh] overflow-y-auto pr-1">
        {tab === 'apply' && (
          <ApplyInvoiceTab
            tenantId={tenantId}
            currencySymbol={currencySymbol}
            onInvoiced={() => setTab('records')}
            onGoTitles={() => setTab('titles')}
          />
        )}
        {tab === 'records' && <InvoiceRecordsTab tenantId={tenantId} currencySymbol={currencySymbol} />}
        {tab === 'titles' && <InvoiceTitleTab tenantId={tenantId} />}
      </div>
    </Modal>
  )
}
