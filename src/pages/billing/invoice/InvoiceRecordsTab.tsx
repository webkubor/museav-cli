/**
 * 发票记录页（FR-B1）
 * 状态筛选 + 发票号/抬头搜索 + 列表（下载）+ 加载更多。客户端无红冲/开票执行入口（D-INV15）。
 */
import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { LuDownload, LuCircleAlert } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { appToast } from '@/lib/app-toast'
import { listInvoiceRecords, getInvoiceDownloadUrl } from '@/services/invoice'
import type { InvoiceRecord, InvoiceTitleType } from '@/types'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { trackEvent } from '@/lib/track'
import { formatDateTimeWithSeconds } from '@/lib/format-date'

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

  // 走 react-query（key 前缀 'invoice'）而非自管 useState+useEffect：申请开票成功后
  // ApplyInvoiceTab 的 invalidateQueries({ queryKey: ['invoice'] }) 才能按前缀命中这里，
  // 列表自动刷新。此前这里是缓存外的孤岛，那次失效打不到，新发票要手动刷浏览器才出现
  // （需求方 shared#327）。
  const {
    data,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['invoice', 'records', tenantId, status, keyword],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listInvoiceRecords(tenantId, {
        status: status === 'all' ? undefined : status,
        keyword: keyword || undefined,
        cursor: pageParam,
      }),
    // 游标沿用原有约定：首页不带 cursor，后续页固定传 'next'。这是占位值——后端
    // GET /tenants/{id}/invoices 响应目前只回 items/has_more/total，不回真实游标，
    // 记录数超过一页时翻页结果不可靠。等 shared#349 后端补 next_cursor 后换成真实游标。
    getNextPageParam: (lastPage) => (lastPage.has_more ? 'next' : undefined),
    enabled: Boolean(tenantId),
  })

  const records: InvoiceRecord[] = data?.pages.flatMap((p) => p.items) ?? []

  const loadMore = () => {
    void fetchNextPage().then((res) => {
      if (res.isError) appToast.error('加载更多失败，请重试')
    })
  }

  const download = async (invoiceNo: string, invoiceStatus: InvoiceRecord['status']) => {
    try {
      const { url } = await getInvoiceDownloadUrl(tenantId, invoiceNo)
      window.open(url, '_blank')
      trackEvent('billing_invoice_download_click', { invoice_status: invoiceStatus, result: 'success' })
    } catch {
      appToast.error('下载失败，请重试')
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
      {isLoading && records.length === 0 ? (
        <EmptyState title="加载中…" />
      ) : isError && records.length === 0 ? (
        // 首屏加载失败 ≠ 暂无记录：给明确失败提示+重试，不误导成空态（#25）
        <EmptyState
          title="开票记录加载失败"
          action={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              重试
            </Button>
          }
        />
      ) : records.length === 0 ? (
        <EmptyState
          title={status !== 'all' || keyword ? '当前筛选条件下没有发票记录' : '暂无开票记录'}
          description={status !== 'all' || keyword ? undefined : '累计充值均可开具增值税发票。'}
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
                    <span>{formatDateTimeWithSeconds(r.created_at)}</span>
                    <span>{r.company_name}</span>
                    <span>
                      价税合计{' '}
                      <span className="font-semibold text-mg-text-2">
                        {currencySymbol}
                        {r.total_amount}
                      </span>
                    </span>
                    <span>充值单 {r.recharge_count}</span>
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

      {hasNextPage && (
        <button
          type="button"
          onClick={loadMore}
          disabled={isFetchingNextPage}
          className="w-full rounded-md border border-mg-border py-2.5 text-sm font-semibold text-mg-text-2 transition-colors hover:bg-mg-fill-0 disabled:opacity-60"
        >
          加载更多
        </button>
      )}

      {/* qa#281：内部单号（D-INV15）不应出现在用户可见文案里，只留说明本身 */}
      <p className="pt-1 text-xs leading-relaxed text-mg-text-3">
        红冲为不可逆财税操作，仅运营端可发起；如需作废重开，请联系客服 / 由运营处理。
      </p>
    </div>
  )
}
