/**
 * 申请开票页（FR-B1 / FR-B2 合并开票）
 * 勾选「可开票」充值 → 选抬头 + 票种 → 合并开一张票。
 */
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import { cn } from '@/lib/utils'
import { appToast } from '@/lib/app-toast'
import {
  listInvoiceableRecharges,
  listInvoiceTitles,
  createInvoice,
} from '@/services/invoice'
import type { InvoiceTitleType } from '@/types'

const TITLE_TYPE_LABEL: Record<InvoiceTitleType, string> = {
  vat_normal: '增值税普票',
  vat_special: '增值税专票',
  overseas: '国外 Invoice',
}

export function ApplyInvoiceTab({
  tenantId,
  currencySymbol,
  onInvoiced,
}: {
  tenantId: string
  currencySymbol: string
  onInvoiced: () => void
}) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<string[]>([])
  const [titleId, setTitleId] = useState('')
  const [titleType, setTitleType] = useState<InvoiceTitleType>('vat_normal')

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
  const recharges = rechargeData?.items ?? []
  const titles = titleData?.items ?? []

  const selectedTotal = useMemo(
    () =>
      recharges
        .filter((r) => selected.includes(r.recharge_id))
        .reduce((sum, r) => sum + Number(r.amount), 0),
    [recharges, selected]
  )

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const submit = useMutation({
    mutationFn: () =>
      createInvoice(tenantId, { recharge_ids: selected, title_id: titleId, title_type: titleType }),
    onSuccess: () => {
      appToast.success('已提交开票，状态为「开票中」')
      qc.invalidateQueries({ queryKey: ['invoice'] })
      setSelected([])
      onInvoiced()
    },
    onError: () => appToast.error('开票提交失败，请重试'),
  })

  const handleSubmit = () => {
    if (!selected.length) return appToast.warning('请至少勾选一笔充值')
    if (!titleId) return appToast.warning('请选择发票抬头')
    submit.mutate()
  }

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-mg-text-2">
        国内开具增值税发票（普票/专票）。平台统一承担增值税，所有充值可开票；勾选充值 →「合并开票」选择抬头与票种出票。
      </p>

      <div className="rounded-xl border border-mg-border p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-mg-text-0">
          <span className="text-brand-base">₣</span> 充值 · 申请开票
        </div>

        <div className="grid grid-cols-[24px_1fr_auto_88px] items-center gap-x-3 px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-mg-text-2">
          <span />
          <span>充值单号</span>
          <span className="text-right">金额</span>
          <span className="text-right">开票状态</span>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-mg-text-2">加载中…</div>
        ) : (
          recharges.map((r) => {
            const billable = r.invoice_status === 'billable'
            return (
              <label
                key={r.recharge_id}
                className={cn(
                  'grid grid-cols-[24px_1fr_auto_88px] items-center gap-x-3 border-t border-mg-border px-1 py-3 text-sm',
                  billable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                )}
              >
                <input
                  type="checkbox"
                  disabled={!billable}
                  checked={selected.includes(r.recharge_id)}
                  onChange={() => billable && toggle(r.recharge_id)}
                  className="h-4 w-4 rounded border-mg-border accent-brand-base"
                />
                <span className="font-medium text-mg-text-0">{r.order_no}</span>
                <span className="text-right font-bold tabular-nums text-mg-text-0">
                  {currencySymbol}
                  {r.amount}
                </span>
                <span className="text-right text-xs">
                  {billable ? (
                    <span className="font-semibold text-brand-base">可开票</span>
                  ) : (
                    <span className="rounded-full bg-mg-success/10 px-2 py-0.5 text-[11px] font-semibold text-mg-success">
                      已开票 · {r.invoice_no}
                    </span>
                  )}
                </span>
              </label>
            )
          })
        )}
      </div>

      {/* 合并开票操作栏 */}
      {selected.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-brand-base/30 bg-brand-base/[0.03] p-4">
          <div className="text-sm">
            <span className="text-mg-text-2">已选 </span>
            <span className="font-bold text-mg-text-0">{selected.length}</span>
            <span className="text-mg-text-2"> 笔 · 合计 </span>
            <span className="font-bold tabular-nums text-brand-base">
              {currencySymbol}
              {selectedTotal.toFixed(2)}
            </span>
          </div>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <Select
              value={titleId}
              onChange={(v) => {
                setTitleId(v)
                const t = titles.find((x) => x.id === v)
                if (t) setTitleType(t.type)
              }}
              className="min-w-[180px]"
              placeholder="选择发票抬头"
            >
              {titles.map((t) => (
                <Select.Option key={t.id} value={t.id}>
                  {t.company_name}
                </Select.Option>
              ))}
            </Select>
            <Select value={titleType} onChange={(v) => setTitleType(v as InvoiceTitleType)} className="min-w-[130px]">
              <Select.Option value="vat_normal">{TITLE_TYPE_LABEL.vat_normal}</Select.Option>
              <Select.Option value="vat_special">{TITLE_TYPE_LABEL.vat_special}</Select.Option>
            </Select>
            <Button variant="brand" size="sm" loading={submit.isPending} onClick={handleSubmit}>
              合并开票
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
