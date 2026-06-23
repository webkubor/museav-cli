/**
 * 申请开票页（FR-B1 / FR-B2 合并开票）
 * 两步流程：① 勾选可开票充值 → 右上角「合并开票(N笔·¥X)」② 确认页（汇总+包含充值单+选抬头+出票提示+提交）。
 */
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LuArrowLeft, LuPlus } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import { cn } from '@/lib/utils'
import { appToast } from '@/lib/app-toast'
import {
  listInvoiceableRecharges,
  listInvoiceTitles,
  createInvoice,
} from '@/services/invoice'
import type { InvoiceTitleType, RechargeInvoiceStatus } from '@/types'

const TITLE_TYPE_LABEL: Record<InvoiceTitleType, string> = {
  vat_normal: '增值税普票',
  vat_special: '增值税专票',
  overseas: '国外 Invoice',
}

const RECHARGE_INVOICE_STATUS: Record<RechargeInvoiceStatus, { label: string; cls: string }> = {
  billable: { label: '可开票', cls: 'bg-brand-base/10 text-brand-base' },
  pending: { label: '待开票', cls: 'bg-mg-fill-0 text-mg-text-1' },
  invoicing: { label: '开票中', cls: 'bg-mg-warning/10 text-mg-warning' },
  invoiced: { label: '已开票', cls: 'bg-mg-success/10 text-mg-success' },
  failed: { label: '开票失败', cls: 'bg-mg-danger/10 text-mg-danger' },
  voided: { label: '已作废', cls: 'bg-mg-fill-0 text-mg-text-2' },
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
  const [view, setView] = useState<'list' | 'confirm'>('list')
  const [selected, setSelected] = useState<string[]>([])
  const [titleId, setTitleId] = useState('')
  const [expandRecharges, setExpandRecharges] = useState(false)

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

  const goConfirm = () => {
    // 进确认页默认带出默认抬头
    if (!titleId) setTitleId(titles.find((t) => t.is_default)?.id ?? titles[0]?.id ?? '')
    setView('confirm')
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
      qc.invalidateQueries({ queryKey: ['invoice'] })
      setSelected([])
      setView('list')
      onInvoiced()
    },
    onError: () => appToast.error('开票提交失败，请重试'),
  })

  // ─── 确认页 ───────────────────────────────────────
  if (view === 'confirm') {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setView('list')}
          className="flex items-center gap-1 text-sm text-mg-text-2 transition-colors hover:text-mg-text-0"
        >
          <LuArrowLeft size={15} /> 返回
        </button>

        {/* 合并汇总 */}
        <div className="flex items-center justify-between rounded-md bg-mg-fill-0 px-4 py-3">
          <div className="space-y-1 text-xs text-mg-text-2">
            <div>合并笔数</div>
            <div>价税合计</div>
          </div>
          <div className="space-y-1 text-right">
            <div className="text-sm font-semibold text-mg-text-0">{selected.length} 笔</div>
            <div className="text-lg font-bold tabular-nums text-mg-text-0">
              {currencySymbol}
              {selectedTotal.toFixed(2)}
            </div>
          </div>
        </div>

        {/* 包含充值单 */}
        <div className="rounded-md border border-mg-border p-4 bg-mg-fill-0/10">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-mg-text-1">包含充值单（{selected.length}）</span>
            {selected.length > 3 && (
              <button
                type="button"
                onClick={() => setExpandRecharges(!expandRecharges)}
                className="text-xs font-semibold text-brand-base hover:text-brand-mid transition-colors"
              >
                {expandRecharges ? '收起' : `展开其余 ${selected.length - 3} 笔`}
              </button>
            )}
          </div>
          <div className="space-y-1">
            {selectedRecharges
              .slice(0, expandRecharges ? selectedRecharges.length : 3)
              .map((r) => (
                <div key={r.recharge_id} className="flex items-center justify-between py-1 text-sm">
                  <span className="text-mg-text-1 font-mono">{r.order_no}</span>
                  <span className="font-semibold tabular-nums text-mg-text-0">
                    {currencySymbol}
                    {r.amount}
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* 抬头选择 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-mg-text-1">发票抬头 / 票种</span>
            <button
              type="button"
              onClick={onGoTitles}
              className="flex items-center gap-1 text-xs font-semibold text-brand-base hover:text-brand-mid"
            >
              <LuPlus size={13} /> 新增抬头
            </button>
          </div>
          <Select value={titleId} onChange={setTitleId} className="w-full" placeholder="选择发票抬头">
            {titles.map((t) => (
              <Select.Option key={t.id} value={t.id}>
                {t.company_name}（{TITLE_TYPE_LABEL[t.type]}）
              </Select.Option>
            ))}
          </Select>
        </div>

        {/* 选中抬头详情 */}
        {activeTitle && (
          <div className="rounded-md border border-mg-border p-4 bg-mg-fill-0/30">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-mg-text-1 border-b border-mg-border pb-1.5 flex items-center justify-between">
              <span>抬头详细信息</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-mg-fill-0 text-mg-text-2">
                {TITLE_TYPE_LABEL[activeTitle.type]}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <div className="flex justify-between sm:justify-start gap-2 py-1 border-b border-mg-border/30 sm:border-none">
                <span className="text-mg-text-2 shrink-0">纳税人识别号:</span>
                <span className="font-medium text-mg-text-0 font-mono">{activeTitle.tax_id}</span>
              </div>
              {activeTitle.email && (
                <div className="flex justify-between sm:justify-start gap-2 py-1 border-b border-mg-border/30 sm:border-none">
                  <span className="text-mg-text-2 shrink-0">接收邮箱:</span>
                  <span className="font-medium text-mg-text-0">{activeTitle.email}</span>
                </div>
              )}
              {activeTitle.reg_address && (
                <div className="flex justify-between sm:justify-start gap-2 py-1 border-b border-mg-border/30 sm:border-none sm:col-span-2">
                  <span className="text-mg-text-2 shrink-0">注册地址:</span>
                  <span className="font-medium text-mg-text-0">{activeTitle.reg_address}</span>
                </div>
              )}
              {activeTitle.reg_phone && (
                <div className="flex justify-between sm:justify-start gap-2 py-1 border-b border-mg-border/30 sm:border-none">
                  <span className="text-mg-text-2 shrink-0">电话号码:</span>
                  <span className="font-medium text-mg-text-0">{activeTitle.reg_phone}</span>
                </div>
              )}
              {activeTitle.bank_name && (
                <div className="flex justify-between sm:justify-start gap-2 py-1 sm:border-none sm:col-span-2">
                  <span className="text-mg-text-2 shrink-0">开户银行及账号:</span>
                  <span className="font-medium text-mg-text-0">
                    {activeTitle.bank_name} <span className="font-mono">{activeTitle.bank_account}</span>
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-mg-text-3">
          提交后系统会自动发起 FAPI 开票任务，出票后推送至接收邮箱。
        </p>

        <Button
          variant="brand"
          className="w-full"
          loading={submit.isPending}
          onClick={() => {
            if (!titleId) return appToast.warning('请选择发票抬头')
            submit.mutate()
          }}
        >
          提交开票
        </Button>
      </div>
    )
  }

  // ─── 列表页 ───────────────────────────────────────
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelected((prev) => Array.from(new Set([...prev, ...allBillableIds])))
    } else {
      setSelected((prev) => prev.filter((id) => !allBillableIds.includes(id)))
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-mg-text-2">
        国内开具增值税发票（普票/专票）。平台统一承担增值税，所有充值可申请开票；勾选充值 →「合并开票」选择抬头与票种后提交申请。
      </p>

      <div className="rounded-md border border-mg-border bg-mg-card overflow-hidden relative">
        <div className="p-4 pb-3 flex items-center justify-between border-b border-mg-border">
          <div className="flex items-center gap-2 text-sm font-bold text-mg-text-0">
            <span className="text-brand-base">₣</span> 充值 · 申请开票
          </div>
        </div>

        <div className="grid grid-cols-[24px_1fr_auto_120px] items-center gap-x-3 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-mg-text-2 bg-mg-fill-0/30">
          <input
            type="checkbox"
            checked={isAllSelected}
            onChange={(e) => handleSelectAll(e.target.checked)}
            className="h-4 w-4 rounded-sm border-mg-border accent-brand-base cursor-pointer"
            disabled={allBillableIds.length === 0}
          />
          <span>充值单号</span>
          <span className="text-right">金额</span>
          <span className="text-right">开票状态</span>
        </div>

        <div className="divide-y divide-mg-border px-4">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-mg-text-2">加载中…</div>
          ) : recharges.length === 0 ? (
            <div className="py-8 text-center text-sm text-mg-text-2">暂无可开票充值</div>
          ) : (
            recharges.map((r) => {
              const billable = r.invoice_status === 'billable'
              const status = RECHARGE_INVOICE_STATUS[r.invoice_status]
              const statusText = billable || !r.invoice_no ? status.label : `${status.label} · ${r.invoice_no}`
              return (
                <label
                  key={r.recharge_id}
                  className={cn(
                    'grid grid-cols-[24px_1fr_auto_120px] items-center gap-x-3 py-3 text-sm transition-opacity duration-150',
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
                  <span className="font-medium text-mg-text-0 font-mono">{r.order_no}</span>
                  <span className="text-right font-bold tabular-nums text-mg-text-0">
                    {currencySymbol}
                    {r.amount}
                  </span>
                  <span className="min-w-0 text-right">
                    <span
                      className={cn(
                        'inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        status.cls
                      )}
                      title={statusText}
                    >
                      {statusText}
                    </span>
                  </span>
                </label>
              )
            })
          )}
        </div>

        {/* Sticky Action Footer */}
        {selected.length > 0 && (
          <div className="sticky bottom-0 left-0 right-0 border-t border-mg-border bg-mg-card/95 backdrop-blur-sm p-4 flex items-center justify-between z-10 shadow-lg shadow-black/5 animate-in slide-in-from-bottom-2 duration-200">
            <div className="text-xs text-mg-text-2">
              已选 <span className="font-bold text-brand-base">{selected.length}</span> 笔充值单，合计金额：
              <span className="text-sm font-bold text-mg-text-0 tabular-nums ml-1">
                {currencySymbol}
                {selectedTotal.toFixed(2)}
              </span>
            </div>
            <Button variant="brand" size="sm" onClick={goConfirm}>
              合并开票
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
