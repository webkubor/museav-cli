import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/Table'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import Select from '@/components/ui/Select'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/format-date'
import { useCursorPager } from '@/hooks/use-cursor-pager'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { listTransactions } from '@/services/billing'
import type { TransactionTransaction } from '@/types/generated-api-types'
import { BillingInvoiceTab } from './invoice/BillingInvoiceTab'

// 后端交易类型枚举（Swagger transaction.type）→ 中文标签
const TXN_TYPE_LABEL: Record<string, string> = {
  recharge: '充值',
  consume: '消费',
  refund: '退款',
  adjust_credit: '调增',
  adjust_debit: '调减',
  promo: '兑换',
}

const TYPE_FILTERS = [
  { value: 'all', label: '全部类型' },
  { value: 'recharge', label: '充值' },
  { value: 'consume', label: '消费' },
  { value: 'refund', label: '退款' },
  { value: 'promo', label: '兑换' },
  { value: 'adjust_credit', label: '调增' },
  { value: 'adjust_debit', label: '调减' },
]

// 对齐 PRD billingTxnTimeFilters；range() 惰性算，避免模块加载时固定“现在”
const TIME_FILTERS = [
  { value: 'all', label: '全部时间' },
  { value: 'last7d', label: '近7天' },
  { value: 'last30d', label: '近30天' },
  { value: 'thisMonth', label: '本月' },
  { value: 'lastMonth', label: '上月' },
] as const
type TimeFilterKey = (typeof TIME_FILTERS)[number]['value']

function timeRange(key: TimeFilterKey): { from?: string; to?: string } {
  const now = new Date()
  if (key === 'all') return {}
  if (key === 'last7d') {
    const from = new Date(now)
    from.setDate(from.getDate() - 7)
    return { from: from.toISOString(), to: now.toISOString() }
  }
  if (key === 'last30d') {
    const from = new Date(now)
    from.setDate(from.getDate() - 30)
    return { from: from.toISOString(), to: now.toISOString() }
  }
  if (key === 'thisMonth') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: from.toISOString(), to: now.toISOString() }
  }
  // lastMonth
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const to = new Date(now.getFullYear(), now.getMonth(), 1)
  return { from: from.toISOString(), to: to.toISOString() }
}

/** 账务对象：从 related 里取业务引用（充值单号 / 会话 / 模型 / 空间），回落到描述 */
function objectRef(txn: TransactionTransaction): string {
  const r = txn.related
  return r?.recharge_order_no || r?.billing_session_id || r?.model_id || r?.workspace_id || txn.description || '—'
}

/** 金额展示：优先带符号金额，判断正负着色 */
function amountText(txn: TransactionTransaction): { text: string; positive: boolean } {
  const a = txn.amount
  const signed = a?.signed_amount ?? a?.amount ?? '0'
  const positive = !String(signed).trim().startsWith('-')
  return { text: `${a?.currency ?? ''} ${signed}`.trim(), positive }
}

/**
 * 账单页统一账本（对齐 PRD BillingPage.billing-ledger-panel）：交易记录 / 发票两个内嵌 tab。
 * PRD 交易记录表还要「余额桶」「状态」两列，后端 transactions 响应暂无这两字段（已提 #425），
 * 后端补齐后再加列 + 余额桶筛选；当前渲染 API 已支持的 5 列 + 时间/类型两个筛选。
 */
export function BillingLedgerPanel({ tenantId, currencySymbol }: { tenantId: string; currencySymbol: string }) {
  const { hasPermission } = usePermissions()
  const canInvoice = hasPermission(PERMS.BILLING_INVOICE_VIEW)

  const [ledgerTab, setLedgerTab] = useState<'transactions' | 'invoices'>('transactions')
  const [type, setType] = useState('all')
  const [timeFilter, setTimeFilter] = useState<TimeFilterKey>('all')
  const pager = useCursorPager()

  const { data, isFetching } = useQuery({
    queryKey: ['billing', 'transactions', tenantId, type, timeFilter, pager.page, pager.cursor],
    queryFn: () =>
      listTransactions(tenantId, {
        type: type === 'all' ? undefined : type,
        ...timeRange(timeFilter),
        cursor: pager.cursor,
        page_size: 15,
      }),
    enabled: !!tenantId && ledgerTab === 'transactions',
    placeholderData: keepPreviousData,
  })

  const items = data?.items ?? []
  const hasMore = Boolean(data?.has_more && data?.next_cursor)

  const onTypeChange = (v: string) => {
    setType(v)
    pager.reset()
  }
  const onTimeChange = (v: string) => {
    setTimeFilter(v as TimeFilterKey)
    pager.reset()
  }

  return (
    <div className="rounded-lg border border-mg-border bg-card-bg p-6 space-y-4 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-mg-border pb-3">
        <div className="flex gap-6">
          <button
            type="button"
            onClick={() => setLedgerTab('transactions')}
            className={cn(
              'relative pb-3 -mb-3 text-sm font-bold transition-colors',
              ledgerTab === 'transactions' ? 'text-brand-base' : 'text-mg-text-3 hover:text-mg-text-2'
            )}
          >
            交易记录
            {ledgerTab === 'transactions' && (
              <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-brand-base" />
            )}
          </button>
          {canInvoice && (
            <button
              type="button"
              onClick={() => setLedgerTab('invoices')}
              className={cn(
                'relative pb-3 -mb-3 text-sm font-bold transition-colors',
                ledgerTab === 'invoices' ? 'text-brand-base' : 'text-mg-text-3 hover:text-mg-text-2'
              )}
            >
              发票
              {ledgerTab === 'invoices' && (
                <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-brand-base" />
              )}
            </button>
          )}
        </div>
        {ledgerTab === 'transactions' && (
          <div className="flex items-center gap-2">
            <Select value={timeFilter} onChange={onTimeChange} className="h-8 w-28 text-xs rounded-lg">
              {TIME_FILTERS.map((f) => (
                <Select.Option key={f.value} value={f.value}>{f.label}</Select.Option>
              ))}
            </Select>
            <Select value={type} onChange={onTypeChange} className="h-8 w-28 text-xs rounded-lg">
              {TYPE_FILTERS.map((f) => (
                <Select.Option key={f.value} value={f.value}>{f.label}</Select.Option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {ledgerTab === 'invoices' ? (
        <BillingInvoiceTab tenantId={tenantId} currencySymbol={currencySymbol} />
      ) : items.length === 0 && !isFetching ? (
        <EmptyState title="暂无交易记录" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>编号</TableHead>
                <TableHead>时间</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>金额</TableHead>
                <TableHead>渠道</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((txn) => {
                const { text, positive } = amountText(txn)
                return (
                  <TableRow key={txn.transaction_id}>
                    <TableCell className="font-mono text-xs text-mg-text-2 max-w-[140px] truncate">{txn.transaction_id}</TableCell>
                    <TableCell className="text-xs text-mg-text-3 font-mono whitespace-nowrap">{formatDateTime(txn.happened_at)}</TableCell>
                    <TableCell className="text-xs text-mg-text-2 font-semibold whitespace-nowrap">{TXN_TYPE_LABEL[txn.type ?? ''] ?? txn.type ?? '—'}</TableCell>
                    <TableCell className={cn('text-xs font-bold font-mono whitespace-nowrap', positive ? 'text-mg-success' : 'text-mg-text-1')}>{text}</TableCell>
                    <TableCell className="text-xs text-mg-text-2 max-w-[160px] truncate">{objectRef(txn)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <Pagination
            mode="cursor"
            page={pager.page}
            hasMore={hasMore}
            loading={isFetching}
            onPrev={pager.prev}
            onNext={() => pager.next(data?.next_cursor)}
          />
        </>
      )}
    </div>
  )
}
