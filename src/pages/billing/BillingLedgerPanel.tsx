import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { LuTicket, LuGift, LuUsers, LuShieldCheck, LuWallet } from 'react-icons/lu'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/Table'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { CopyButton } from '@/components/ui/CopyButton'
import Select from '@/components/ui/Select'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/format-date'
import { useCursorPager } from '@/hooks/use-cursor-pager'
import { usePermissions } from '@/hooks/use-permissions'
import { isDomestic } from '@/lib/market'
import { PERMS } from '@/config/permissions'
import { AlipayIcon, WechatIcon } from '@/constants/brand-icons'
import { trackEvent } from '@/lib/track'
import { listIncomeRecords } from '@/services/billing'
import type { IncomeRecord, IncomeRecordType, IncomeRecordStatus, IncomeBalanceBucket } from '@/services/billing'
import { BillingInvoiceTab } from './invoice/BillingInvoiceTab'
import type { BalanceTab } from './BalanceCard'

/** 渠道图标：支付渠道用品牌 logo，非支付来源用语义图标区分，避免整列都是干巴巴的文字 */
const CHANNEL_ICON: Record<string, React.ReactNode> = {
  alipay: <AlipayIcon size={14} />,
  wechat: <WechatIcon size={14} />,
  admin: <LuShieldCheck size={14} className="text-mg-text-3 shrink-0" />,
  promo: <LuTicket size={14} className="text-mg-text-3 shrink-0" />,
  activity: <LuGift size={14} className="text-mg-text-3 shrink-0" />,
  referral: <LuUsers size={14} className="text-mg-text-3 shrink-0" />,
}
function channelIcon(channel: string) {
  return CHANNEL_ICON[channel] ?? <LuWallet size={14} className="text-mg-text-3 shrink-0" />
}

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
  failed: { zh: '失败：本次入账尝试未成功，余额未变化', en: 'Failed: this attempt did not go through, balance unchanged' },
}
const STATUS_BADGE: Record<IncomeRecordStatus, 'success' | 'warning' | 'danger'> = {
  completed: 'success',
  processing: 'warning',
  failed: 'danger',
}

/**
 * 账单页收入账本（qa#530，续 #433，对齐飞书 PRD 1.0.4 §8.6.1/§13.3 列顺序与分页）：
 * 单一「入账记录」表 —— 充值 / 赠送 / 奖励三类收入流合成一张表，时间倒序、游标翻页。
 * 列顺序：编号/时间/余额桶/类型/金额/渠道/状态（无发票列，PRD 1.0.4 已去掉该列）。
 * 数据来自 services/billing.listIncomeRecords（后端 #431 未交付前走充值+赠送前端合成回落）。
 * 发票为内嵌 tab（BillingInvoiceTab）。
 */
export function BillingLedgerPanel({
  tenantId, currencySymbol, bucketFilter, onBucketFilterChange,
}: {
  tenantId: string
  currencySymbol: string
  /** 余额桶筛选：与 BalanceCard 的三桶点击共用同一份状态（qa 4-way 审计：曾各自为政，点桶无效果） */
  bucketFilter: BalanceTab
  onBucketFilterChange: (next: BalanceTab) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language.startsWith('zh') ? 'zh' : 'en'
  const { hasPermission } = usePermissions()
  // 发票功能仅国内站有（市场特例，PRD）；叠加 billing.invoice:view 权限
  const canInvoice = isDomestic() && hasPermission(PERMS.BILLING_INVOICE_VIEW)

  const [ledgerTab, setLedgerTab] = useState<'transactions' | 'invoices'>('transactions')
  const [type, setType] = useState<'all' | IncomeRecordType>('all')
  const [timeFilter, setTimeFilter] = useState<TimeFilterKey>('all')
  const pager = useCursorPager()

  // bucketFilter 由父级（可能来自 BalanceCard 点桶，也可能来自下面的筛选 Select）驱动；
  // 无论来源，变化时都要重置分页 + 上报，跳过首渲染避免误报。
  const bucketMountedRef = useRef(false)
  useEffect(() => {
    if (!bucketMountedRef.current) { bucketMountedRef.current = true; return }
    pager.reset()
    trackEvent('billing_income_filter_change', { time_filter: timeFilter, type_filter: type, bucket_filter: bucketFilter })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucketFilter])

  const { data, isFetching } = useQuery({
    queryKey: ['billing', 'income-records', tenantId, type, bucketFilter, timeFilter, pager.page, pager.cursor],
    queryFn: () =>
      listIncomeRecords(tenantId, {
        type: type === 'all' ? undefined : type,
        bucket: bucketFilter === 'all' ? undefined : bucketFilter,
        ...timeRange(timeFilter),
        cursor: pager.cursor,
        page_size: 10,
      }),
    enabled: !!tenantId && ledgerTab === 'transactions',
    placeholderData: keepPreviousData,
  })

  const items = data?.items ?? []
  const hasMore = Boolean(data?.has_more && data?.next_cursor)

  // §11.2 billing_income_filter_change：type/time 两维度共用这个上报点；bucket 维度的上报
  // 已改由上面那个 effect 统一处理（无论触发源是这里的 Select 还是 BalanceCard 点桶）。
  const trackFilterChange = (next: { time?: TimeFilterKey; type?: 'all' | IncomeRecordType }) => {
    trackEvent('billing_income_filter_change', {
      time_filter: next.time ?? timeFilter,
      type_filter: next.type ?? type,
      bucket_filter: bucketFilter,
    })
  }
  const onTypeChange = (v: string) => {
    const next = v as 'all' | IncomeRecordType
    setType(next)
    pager.reset()
    trackFilterChange({ type: next })
  }
  const onBucketChange = (v: string) => {
    onBucketFilterChange(v as BalanceTab)
  }
  const onTimeChange = (v: string) => {
    const next = v as TimeFilterKey
    setTimeFilter(next)
    pager.reset()
    trackFilterChange({ time: next })
  }

  const hasActiveFilter = type !== 'all' || bucketFilter !== 'all' || timeFilter !== 'all'
  const clearFilters = () => {
    setType('all')
    onBucketFilterChange('all')
    setTimeFilter('all')
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
    <div className="billing-ledger-panel rounded-lg border border-mg-border bg-card-bg p-6 space-y-4 shadow-sm">
      <div className="billing-ledger-header flex items-center justify-between gap-3 border-b border-mg-border pb-3 flex-wrap">
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
          <div className="billing-ledger-filters flex items-center gap-2 flex-wrap">
            <Select value={timeFilter} onChange={onTimeChange} className="h-8 w-28 text-xs rounded-md">
              {TIME_FILTERS.map((k) => (
                <Select.Option key={k} value={k}>{t(`billing.income.timeFilters.${k}`)}</Select.Option>
              ))}
            </Select>
            <Select value={type} onChange={onTypeChange} className="h-8 w-28 text-xs rounded-md">
              {TYPE_FILTERS.map((f) => (
                <Select.Option key={f.value} value={f.value}>
                  {f.value === 'all' ? t('billing.income.typeAll') : t(`billing.income.types.${f.value}`)}
                </Select.Option>
              ))}
            </Select>
            <Select value={bucketFilter} onChange={onBucketChange} className="h-8 w-32 text-xs rounded-md">
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
        <EmptyState
          title={hasActiveFilter ? t('billing.income.emptyFiltered') : t('billing.income.empty')}
          action={hasActiveFilter ? (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              {t('billing.income.clearFilters')}
            </Button>
          ) : undefined}
        />
      ) : (
        <>
          <div className="billing-ledger-table-wrap">
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
                    <TableCell className="font-mono text-xs text-mg-text-2 max-w-[160px]">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="truncate">{rec.record_ref}</span>
                        <CopyButton value={rec.record_ref} size="sm" className="h-5 w-5" />
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-mg-text-3 font-mono whitespace-nowrap">
                      {rec.created_at ? formatDateTime(rec.created_at) : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-mg-text-2 whitespace-nowrap">{bucketLabel(rec.balance_bucket)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant={TYPE_BADGE[rec.type]} size="sm" title={TYPE_DESC[rec.type][lang]} className="cursor-help">{t(`billing.income.types.${rec.type}`)}</Badge>
                    </TableCell>
                    <TableCell className="text-xs font-bold font-mono whitespace-nowrap text-mg-success tabular-nums">{renderAmount(rec)}</TableCell>
                    <TableCell className="text-xs text-mg-text-2 max-w-[140px]">
                      <span className="flex items-center gap-1.5">
                        {channelIcon(rec.channel)}
                        <span className="truncate">{channelLabel(rec.channel)}</span>
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant={STATUS_BADGE[rec.status]} size="sm" title={STATUS_DESC[rec.status][lang]} className="cursor-help">
                        {t(`billing.income.status.${rec.status}`)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
