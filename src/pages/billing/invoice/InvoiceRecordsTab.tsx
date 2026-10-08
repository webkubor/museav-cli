/**
 * 发票记录页（FR-B1）
 * 状态筛选 + 发票号/抬头搜索 + 列表（下载）+ 加载更多。客户端无红冲/开票执行入口（D-INV15）。
 */
import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { LuDownload, LuCircleAlert } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/Table'
import { appToast } from '@/lib/app-toast'
import { listInvoiceRecords, getInvoiceDownloadUrl } from '@/services/invoice'
import type { InvoiceRecord, InvoiceTitleType } from '@/types'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { trackEvent } from '@/lib/track'
import { formatDateTimeWithSeconds } from '@/lib/format-date'

const STATUS_CLASS: Record<InvoiceRecord['status'], string> = {
  pending: 'bg-mg-fill-0 text-mg-text-2',
  invoicing: 'bg-mg-warning/10 text-mg-warning',
  invoiced: 'bg-mg-success/10 text-mg-success',
  failed: 'bg-mg-danger/10 text-mg-danger',
  voided: 'bg-mg-fill-0 text-mg-text-3',
}

// #1192：原型只要求「全部状态 / 开票中 / 已开票」三档；其他状态（待开票/失败/已作废）仍会在记录列表里展示（见下方 status badge），只是不进筛选选项。
const STATUS_FILTERS: Array<'all' | InvoiceRecord['status']> = ['all', 'invoicing', 'invoiced']

export function InvoiceRecordsTab({
  tenantId,
  currencySymbol,
}: {
  tenantId: string
  currencySymbol: string
}) {
  const { t } = useTranslation('billing')
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
      if (res.isError) appToast.error(t('billing.invoice.loadMoreFailed'))
    })
  }

  const download = async (invoiceNo: string, invoiceStatus: InvoiceRecord['status']) => {
    try {
      const { url } = await getInvoiceDownloadUrl(tenantId, invoiceNo)
      window.open(url, '_blank')
      trackEvent('billing_invoice_download_click', { invoice_status: invoiceStatus, result: 'success' })
    } catch {
      appToast.error(t('billing.invoice.downloadFailed'))
      trackEvent('billing_invoice_download_click', { invoice_status: invoiceStatus, result: 'fail' })
    }
  }

  return (
    <div className="space-y-3">
      {/* 筛选栏 */}
      <div className="flex gap-2">
        <Select value={status} onChange={setStatus} className="w-[130px]" placeholder={t('billing.invoice.statusAll')}>
          {STATUS_FILTERS.map((option) => (
            <Select.Option key={option} value={option}>
              {option === 'all' ? t('billing.invoice.statusAll') : t(`billing.invoice.status.${option}`)}
            </Select.Option>
          ))}
        </Select>
        <Input
          variant="search"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={t('billing.invoice.searchPlaceholder')}
          className="flex-1"
        />
      </div>

      {/* 列表 */}
      {isLoading && records.length === 0 ? (
        <EmptyState title={t('billing.invoice.loading')} />
      ) : isError && records.length === 0 ? (
        // 首屏加载失败 ≠ 暂无记录：给明确失败提示+重试，不误导成空态（#25）
        <EmptyState
          title={t('billing.invoice.recordsLoadFailed')}
          action={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              {t('billing.income.retry')}
            </Button>
          }
        />
      ) : records.length === 0 ? (
        <EmptyState
          title={status !== 'all' || keyword ? t('billing.invoice.emptyFiltered') : t('billing.invoice.emptyRecords')}
          description={status !== 'all' || keyword ? undefined : t('billing.invoice.emptyRecordsDesc')}
          action={status !== 'all' || keyword ? (
            <Button variant="outline" size="sm" onClick={() => { setStatus('all'); setKeyword('') }}>
              {t('billing.income.clearFilters')}
            </Button>
          ) : undefined}
        />
      ) : (
        // #1192：原型要求七列表格（App.tsx:15983-15993）：申请时间/发票号/发票抬头/金额/充值单/状态/操作，不再用卡片。
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('billing.invoice.cols.applyTime')}</TableHead>
                <TableHead>{t('billing.invoice.cols.invoiceNo')}</TableHead>
                <TableHead>{t('billing.invoice.cols.title')}</TableHead>
                <TableHead>{t('billing.invoice.cols.amount')}</TableHead>
                <TableHead>{t('billing.invoice.cols.recharge')}</TableHead>
                <TableHead>{t('billing.invoice.cols.status')}</TableHead>
                <TableHead>{t('billing.invoice.cols.action')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r) => (
                <TableRow key={r.invoice_no}>
                  <TableCell className="text-xs text-mg-text-3 whitespace-nowrap">
                    {formatDateTimeWithSeconds(r.created_at)}
                  </TableCell>
                  <TableCell className="text-xs text-mg-text-2">
                    <div className="flex flex-col">
                      <span className="font-mono">{r.invoice_no}</span>
                      {r.tax_serial && (
                        <span className="text-mg-text-3">{t('billing.invoice.taxSerial', { serial: r.tax_serial })}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-mg-text-1">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-semibold">{r.company_name}</span>
                      <span className="rounded-md bg-mg-fill-0 px-2 py-0.5 text-xs text-mg-text-2">
                        {t(`billing.invoice.titleType.${r.title_type as InvoiceTitleType}`)}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="text-xs font-semibold text-mg-text-1 whitespace-nowrap">
                    {currencySymbol}{r.total_amount}
                  </TableCell>
                  <TableCell className="text-xs text-mg-text-2 whitespace-nowrap">
                    {t('billing.invoice.rechargeCount', { count: r.recharge_count })}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[r.status]}`}
                        title={r.status === 'failed' && r.error_msg ? r.error_msg : undefined}
                      >
                        {t(`billing.invoice.status.${r.status}`)}
                      </span>
                      {r.status === 'failed' && r.error_msg && (
                        <LuCircleAlert size={13} className="text-mg-danger shrink-0" aria-label={r.error_msg} />
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r.status === 'invoiced' && canDownload ? (
                      <Button variant="outline" size="sm" onClick={() => download(r.invoice_no, r.status)}>
                        <LuDownload size={13} className="mr-1" /> {t('billing.invoice.download')}
                      </Button>
                    ) : (
                      <span className="text-mg-text-3">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {hasNextPage && (
        <button
          type="button"
          onClick={loadMore}
          disabled={isFetchingNextPage}
          className="w-full rounded-md border border-mg-border py-2.5 text-sm font-semibold text-mg-text-2 transition-colors hover:bg-mg-fill-0 disabled:opacity-60"
        >
          {isFetchingNextPage ? t('billing.invoice.loading') : t('billing.orders.loadMore')}
        </button>
      )}

      {/* qa#281：内部单号（D-INV15）不应出现在用户可见文案里，只留说明本身 */}
      <p className="pt-1 text-xs leading-relaxed text-mg-text-3">
        {t('billing.invoice.redInvoiceHint')}
      </p>
    </div>
  )
}
