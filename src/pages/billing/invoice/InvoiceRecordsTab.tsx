/**
 * 发票记录页（FR-B1）
 * 状态筛选 + 发票号/抬头搜索 + 列表（下载/重新开具）+ 加载更多。客户端无红冲入口（D-INV15）。
 */
import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { LuDownload } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { appToast } from '@/lib/app-toast'
import { listInvoiceRecords, retryInvoice, getInvoiceDownloadUrl } from '@/services/invoice'
import type { InvoiceRecord, InvoiceStatus, InvoiceTitleType } from '@/types'

const STATUS_MAP: Record<InvoiceStatus, { label: string; cls: string }> = {
  invoiced: { label: '已开票', cls: 'bg-mg-success/10 text-mg-success' },
  failed: { label: '开票失败', cls: 'bg-mg-danger/10 text-mg-danger' },
  voided: { label: '已红冲', cls: 'bg-mg-fill-1 text-mg-text-2' },
  invoicing: { label: '开票中', cls: 'bg-mg-warning/10 text-mg-warning' },
}
const TITLE_TYPE_LABEL: Record<InvoiceTitleType, string> = {
  vat_normal: '增值税普票',
  vat_special: '增值税专票',
  overseas: '国外 Invoice',
}

export function InvoiceRecordsTab({
  tenantId,
  currencySymbol,
}: {
  tenantId: string
  currencySymbol: string
}) {
  const [status, setStatus] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [records, setRecords] = useState<InvoiceRecord[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    listInvoiceRecords(tenantId, { status: status === 'all' ? undefined : status, keyword: keyword || undefined })
      .then((res) => {
        if (!alive) return
        setRecords(res.items)
        setHasMore(res.has_more)
      })
      .catch(() => {
        if (alive) {
          setRecords([])
          setHasMore(false)
        }
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [tenantId, status, keyword])

  const loadMore = () => {
    listInvoiceRecords(tenantId, { status: status === 'all' ? undefined : status, keyword: keyword || undefined, cursor: 'next' })
      .then((res) => {
        setRecords((prev) => [...prev, ...res.items])
        setHasMore(res.has_more)
      })
      .catch(() => setHasMore(false))
  }

  const retry = useMutation({
    mutationFn: (invoiceNo: string) => retryInvoice(tenantId, invoiceNo),
    onSuccess: () => appToast.success('已重新提交开票'),
    onError: () => appToast.error('重试失败，请稍后再试'),
  })

  const download = async (invoiceNo: string) => {
    const { url } = await getInvoiceDownloadUrl(tenantId, invoiceNo)
    window.open(url, '_blank')
  }

  return (
    <div className="space-y-3">
      {/* 筛选栏 */}
      <div className="flex gap-2">
        <Select value={status} onChange={setStatus} className="w-[130px]" placeholder="全部状态">
          <Select.Option value="all">全部状态</Select.Option>
          <Select.Option value="invoiced">已开票</Select.Option>
          <Select.Option value="invoicing">开票中</Select.Option>
          <Select.Option value="failed">开票失败</Select.Option>
          <Select.Option value="voided">已红冲</Select.Option>
        </Select>
        <Input
          variant="search"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索发票号 / 抬头"
          className="flex-1"
        />
      </div>

      {/* 列表 */}
      {loading && records.length === 0 ? (
        <EmptyState title="加载中…" />
      ) : records.length === 0 ? (
        <EmptyState title="暂无发票记录" />
      ) : (
        records.map((r) => {
          const st = STATUS_MAP[r.status]
          return (
            <div key={r.invoice_no} className="rounded-xl border border-mg-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-mg-text-0">{r.invoice_no}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>
                      {st.label}
                    </span>
                    <span className="rounded-md bg-mg-fill-0 px-2 py-0.5 text-[11px] text-mg-text-1">
                      {TITLE_TYPE_LABEL[r.title_type]}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-mg-text-2">
                    <span>{r.company_name}</span>
                    <span>
                      价税合计{' '}
                      <span className="font-semibold text-mg-text-1">
                        {currencySymbol}
                        {r.total_amount}
                      </span>
                    </span>
                    {r.tax_serial && <span>发票号 {r.tax_serial}</span>}
                  </div>
                  {r.status === 'failed' && r.error_msg && (
                    <p className="text-xs text-mg-danger">{r.error_msg}</p>
                  )}
                  {r.status === 'voided' && (
                    <p className="text-xs text-mg-text-2">
                      该票已由运营红冲；如需重开请在「申请开票」重新发起。
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  {r.status === 'invoiced' && (
                    <Button variant="outline" size="sm" onClick={() => download(r.invoice_no)}>
                      <LuDownload size={13} className="mr-1" /> 下载
                    </Button>
                  )}
                  {r.status === 'failed' && (
                    <Button
                      variant="outline"
                      size="sm"
                      loading={retry.isPending && retry.variables === r.invoice_no}
                      onClick={() => retry.mutate(r.invoice_no)}
                    >
                      重新开具
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )
        })
      )}

      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          className="w-full rounded-xl border border-mg-border py-2.5 text-sm font-semibold text-mg-text-1 transition-colors hover:bg-mg-fill-0"
        >
          加载更多
        </button>
      )}

      <p className="pt-1 text-[11px] leading-relaxed text-mg-text-3">
        红冲为不可逆财税操作，仅运营端可发起；如需作废重开，请联系客服 / 由运营处理（D-INV15）。
      </p>
    </div>
  )
}
