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
import { useOnboardingStore } from '@/store/use-onboarding-store'
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

/**
 * 「查看赠金」要高亮的是哪一行（新手奖励领取回执 → 入账记录，规格 2026-08-13）。
 *
 * ⚠️ **先比 id，再比编号**。claim 接口返回的 record_ref 是赠金流水的 **id**，而入账记录
 * 这一列展示的 record_ref 是服务端现算的展示编号（`redm_<日期>_<id 后 8 位>`，billing
 * incomeRecordRef）——两者对不上。能对上的是 IncomeRecord.id === claim.transaction_id。
 * 保留 record_ref 的比较是兼容旧回执 / 后端日后把 record_ref 改成正式编号的情况。
 */
function isHighlighted(
  rec: IncomeRecord,
  highlight: { recordRef: string; transactionId: string } | null,
): boolean {
  if (!highlight) return false
  if (highlight.transactionId && rec.id === highlight.transactionId) return true
  return Boolean(highlight.recordRef) && rec.record_ref === highlight.recordRef
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
  const { t } = useTranslation()
  const { hasPermission } = usePermissions()
  // 发票功能仅国内站有（市场特例，PRD）；叠加 billing.invoice:view 权限
  const canInvoice = isDomestic() && hasPermission(PERMS.BILLING_INVOICE_VIEW)

  const [ledgerTab, setLedgerTab] = useState<'transactions' | 'invoices'>('transactions')
  const [type, setType] = useState<'all' | IncomeRecordType>('all')
  const [timeFilter, setTimeFilter] = useState<TimeFilterKey>('all')
  const pager = useCursorPager()

  // 新手奖励领取后从成功弹框点「查看赠金」进来：定位并高亮那条「新手任务奖励」入账记录
  // （新手指南规格 2026-08-13 §交互流程 4-5）
  const highlight = useOnboardingStore((st) => st.billingHighlight)
  const clearHighlight = useOnboardingStore((st) => st.clearBillingHighlight)
  const highlightRowRef = useRef<HTMLTableRowElement | null>(null)

  // 复位筛选与分页，确保目标记录在第一页可见（新手指南规格 2026-08-13：「查看赠金」
  // 会重置账单入账筛选和分页）。用户可能本来就停在账单页上领取的，此时不会重新挂载，
  // 只能由这个外部信号一次性推一把——highlightRecordRef 从 null 变成有值时触发一次，
  // 用完即被下面的 effect 清成 null，不会反复。
  useEffect(() => {
    if (!highlight) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 外部 store 信号驱动的一次性复位，同本仓 logs/index.tsx 的 request_id 自动展开
    setLedgerTab('transactions')
    setType('all')
    setTimeFilter('all')
    onBucketFilterChange('all')
    pager.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight])

  // bucketFilter 由父级（可能来自 BalanceCard 点桶，也可能来自下面的筛选 Select）驱动；
  // 无论来源，变化时都要重置分页 + 上报，跳过首渲染避免误报。
  const bucketMountedRef = useRef(false)
  useEffect(() => {
    if (!bucketMountedRef.current) { bucketMountedRef.current = true; return }
    pager.reset()
    trackEvent('billing_income_filter_change', { time_filter: timeFilter, type_filter: type, bucket_filter: bucketFilter })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucketFilter])

  const { data, isFetching, isError, refetch } = useQuery({
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

  /**
   * 数据到位后滚到目标行，2.2s 后清掉高亮标记（动画时长同 billing.css）。
   * 目标记录不在返回里就直接清掉：用户照常停在账单管理，不弹错误
   * （规格 2026-08-13 §可访问性与异常处理「若目标记录未找到，仍进入账单管理，不阻断」）。
   */
  useEffect(() => {
    if (!highlight || isFetching) return
    const found = items.some((rec) => isHighlighted(rec, highlight))
    if (found) {
      highlightRowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
    const timer = setTimeout(clearHighlight, found ? 2200 : 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight, isFetching, data])

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
            <Select value={timeFilter} onChange={onTimeChange} className="w-28">
              {TIME_FILTERS.map((k) => (
                <Select.Option key={k} value={k}>{t(`billing.income.timeFilters.${k}`)}</Select.Option>
              ))}
            </Select>
            <Select value={type} onChange={onTypeChange} className="w-28">
              {TYPE_FILTERS.map((f) => (
                <Select.Option key={f.value} value={f.value}>
                  {f.value === 'all' ? t('billing.income.typeAll') : t(`billing.income.types.${f.value}`)}
                </Select.Option>
              ))}
            </Select>
            <Select value={bucketFilter} onChange={onBucketChange} className="w-32">
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
      ) : isError ? (
        // 加载失败 ≠ 空数据：失败时给明确提示+重试，不能装成「暂无记录」误导用户（#25）
        <EmptyState
          title={t('billing.income.loadFailed')}
          action={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              {t('billing.income.retry')}
            </Button>
          }
        />
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
                  <TableRow
                    key={rec.id}
                    ref={isHighlighted(rec, highlight) ? highlightRowRef : undefined}
                    className={isHighlighted(rec, highlight) ? 'billing-transaction-highlight' : undefined}
                  >
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
                      <Badge variant={TYPE_BADGE[rec.type]} size="sm" title={t(`billing.income.typeDesc.${rec.type}`)} className="cursor-help">{t(`billing.income.types.${rec.type}`)}</Badge>
                    </TableCell>
                    <TableCell className="text-xs font-bold font-mono whitespace-nowrap text-mg-success tabular-nums">{renderAmount(rec)}</TableCell>
                    <TableCell className="text-xs text-mg-text-2 max-w-[140px]">
                      <span className="flex items-center gap-1.5">
                        {channelIcon(rec.channel)}
                        <span className="truncate">{channelLabel(rec.channel)}</span>
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant={STATUS_BADGE[rec.status]} size="sm" title={t(`billing.income.statusDesc.${rec.status}`)} className="cursor-help">
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
