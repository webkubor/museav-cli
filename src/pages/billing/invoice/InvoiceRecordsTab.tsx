/**
 * 发票记录页（FR-B1）
 * 状态筛选 + 发票号/抬头搜索 + 列表（下载）+ 加载更多。客户端无红冲/开票执行入口（D-INV15）。
 */
import { useEffect, useState } from 'react'
import { LuDownload, LuCircleAlert } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { listInvoiceRecords, getInvoiceDownloadUrl } from '@/services/invoice'
import type { InvoiceRecord, InvoiceTitleType } from '@/types'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { trackEvent } from '@/lib/track'

const STATUS_MAP: Record<InvoiceRecord['status'], { label: string; cls: string }> = {
  pending: { label: '待开票', cls: 'bg-mg-fill-0 text-mg-text-2' },
  invoicing: { label: '开票中', cls: 'bg-mg-warning/10 text-mg-warning' },
  invoiced: { label: '已开票', cls: 'bg-mg-success/10 text-mg-success' },
  failed: { label: '开票失败', cls: 'bg-mg-danger/10 text-mg-danger' },
  voided: { label: '已作废', cls: 'bg-mg-fill-0 text-mg-text-3' },
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
  const { hasPermission } = usePermissions()
  const canDownload = hasPermission(PERMS.BILLING_INVOICE_DOWNLOAD)
  const [status, setStatus] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [records, setRecords] = useState<InvoiceRecord[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true
    // 筛选条件变化触发重新拉取（外部数据同步），loading 起点需与请求同步置位
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const download = async (invoiceNo: string, invoiceStatus: InvoiceRecord['status']) => {
    try {
      const { url } = await getInvoiceDownloadUrl(tenantId, invoiceNo)
      window.open(url, '_blank')
      trackEvent('billing_invoice_download_click', { invoice_status: invoiceStatus, result: 'success' })
    } catch {
      trackEvent('billing_invoice_download_click', { invoice_status: invoiceStatus, result: 'fail' })
    }
  }

  return (
    <div className="space-y-3">
      {/* 筛选栏 */}
      <div className="flex gap-2">
        <Select value={status} onChange={setStatus} className="w-[130px]" placeholder="全部状态">
          <Select.Option value="all">全部状态</Select.Option>
          <Select.Option value="pending">待开票</Select.Option>
          <Select.Option value="invoicing">开票中</Select.Option>
          <Select.Option value="invoiced">已开票</Select.Option>
          <Select.Option value="failed">开票失败</Select.Option>
          <Select.Option value="voided">已作废</Select.Option>
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
        <EmptyState
          title={status !== 'all' || keyword ? '当前筛选条件下没有发票记录' : '暂无发票记录'}
          action={status !== 'all' || keyword ? (
            <Button variant="outline" size="sm" onClick={() => { setStatus('all'); setKeyword('') }}>
              清除筛选
            </Button>
          ) : undefined}
        />
      ) : (
        records.map((r) => {
          const st = STATUS_MAP[r.status]
          return (
            <div key={r.invoice_no} className="rounded-md border border-mg-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-mg-text-1">{r.invoice_no}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}>
                      {st.label}
                    </span>
                    <span className="rounded-md bg-mg-fill-0 px-2 py-0.5 text-xs text-mg-text-2">
                      {TITLE_TYPE_LABEL[r.title_type]}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-mg-text-3">
                    <span>{r.company_name}</span>
                    <span>
                      价税合计{' '}
                      <span className="font-semibold text-mg-text-2">
                        {currencySymbol}
                        {r.total_amount}
                      </span>
                    </span>
                    {r.tax_serial && <span>发票号 {r.tax_serial}</span>}
                  </div>
                  {r.status === 'failed' && r.error_msg && (
                    <div className="flex items-start gap-1 text-xs text-mg-danger">
                      <LuCircleAlert size={13} className="mt-0.5 shrink-0" />
                      <span>{r.error_msg}</span>
                    </div>
                  )}
                </div>
                <div className="shrink-0">
                  {r.status === 'invoiced' && canDownload && (
                    <Button variant="outline" size="sm" onClick={() => download(r.invoice_no, r.status)}>
                      <LuDownload size={13} className="mr-1" /> 下载
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
          className="w-full rounded-md border border-mg-border py-2.5 text-sm font-semibold text-mg-text-2 transition-colors hover:bg-mg-fill-0"
        >
          加载更多
        </button>
      )}

      <p className="pt-1 text-xs leading-relaxed text-mg-text-3">
        红冲为不可逆财税操作，仅运营端可发起；如需作废重开，请联系客服 / 由运营处理（D-INV15）。
      </p>
    </div>
  )
}
