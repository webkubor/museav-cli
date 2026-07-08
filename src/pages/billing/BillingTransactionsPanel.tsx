import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/Table'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import Select from '@/components/ui/Select'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/format-date'
import { useCursorPager } from '@/hooks/use-cursor-pager'
import { listTransactions } from '@/services/billing'
import type { TransactionTransaction } from '@/types/generated-api-types'

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
 * 交易记录（统一账本）—— PRD assert-billing 要求的交易记录表。
 * 注：PRD 还要「余额桶」「状态」两列，后端 transactions 响应暂无这两个字段
 * （已提 #420），后端补齐后再加列；当前渲染 API 已支持的 5 列 + 发票下载。
 */
export function BillingTransactionsPanel({ tenantId }: { tenantId: string }) {
  const [type, setType] = useState('all')
  const pager = useCursorPager()

  const { data, isFetching } = useQuery({
    queryKey: ['billing', 'transactions', tenantId, type, pager.page, pager.cursor],
    queryFn: () =>
      listTransactions(tenantId, {
        type: type === 'all' ? undefined : type,
        cursor: pager.cursor,
        page_size: 15,
      }),
    enabled: !!tenantId,
    placeholderData: keepPreviousData,
  })

  const items = data?.items ?? []
  const hasMore = Boolean(data?.has_more && data?.next_cursor)

  const onTypeChange = (v: string) => {
    setType(v)
    pager.reset()
  }

  return (
    <div className="rounded-lg border border-mg-border bg-card-bg p-6 space-y-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-mg-text-1">交易记录</span>
        <Select value={type} onChange={onTypeChange} className="h-8 w-28 text-xs rounded-lg">
          {TYPE_FILTERS.map((f) => (
            <Select.Option key={f.value} value={f.value}>{f.label}</Select.Option>
          ))}
        </Select>
      </div>

      {items.length === 0 && !isFetching ? (
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
                <TableHead>账务对象</TableHead>
                <TableHead>发票</TableHead>
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
                    <TableCell className="text-xs">
                      {txn.invoice_url ? (
                        <a href={txn.invoice_url} target="_blank" rel="noreferrer" className="font-semibold text-brand-base hover:text-brand-base/80">下载</a>
                      ) : (
                        <span className="text-mg-text-3">—</span>
                      )}
                    </TableCell>
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
