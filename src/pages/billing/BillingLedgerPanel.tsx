import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/Table'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import Select from '@/components/ui/Select'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/format-date'
import { useCursorPager } from '@/hooks/use-cursor-pager'
import { usePermissions } from '@/hooks/use-permissions'
import { isDomestic } from '@/lib/market'
import { PERMS } from '@/config/permissions'
import { listIncomeRecords } from '@/services/billing'
import type { IncomeRecord, IncomeRecordType, IncomeRecordStatus, IncomeBalanceBucket } from '@/services/billing'
import { BillingInvoiceTab } from './invoice/BillingInvoiceTab'

const TYPE_FILTERS: Array<{ value: 'all' | IncomeRecordType }> = [
  { value: 'all' },
  { value: 'recharge' },
  { value: 'gift' },
  { value: 'reward' },
]

const BUCKET_FILTERS: Array<{ value: 'all' | IncomeBalanceBucket }> = [
  { value: 'all' },
  { value: 'main' },
  { value: 'gift' },
  { value: 'reward' },
]

// 对齐 PRD billingTxnTimeFilters；range() 惰性算，避免模块加载时固定“现在”
const TIME_FILTERS = ['all', 'last7d', 'last30d', 'thisMonth', 'lastMonth'] as const
type TimeFilterKey = (typeof TIME_FILTERS)[number]

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

/** 类型徽章配色：充值(brand) / 赠送(info) / 奖励(purple)——统一浅色调家族，只差色相（需求方#84 反馈实心/描边混排） */
const TYPE_BADGE: Record<IncomeRecordType, 'brand' | 'info' | 'purple'> = {
  recharge: 'brand',
  gift: 'info',
  reward: 'purple',
}

// hover title 释义（双语，避免动 locale 文件）：徽章缩写不直观时补一句人话
const TYPE_DESC: Record<IncomeRecordType, { zh: string; en: string }> = {
  recharge: { zh: '充值：用户主动充值入账', en: 'Recharge: credited from a user top-up' },
  gift: { zh: '赠送入账：平台发放的赠送额度', en: 'Gift credit: complimentary balance from the platform' },
  reward: { zh: '奖励入账：活动或奖励发放的额度', en: 'Reward credit: balance granted via rewards or activities' },
}
const STATUS_DESC: Record<IncomeRecordStatus, { zh: string; en: string }> = {
  completed: { zh: '已完成：入账成功', en: 'Completed: credited successfully' },
  processing: { zh: '处理中：入账处理中', en: 'Processing: credit in progress' },
}

/**
 * 账单页收入账本（qa#530，续 #433，对齐飞书 PRD 1.0.4 §8.6.1/§13.3 列顺序与分页）：
 * 单一「入账记录」表 —— 充值 / 赠送 / 奖励三类收入流合成一张表，时间倒序、游标翻页。
 * 列顺序：编号/时间/余额桶/类型/金额/渠道/状态（无发票列，PRD 1.0.4 已去掉该列）。
 * 数据来自 services/billing.listIncomeRecords（后端 #431 未交付前走充值+赠送前端合成回落）。
 * 发票为内嵌 tab（BillingInvoiceTab）。
 */
export function BillingLedgerPanel({ tenantId, currencySymbol }: { tenantId: string; currencySymbol: string }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language.startsWith('zh') ? 'zh' : 'en'
  const { hasPermission } = usePermissions()
  // 发票功能仅国内站有（市场特例，PRD）；叠加 billing.invoice:view 权限
  const canInvoice = isDomestic() && hasPermission(PERMS.BILLING_INVOICE_VIEW)

  const [ledgerTab, setLedgerTab] = useState<'transactions' | 'invoices'>('transactions')
  const [type, setType] = useState<'all' | IncomeRecordType>('all')
  const [bucket, setBucket] = useState<'all' | IncomeBalanceBucket>('all')
  const [timeFilter, setTimeFilter] = useState<TimeFilterKey>('all')
  const pager = useCursorPager()

  const { data, isFetching } = useQuery({
    queryKey: ['billing', 'income-records', tenantId, type, bucket, timeFilter, pager.page, pager.cursor],
    queryFn: () =>
      listIncomeRecords(tenantId, {
        type: type === 'all' ? undefined : type,
        bucket: bucket === 'all' ? undefined : bucket,
        ...timeRange(timeFilter),
        cursor: pager.cursor,
        page_size: 10,
      }),
    enabled: !!tenantId && ledgerTab === 'transactions',
    placeholderData: keepPreviousData,
  })

  const items = data?.items ?? []
  const hasMore = Boolean(data?.has_more && data?.next_cursor)

  const onTypeChange = (v: string) => {
    setType(v as 'all' | IncomeRecordType)
    pager.reset()
  }
  const onBucketChange = (v: string) => {
    setBucket(v as 'all' | IncomeBalanceBucket)
    pager.reset()
  }
  const onTimeChange = (v: string) => {
    setTimeFilter(v as TimeFilterKey)
    pager.reset()
  }

  const channelLabel = (c: string) => t(`billing.income.channels.${c}`, { defaultValue: c })
  const bucketLabel = (b: string) => t(`billing.income.buckets.${b}`, { defaultValue: b })

  const renderAmount = (rec: IncomeRecord) => {
    const raw = rec.amount?.amount ?? '0'
    const num = Number(raw)
    const display = Number.isFinite(num) ? num.toLocaleString() : raw
    return `+${currencySymbol}${display}`
  }

  return (
    <div className="rounded-lg border border-mg-border bg-card-bg p-6 space-y-4 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-mg-border pb-3 flex-wrap">
        <div className="flex gap-6">
          <button
            type="button"
            onClick={() => setLedgerTab('transactions')}
            className={cn(
              'relative pb-3 -mb-3 text-sm font-bold transition-colors',
              ledgerTab === 'transactions' ? 'text-brand-base' : 'text-mg-text-3 hover:text-mg-text-2'
            )}
          >
            {t('billing.income.tab')}
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
              {t('billing.income.invoiceTab')}
              {ledgerTab === 'invoices' && (
                <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-brand-base" />
              )}
            </button>
          )}
        </div>
        {ledgerTab === 'transactions' && (
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={timeFilter} onChange={onTimeChange} className="h-8 w-28 text-xs rounded-lg">
              {TIME_FILTERS.map((k) => (
                <Select.Option key={k} value={k}>{t(`billing.income.timeFilters.${k}`)}</Select.Option>
              ))}
            </Select>
            <Select value={type} onChange={onTypeChange} className="h-8 w-28 text-xs rounded-lg">
              {TYPE_FILTERS.map((f) => (
                <Select.Option key={f.value} value={f.value}>
                  {f.value === 'all' ? t('billing.income.typeAll') : t(`billing.income.types.${f.value}`)}
                </Select.Option>
              ))}
            </Select>
            <Select value={bucket} onChange={onBucketChange} className="h-8 w-28 text-xs rounded-lg">
              {BUCKET_FILTERS.map((f) => (
                <Select.Option key={f.value} value={f.value}>
                  {f.value === 'all' ? t('billing.income.bucketAll') : t(`billing.income.buckets.${f.value}`)}
                </Select.Option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {ledgerTab === 'invoices' ? (
        <BillingInvoiceTab tenantId={tenantId} currencySymbol={currencySymbol} />
      ) : items.length === 0 && !isFetching ? (
        <EmptyState title={t('billing.income.empty')} />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('billing.income.cols.recordRef')}</TableHead>
                <TableHead>{t('billing.income.cols.time')}</TableHead>
                <TableHead>{t('billing.income.cols.bucket')}</TableHead>
                <TableHead>{t('billing.income.cols.type')}</TableHead>
                <TableHead>{t('billing.income.cols.amount')}</TableHead>
                <TableHead>{t('billing.income.cols.channel')}</TableHead>
                <TableHead>{t('billing.income.cols.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((rec) => (
                <TableRow key={rec.id}>
                  <TableCell className="font-mono text-xs text-mg-text-2 max-w-[160px] truncate">{rec.record_ref}</TableCell>
                  <TableCell className="text-xs text-mg-text-3 font-mono whitespace-nowrap">
                    {rec.created_at ? formatDateTime(rec.created_at) : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-mg-text-2 whitespace-nowrap">{bucketLabel(rec.balance_bucket)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge variant={TYPE_BADGE[rec.type]} size="sm" title={TYPE_DESC[rec.type][lang]} className="cursor-help">{t(`billing.income.types.${rec.type}`)}</Badge>
                  </TableCell>
                  <TableCell className="text-xs font-bold font-mono whitespace-nowrap text-mg-success">{renderAmount(rec)}</TableCell>
                  <TableCell className="text-xs text-mg-text-2 max-w-[140px] truncate">{channelLabel(rec.channel)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge variant={rec.status === 'completed' ? 'success' : 'warning'} size="sm" title={STATUS_DESC[rec.status][lang]} className="cursor-help">
                      {t(`billing.income.status.${rec.status}`)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
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
