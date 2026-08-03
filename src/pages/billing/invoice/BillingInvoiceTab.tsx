/**
 * 「发票」tab 内嵌内容（对齐 PRD BillingPage.billing-ledger-panel 的 activeTab === "invoices"）
 * 工具栏：可开票充值单 N 笔 · 合计 X + 发票抬头 / 申请开票（各拉起独立弹窗）；
 * 主体复用 InvoiceRecordsTab（状态筛选 + 搜索 + 列表）。
 */
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { listInvoiceableRecharges, listInvoiceTitles } from '@/services/invoice'
import { InvoiceRecordsTab } from './InvoiceRecordsTab'
import { ApplyInvoiceModal } from './ApplyInvoiceModal'
import { InvoiceTitleModal } from './InvoiceTitleModal'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { trackEvent } from '@/lib/track'
import { countBand } from '../billing-tracking'

export function BillingInvoiceTab({
  tenantId,
  currencySymbol,
}: {
  tenantId: string
  currencySymbol: string
}) {
  const qc = useQueryClient()
  const { hasPermission } = usePermissions()
  const canApplyInvoice = hasPermission(PERMS.BILLING_INVOICE_APPLY)
  const canManageTitles = hasPermission(PERMS.BILLING_INVOICE_TITLE_MANAGE)
  const [applyOpen, setApplyOpen] = useState(false)
  const [titlesOpen, setTitlesOpen] = useState(false)

  const { data } = useQuery({
    queryKey: ['invoice', 'recharges', tenantId],
    queryFn: () => listInvoiceableRecharges(tenantId),
    enabled: Boolean(tenantId),
  })
  // 与 ApplyInvoiceTab/InvoiceTitleTab 共用同一个 queryKey，不重复请求，只为埋点读 has_invoice_title
  const { data: titleData } = useQuery({
    queryKey: ['invoice', 'titles', tenantId],
    queryFn: () => listInvoiceTitles(tenantId),
    enabled: Boolean(tenantId),
  })
  const invoiceable = (data?.items ?? []).filter((r) => r.invoice_status === 'billable')
  const invoiceableAmount = invoiceable.reduce((sum, r) => sum + Number(r.amount || 0), 0)
  const hasInvoiceTitle = (titleData?.items ?? []).length > 0

  // §11.2 billing_invoice_tab_view：切到「发票」tab（本组件按 ledgerTab === 'invoices' 条件挂载）
  useEffect(() => {
    if (!tenantId) return
    trackEvent('billing_invoice_tab_view', {
      invoiceable_order_count_band: countBand(invoiceable.length),
      has_invoice_title: hasInvoiceTitle,
    })
    // 只在挂载（即切到发票 tab）那一刻上报一次，数据轮询变化不重复触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  // 开票成功后按 'invoice' 前缀整体失效：可开票充值单 + 开票记录列表 + 抬头一起刷新。
  // 之前只失效了 recharges，名字叫 refreshRecords 却刷不到记录列表（需求方 shared#327）。
  const refreshRecords = () => {
    qc.invalidateQueries({ queryKey: ['invoice'] })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-mg-text-3">
          可开票充值单 <strong className="text-mg-text-1">{invoiceable.length}</strong> 笔 · 合计{' '}
          <strong className="text-mg-text-1">{currencySymbol}{invoiceableAmount}</strong>
        </span>
        <div className="flex items-center gap-2">
          {canManageTitles && (
            <Button variant="outline" size="sm" onClick={() => setTitlesOpen(true)}>
              发票抬头
            </Button>
          )}
          {canApplyInvoice && (
            <Button
              variant="brand"
              size="sm"
              disabled={invoiceable.length === 0}
              title={invoiceable.length === 0 ? '暂无可开票的充值单，新充值到账后即可申请' : '勾选充值单合并开票'}
              onClick={() => {
                trackEvent('billing_invoice_apply_open', {
                  invoiceable_order_count_band: countBand(invoiceable.length),
                  has_invoice_title: hasInvoiceTitle,
                })
                setApplyOpen(true)
              }}
            >
              申请开票
            </Button>
          )}
        </div>
      </div>

      <InvoiceRecordsTab tenantId={tenantId} currencySymbol={currencySymbol} />

      {canApplyInvoice && <ApplyInvoiceModal
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        tenantId={tenantId}
        currencySymbol={currencySymbol}
        onInvoiced={refreshRecords}
        onGoTitles={() => setTitlesOpen(true)}
      />}
      {canManageTitles && <InvoiceTitleModal open={titlesOpen} onClose={() => setTitlesOpen(false)} tenantId={tenantId} />}
    </div>
  )
}
