/**
 * 「发票」tab 内嵌内容（对齐 PRD BillingPage.billing-ledger-panel 的 activeTab === "invoices"）
 * 工具栏：可开票充值单 N 笔 · 合计 X + 发票抬头 / 申请开票（各拉起独立弹窗）；
 * 主体复用 InvoiceRecordsTab（状态筛选 + 搜索 + 列表）。
 */
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { listInvoiceableRecharges } from '@/services/invoice'
import { InvoiceRecordsTab } from './InvoiceRecordsTab'
import { ApplyInvoiceModal } from './ApplyInvoiceModal'
import { InvoiceTitleModal } from './InvoiceTitleModal'

export function BillingInvoiceTab({
  tenantId,
  currencySymbol,
}: {
  tenantId: string
  currencySymbol: string
}) {
  const qc = useQueryClient()
  const [applyOpen, setApplyOpen] = useState(false)
  const [titlesOpen, setTitlesOpen] = useState(false)

  const { data } = useQuery({
    queryKey: ['invoice', 'recharges', tenantId],
    queryFn: () => listInvoiceableRecharges(tenantId),
    enabled: Boolean(tenantId),
  })
  const invoiceable = (data?.items ?? []).filter((r) => r.invoice_status === 'billable')
  const invoiceableAmount = invoiceable.reduce((sum, r) => sum + Number(r.amount || 0), 0)

  const refreshRecords = () => {
    qc.invalidateQueries({ queryKey: ['invoice', 'recharges', tenantId] })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-mg-text-3">
          可开票充值单 <strong className="text-mg-text-1">{invoiceable.length}</strong> 笔 · 合计{' '}
          <strong className="text-mg-text-1">{currencySymbol}{invoiceableAmount}</strong>
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setTitlesOpen(true)}>
            发票抬头
          </Button>
          <Button
            variant="brand"
            size="sm"
            disabled={invoiceable.length === 0}
            title={invoiceable.length === 0 ? '暂无可开票的充值单，新充值到账后即可申请' : '勾选充值单合并开票'}
            onClick={() => setApplyOpen(true)}
          >
            申请开票
          </Button>
        </div>
      </div>

      <InvoiceRecordsTab tenantId={tenantId} currencySymbol={currencySymbol} />

      <ApplyInvoiceModal
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        tenantId={tenantId}
        currencySymbol={currencySymbol}
        onInvoiced={refreshRecords}
        onGoTitles={() => setTitlesOpen(true)}
      />
      <InvoiceTitleModal open={titlesOpen} onClose={() => setTitlesOpen(false)} tenantId={tenantId} />
    </div>
  )
}
