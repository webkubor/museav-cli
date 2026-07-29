/**
 * 申请开票（PRD 1.0.4 §8.7.2，单页流程）
 * 勾选可开票充值单（全选/单选）→ 选发票抬头 → 提交申请；无抬头时按钮置灰并引导去新增。
 */
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import { cn } from '@/lib/utils'
import { appToast } from '@/lib/app-toast'
import { trackEvent } from '@/lib/track'
import {
  listInvoiceableRecharges,
  listInvoiceTitles,
  createInvoice,
} from '@/services/invoice'
import type { InvoiceTitleType, RechargeInvoiceStatus } from '@/types'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { amountBand, countBand } from '../billing-tracking'

const TITLE_TYPE_LABEL: Record<InvoiceTitleType, string> = {
  vat_normal: '增值税普票',
  vat_special: '增值税专票',
  overseas: '国外 Invoice',
}

const RECHARGE_INVOICE_STATUS: Record<RechargeInvoiceStatus, { label: string; cls: string }> = {
  billable: { label: '可开票', cls: 'bg-brand-base/10 text-brand-base' },
  pending: { label: '待开票', cls: 'bg-mg-fill-0 text-mg-text-2' },
  invoicing: { label: '开票中', cls: 'bg-mg-warning/10 text-mg-warning' },
  invoiced: { label: '已开票', cls: 'bg-mg-success/10 text-mg-success' },
  failed: { label: '开票失败', cls: 'bg-mg-danger/10 text-mg-danger' },
  voided: { label: '已作废', cls: 'bg-mg-fill-0 text-mg-text-3' },
}

export function ApplyInvoiceTab({
  tenantId,
  currencySymbol,
  onInvoiced,
  onGoTitles,
}: {
  tenantId: string
  currencySymbol: string
  onInvoiced: () => void
  onGoTitles: () => void
}) {
  const qc = useQueryClient()
  const { hasPermission } = usePermissions()
  const canApplyInvoice = hasPermission(PERMS.BILLING_INVOICE_APPLY)
  const [selected, setSelected] = useState<string[]>([])
  const [titleId, setTitleId] = useState('')

  const { data: rechargeData, isLoading } = useQuery({
    queryKey: ['invoice', 'recharges', tenantId],
    queryFn: () => listInvoiceableRecharges(tenantId),
    enabled: Boolean(tenantId),
  })
  const { data: titleData } = useQuery({
    queryKey: ['invoice', 'titles', tenantId],
    queryFn: () => listInvoiceTitles(tenantId),
    enabled: Boolean(tenantId),
  })

  const recharges = useMemo(() => rechargeData?.items ?? [], [rechargeData])
  const titles = useMemo(() => titleData?.items ?? [], [titleData])

  const allBillableIds = useMemo(
    () => recharges.filter((r) => r.invoice_status === 'billable').map((r) => r.recharge_id),
    [recharges]
  )
  const isAllSelected = useMemo(
    () => allBillableIds.length > 0 && allBillableIds.every((id) => selected.includes(id)),
    [allBillableIds, selected]
  )
  const selectedRecharges = useMemo(
    () => recharges.filter((r) => selected.includes(r.recharge_id)),
    [recharges, selected]
  )
  const selectedTotal = useMemo(
    () => selectedRecharges.reduce((sum, r) => sum + Number(r.amount), 0),
    [selectedRecharges]
  )
  const activeTitle = useMemo(() => titles.find((t) => t.id === titleId), [titles, titleId])

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelected((prev) => Array.from(new Set([...prev, ...allBillableIds])))
    else setSelected((prev) => prev.filter((id) => !allBillableIds.includes(id)))
  }

  const submit = useMutation({
    mutationFn: () =>
      createInvoice(tenantId, {
        recharge_ids: selected,
        title_id: titleId,
        title_type: activeTitle?.type ?? 'vat_normal',
      }),
    onSuccess: () => {
      appToast.success('已提交开票申请，系统正在自动开票')
      // §11.2 billing_invoice_apply_submit
      trackEvent('billing_invoice_apply_submit', {
        order_count_band: countBand(selected.length),
        amount_band: amountBand(selectedTotal),
        invoice_title_kind: activeTitle?.type ?? 'unknown',
        result: 'success',
      })
      qc.invalidateQueries({ queryKey: ['invoice'] })
      setSelected([])
      onInvoiced()
    },
    onError: () => {
      appToast.error('开票提交失败，请重试')
      trackEvent('billing_invoice_apply_submit', {
        order_count_band: countBand(selected.length),
        amount_band: amountBand(selectedTotal),
        invoice_title_kind: activeTitle?.type ?? 'unknown',
        result: 'fail',
      })
    },
  })

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-xs font-semibold text-mg-text-2">
          选择充值单（勾选后合并开具一张发票）
        </div>
        <div className="rounded-md border border-mg-border overflow-hidden">
          <label className="flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-mg-text-2 bg-mg-fill-0/30 border-b border-mg-border cursor-pointer">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={(e) => handleSelectAll(e.target.checked)}
              className="h-4 w-4 rounded-sm border-mg-border accent-brand-base cursor-pointer"
              disabled={allBillableIds.length === 0}
            />
            <span>全选</span>
            <span className="text-mg-text-3">已选 {selected.length}/{allBillableIds.length} 笔</span>
            <span className="ml-auto font-bold text-mg-text-1 tabular-nums">
              {currencySymbol}{selectedTotal.toFixed(2)}
            </span>
          </label>
          <div className="divide-y divide-mg-border">
            {isLoading ? (
              <div className="py-8 text-center text-sm text-mg-text-3">加载中…</div>
            ) : recharges.length === 0 ? (
              <div className="py-8 text-center text-sm text-mg-text-3">暂无可开票充值</div>
            ) : (
              recharges.map((r) => {
                const billable = r.invoice_status === 'billable'
                const status = RECHARGE_INVOICE_STATUS[r.invoice_status]
                const statusText = billable || !r.invoice_no ? status.label : `${status.label} · ${r.invoice_no}`
                return (
                  <label
                    key={r.recharge_id}
                    className={cn(
                      'flex items-center gap-3 px-4 py-2.5 text-sm transition-opacity duration-150',
                      billable ? 'cursor-pointer hover:bg-mg-fill-0/20' : 'cursor-not-allowed opacity-60'
                    )}
                  >
                    <input
                      type="checkbox"
                      disabled={!billable}
                      checked={selected.includes(r.recharge_id)}
                      onChange={() => billable && toggle(r.recharge_id)}
                      className="h-4 w-4 rounded-sm border-mg-border accent-brand-base cursor-pointer"
                    />
                    <span className="font-medium text-mg-text-1 font-mono truncate">{r.order_no}</span>
                    <span className="ml-auto shrink-0 font-bold tabular-nums text-mg-text-1">
                      {currencySymbol}{r.amount}
                    </span>
                    <span
                      className={cn('shrink-0 max-w-[120px] truncate rounded-full px-2 py-0.5 text-xs font-semibold', status.cls)}
                      title={statusText}
                    >
                      {statusText}
                    </span>
                  </label>
                )
              })
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold text-mg-text-2">发票抬头</div>
        {titles.length === 0 ? (
          <p className="text-xs text-mg-text-3">
            还没有发票抬头，请先新增抬头后再申请开票。{' '}
            <button type="button" onClick={onGoTitles} className="font-semibold text-brand-base hover:text-brand-mid">
              去新增抬头
            </button>
          </p>
        ) : (
          <Select value={titleId} onChange={setTitleId} className="w-full" placeholder="选择发票抬头">
            {titles.map((t) => (
              <Select.Option key={t.id} value={t.id}>
                {t.company_name}（{TITLE_TYPE_LABEL[t.type]}）
              </Select.Option>
            ))}
          </Select>
        )}
      </div>

      {canApplyInvoice && (
        <Button
          variant="brand"
          className="w-full"
          disabled={selected.length === 0 || titles.length === 0}
          loading={submit.isPending}
          onClick={() => {
            if (!titleId) return appToast.warning('请选择发票抬头')
            submit.mutate()
          }}
        >
          提交申请（{currencySymbol}{selectedTotal.toFixed(2)}）
        </Button>
      )}
    </div>
  )
}
