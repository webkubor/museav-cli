import { useEffect, useState } from 'react'
import { formatMoney } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { LuCoins, LuTrendingUp, LuUsers, LuWallet, LuSparkles, LuLock } from 'react-icons/lu'
import { PageHeader } from '@/components/ui/PageHeader'
import { KpiCard } from '@/components/ui/KpiCard'
import { TruncatedText } from '@/components/ui/TruncatedText'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { Pagination } from '@/components/ui/Pagination'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { ReferralInviteCard } from '@/components/referral/ReferralInviteCard'
import { FirstChargeLockGate } from '@/components/ui/FirstChargeLockGate'
import { formatDateTime } from '@/lib/format-date'
import { useAuthStore } from '@/store/auth'
import { useCurrency } from '@/hooks/use-platform-config'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useCursorPager } from '@/hooks/use-cursor-pager'
import { trackPageView } from '@/lib/track'

import {
  getReferralOverview,
  listReferralInvitees,
  listRewardRecords,
} from '@/services/referral'

import type { ReferralCommissionRecord, ReferralInvitee, ReferralStats } from './referral-data'

// 金额展示统一走 @/lib/utils 的 formatMoney（全站单一口径，含亚分级 <¥0.0001 特例，#273）。

type TabKey = 'invitees' | 'commissions'

export default function ReferralPage() {
  const { t } = useTranslation()
  const text: TextCopy = {
    title: t('billing.referral.title'),
    kpiTotalCommission: t('billing.referral.kpiTotalCommission'),
    kpiMonthCommission: t('billing.referral.kpiMonthCommission'),
    kpiActive: t('billing.referral.kpiActive'),
    kpiRewardBalance: t('billing.referral.kpiRewardBalance'),
    inviteLinkLabel: t('billing.referral.inviteLinkLabel'),
    copySuccess: t('billing.referral.copySuccess'),
    copyCodeSuccess: t('billing.referral.copyCodeSuccess'),
    inviteCodeLabel: t('billing.referral.inviteCodeLabel'),
    inviteHint: t('billing.referral.inviteHint'),
    inviteRealtimeLabel: t('billing.referral.inviteRealtimeLabel'),
    inviteBalanceLabel: t('billing.referral.inviteBalanceLabel'),
    inviteRulesLink: t('billing.referral.inviteRulesLink'),
    tierTableLabel: t('billing.referral.tierTableLabel'),
    tierTableHint: t('billing.referral.tierTableHint'),
    rulesTitle: t('billing.referral.rulesTitle'),
    tabInvitees: t('billing.referral.tabInvitees'),
    tabCommissions: t('billing.referral.tabCommissions'),
    colInvitee: t('billing.referral.colInvitee'),
    colRegisteredAt: t('billing.referral.colRegisteredAt'),
    colTotalSpend: t('billing.referral.colTotalSpend'),
    colCommission: t('billing.referral.colCommission'),
    colCurrentTier: t('billing.referral.colCurrentTier'),
    colDate: t('billing.referral.colDate'),
    colSpend: t('billing.referral.colSpend'),
    colRate: t('billing.referral.colRate'),
    colTier: t('billing.referral.colTier'),
    colAmount: t('billing.referral.colAmount'),
    notYet: t('billing.referral.notYet'),
    empty: t('billing.referral.empty'),
    gateTitle: t('billing.referral.gateTitle'),
    gateDesc: t('billing.referral.gateDesc'),
    gateCta: t('billing.referral.gateCta'),
    gateInviteePlaceholder: t('billing.referral.gateInviteePlaceholder'),
  }
  // 金额符号走全局结算币种（platform-config.settlement_currency），#372
  const { symbol } = useCurrency()

  // 推荐计划按当前租户隔离：从哪个租户发出邀请，返佣就进入哪个租户的奖励余额。
  const tenantId = useAuthStore(
    (s) => s.activeTenantId ?? s.tenants.find((t) => t.is_default)?.tenant_id ?? ''
  )

  useEffect(() => {
    trackPageView('referral')
  }, [])

  const { data: overview } = useQuery({
    queryKey: ['referral', 'overview', tenantId],
    queryFn: () => getReferralOverview(tenantId),
    enabled: !!tenantId,
    staleTime: 60_000,
  })
  // 被邀请人列表——游标翻页（替代旧的客户端切片）。pager 必须与 useQuery 同级，
  // 这样点击翻页才能驱动 queryKey 变化并触发重新拉取。
  const inviteesPager = useCursorPager()
  const { data: inviteesPage, isFetching: inviteesFetching } = useQuery({
    queryKey: ['referral', 'invitees', tenantId, inviteesPager.page, inviteesPager.cursor],
    queryFn: () => listReferralInvitees(tenantId, { cursor: inviteesPager.cursor, page_size: 15 }),
    enabled: !!tenantId,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })
  const invitees = inviteesPage?.items ?? []
  const inviteesHasMore = Boolean(inviteesPage?.has_more && inviteesPage?.next_cursor)

  // 切租户后回到第一页：游标按租户隔离，旧 cursor 发给新租户会拿错数据。
  const { reset: resetInviteesPager } = inviteesPager
  useEffect(() => {
    resetInviteesPager()
  }, [tenantId, resetInviteesPager])

  // 返佣流水——游标翻页（替代旧的客户端切片）。pager 必须与 useQuery 同级，
  // 这样点击翻页才能驱动 queryKey 变化并触发重新拉取。
  const rewardPager = useCursorPager()
  const { data: rewardRecordsPage, isFetching: rewardFetching } = useQuery({
    queryKey: ['referral', 'reward-records', tenantId, rewardPager.page, rewardPager.cursor],
    queryFn: () => listRewardRecords(tenantId, { cursor: rewardPager.cursor, page_size: 15 }),
    enabled: !!tenantId,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })
  const rewardRecords = rewardRecordsPage?.items ?? []
  const rewardHasMore = Boolean(rewardRecordsPage?.has_more && rewardRecordsPage?.next_cursor)

  // 切租户后回到第一页：游标按租户隔离，旧 cursor 发给新租户会拿错数据。
  const { reset: resetRewardPager } = rewardPager
  useEffect(() => {
    resetRewardPager()
  }, [tenantId, resetRewardPager])

  const emptyStats: ReferralStats = {
    totalCommission: '0',
    monthCommission: '0',
    todayCommission: '0',
    activeInvited: 0,
    invitedTotal: 0,
    rewardBalance: '0',
  }
  const stats = overview?.stats ?? emptyStats
  const inviteCode = overview?.inviteCode ?? ''
  const inviteLink = inviteCode ? `${window.location.origin}/signup?aff=${inviteCode}` : ''
  const rewardBalance = Number(stats.rewardBalance)
  // 未首充时 inviteCode 为空字符串：整页门槛态
  const isQualified = !!inviteCode

  const [activeTab, setActiveTab] = useState<TabKey>('invitees')
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'invitees', label: text.tabInvitees },
    { key: 'commissions', label: text.tabCommissions },
  ]

  // 档位阶梯配置——后端接口就绪后替换为 API 数据（#220）
  const tierConfig = [
    { name: t('billing.referral.tiers.growth'), threshold: 0, rate: 10 },
    { name: t('billing.referral.tiers.core'), threshold: 50000, rate: 13 },
    { name: t('billing.referral.tiers.strategic'), threshold: 200000, rate: 15 },
  ]
  const ruleItems = [
    t('billing.referral.ruleItem1'),
    t('billing.referral.ruleItem2'),
    t('billing.referral.ruleItem3'),
    t('billing.referral.ruleItem4'),
  ]

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 页头 */}
      <PageHeader title={text.title} />

      {/* KPI 行 */}
      <div className="no-canvas-blur grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <KpiCard
          title={text.kpiTotalCommission}
          value={formatMoney(stats.totalCommission, symbol)}
          rawNumber={stats.totalCommission}
          formatter={(n) => formatMoney(n, symbol)}
          icon={<LuCoins size={16} />}
          color="var(--brand-base)"
          glowColor="var(--brand-glow)"
        />
        <KpiCard
          title={text.kpiMonthCommission}
          value={formatMoney(stats.monthCommission, symbol)}
          rawNumber={stats.monthCommission}
          formatter={(n) => formatMoney(n, symbol)}
          icon={<LuTrendingUp size={16} />}
          color="var(--brand-base)"
          glowColor="var(--brand-glow)"
        />
        <KpiCard
          title={text.kpiActive}
          value={`${stats.activeInvited} / ${stats.invitedTotal}`}
          rawNumber={stats.activeInvited}
          formatter={(n) => `${Math.round(n)} / ${stats.invitedTotal}`}
          ratio={{ current: stats.activeInvited, total: stats.invitedTotal }}
          icon={<LuUsers size={16} />}
          color="var(--brand-base)"
          glowColor="var(--brand-glow)"
        />

        <KpiCard
          title={text.kpiRewardBalance}
          value={formatMoney(rewardBalance, symbol)}
          rawNumber={rewardBalance}
          formatter={(n) => formatMoney(n, symbol)}
          icon={<LuWallet size={16} />}
          color="var(--brand-base)"
          glowColor="var(--brand-glow)"
        />
      </div>

      {/* 邀请区 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <FirstChargeLockGate
          locked={!isQualified}
          title={text.gateTitle}
          desc={text.gateDesc}
          cta={text.gateCta}
        >
          <ReferralInviteCard
            inviteLink={inviteLink}
            inviteCode={inviteCode}
            inviteLinkLabel={text.inviteLinkLabel}
            inviteCodeLabel={text.inviteCodeLabel}
            inviteHint={text.inviteHint}
            copySuccess={text.copySuccess}
            copyCodeSuccess={text.copyCodeSuccess}
            realtimeLabel={text.inviteRealtimeLabel}
            balanceLabel={text.inviteBalanceLabel}
            rulesLinkLabel={text.inviteRulesLink}
          />
        </FirstChargeLockGate>

        {/* 档位阶梯卡 */}
        <div className="relative overflow-hidden rounded-lg border border-mg-border bg-card-bg p-5 space-y-3">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-brand-base/35 via-brand-base/10 to-transparent" />
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-mg-text-1">{text.tierTableLabel}</p>
            <span className="text-xs text-mg-text-3">{text.tierTableHint}</span>
          </div>
          <div className="divide-y divide-mg-border/50">
            {tierConfig.map((tier) => {
              return (
                <div
                  key={tier.name}
                  className="flex items-center justify-between py-2.5 px-3 -mx-3 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-mg-text-2">
                      {tier.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-mg-text-3">
                      {/* 符号走全局结算币种（#372）；门槛数值仍是前端 mock，等 #220 后端接口下发 */}
                      {t('billing.referral.tierSpendThreshold', { amount: `${symbol}${tier.threshold.toLocaleString()}` })}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-mg-text-1">
                      {tier.rate}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 分润规则 */}
      <div
        id="referral-rules"
        className="scroll-mt-24 rounded-lg border border-mg-border bg-card-bg p-5 space-y-3.5"
      >
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--brand-base)]">
          <LuSparkles size={15} className="animate-pulse" />
          <span>{text.rulesTitle}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-mg-text-3 leading-relaxed">
          {ruleItems.map((item, index) => (
            <div key={item} className="flex gap-2.5 items-start">
              <span className={`mt-0.5 p-1 rounded-md text-xs font-bold shrink-0 ${index === 3 ? 'bg-mg-danger/10 text-mg-danger' : 'bg-[var(--brand-base)]/10 text-[var(--brand-base)]'}`}>
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>{item}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 三 Tab */}
      <div className="rounded-lg border border-mg-border bg-card-bg overflow-hidden">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
          <div className="border-b border-mg-border/60 px-5 pt-3">
            <TabsList variant="pills">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.key} variant="pills" value={tab.key}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value="invitees" className="mt-0">
            <InviteesTable
              invitees={invitees}
              text={text}
              isQualified={isQualified}
              page={inviteesPager.page}
              hasMore={inviteesHasMore}
              loading={inviteesFetching}
              onPrev={inviteesPager.prev}
              onNext={() => inviteesPager.next(inviteesPage?.next_cursor)}
            />
          </TabsContent>
          <TabsContent value="commissions" className="mt-0">
            <CommissionsTable
              records={rewardRecords}
              text={text}
              page={rewardPager.page}
              hasMore={rewardHasMore}
              loading={rewardFetching}
              onPrev={rewardPager.prev}
              onNext={() => rewardPager.next(rewardRecordsPage?.next_cursor)}
            />
          </TabsContent>
        </Tabs>
      </div>

    </div>
  )
}

// ── 子表格组件 ──────────────────────────────────────────────

interface TextCopy {
  title: string
  kpiTotalCommission: string
  kpiMonthCommission: string
  kpiActive: string
  kpiRewardBalance: string
  inviteLinkLabel: string
  copySuccess: string
  copyCodeSuccess: string
  inviteCodeLabel: string
  inviteHint: string
  inviteRealtimeLabel: string
  inviteBalanceLabel: string
  inviteRulesLink: string
  tierTableLabel: string
  tierTableHint: string
  rulesTitle: string
  tabInvitees: string
  tabCommissions: string
  colInvitee: string
  colRegisteredAt: string
  colTotalSpend: string
  colCommission: string
  colCurrentTier: string
  colDate: string
  colSpend: string
  colRate: string
  colTier: string
  colAmount: string
  notYet: string
  empty: string
  gateTitle: string
  gateDesc: string
  gateCta: string
  gateInviteePlaceholder: string
}


function TierBadge({ name, rate, fallback }: { name?: string; rate?: number; fallback: string }) {
  if (!name) return <span className="text-mg-text-4">{fallback}</span>
  const colorMap: Record<string, string> = {
    '成长伙伴': 'bg-green-500/10 text-green-600 border-green-500/20',
    'Growth Partner': 'bg-green-500/10 text-green-600 border-green-500/20',
    '核心伙伴': 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    'Core Partner': 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    '战略伙伴': 'bg-purple-500/10 text-purple-600 border-purple-500/20',
    'Strategic Partner': 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  }
  const cls = colorMap[name] ?? 'bg-mg-fill-0 text-mg-text-2 border-mg-border'
  const label = typeof rate === 'number' && rate > 0 ? `${name} · ${rate}%` : name
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${cls}`}>
      {label}
    </span>
  )
}

function InviteesTable({
  invitees,
  text,
  isQualified,
  page,
  hasMore,
  loading,
  onPrev,
  onNext,
}: {
  /** 当前页的被邀请人（后端游标翻页，已是单页数据） */
  invitees: ReferralInvitee[]
  text: TextCopy
  isQualified: boolean
  page: number
  hasMore: boolean
  loading: boolean
  onPrev: () => void
  onNext: () => void
}) {
  // 金额符号走全局结算币种（#372）——同一全局值，子组件各自读，不做 props 穿透
  const { symbol } = useCurrency()

  if (!isQualified) {
    return (
      <div className="py-12 flex flex-col items-center gap-3 text-center">
        <LuLock size={20} className="text-mg-text-4" />
        <p className="text-sm text-mg-text-3">{text.gateInviteePlaceholder}</p>
      </div>
    )
  }
  return (
    <>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{text.colInvitee}</TableHead>
          <TableHead className="text-right">{text.colTotalSpend}</TableHead>
          <TableHead className="text-right">{text.colCommission}</TableHead>
          <TableHead>{text.colRegisteredAt}</TableHead>
          <TableHead>{text.colCurrentTier}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invitees.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-mg-text-3 py-8">
              {text.empty}
            </TableCell>
          </TableRow>
        ) : (
          invitees.map((inv) => {
            const tierName = inv.tierName ?? inv.tier_name ?? inv.currentTier
            const tierRate = inv.tierRate ?? inv.tier_rate
            return (
              <TableRow key={`${inv.email}-${inv.registeredAt}`}>
                <TableCell>
                  <TruncatedText text={inv.name} maxWidth={180} className="font-medium text-mg-text-1" />
                  <TruncatedText text={inv.email} maxWidth={180} className="text-xs text-mg-text-3 mt-0.5" />
                </TableCell>
                <TableCell className="text-right font-mono">{formatMoney(inv.totalSpend, symbol)}</TableCell>
                <TableCell className="text-right font-mono">{formatMoney(inv.commission, symbol)}</TableCell>
                <TableCell>{inv.registeredAt}</TableCell>
                <TableCell>
                  <TierBadge name={tierName} rate={tierRate} fallback={text.notYet} />
                </TableCell>
              </TableRow>
            )
          })
        )}
      </TableBody>
    </Table>
    {/* 翻页器移出空状态分支：空的第 N 页也要能点上一页（#214）。 */}
    {(page > 1 || hasMore) && (
      <Pagination
        mode="cursor"
        page={page}
        hasMore={hasMore}
        loading={loading}
        onPrev={onPrev}
        onNext={onNext}
      />
    )}
    </>
  )
}

function CommissionsTable({
  records,
  text,
  page,
  hasMore,
  loading,
  onPrev,
  onNext,
}: {
  /** 当前页的返佣流水（后端游标翻页，已是单页数据） */
  records: ReferralCommissionRecord[]
  text: TextCopy
  page: number
  hasMore: boolean
  loading: boolean
  onPrev: () => void
  onNext: () => void
}) {
  const { symbol } = useCurrency()

  return (
    <>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{text.colDate}</TableHead>
          <TableHead>{text.colInvitee}</TableHead>
          <TableHead>{text.colTier}</TableHead>
          <TableHead className="text-right">{text.colSpend}</TableHead>
          <TableHead className="text-right">{text.colRate}</TableHead>
          <TableHead className="text-right">{text.colAmount}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-mg-text-3 py-8">
              {text.empty}
            </TableCell>
          </TableRow>
        ) : (
          records.map((rec, index) => (
            <TableRow key={`${rec.date}-${rec.source}-${index}`}>
              <TableCell className="font-mono text-xs">{formatDateTime(rec.date)}</TableCell>
              <TableCell><TruncatedText text={rec.source} maxWidth={160} /></TableCell>
              <TableCell>
                <TierBadge name={rec.tierName} fallback={text.notYet} />
              </TableCell>
              <TableCell className="text-right font-mono">{formatMoney(rec.spend, symbol)}</TableCell>
              <TableCell className="text-right font-mono">{rec.rate}%</TableCell>
              <TableCell className="text-right font-mono">{formatMoney(rec.amount, symbol)}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
    {/* 翻页器移出空状态分支：空的第 N 页也要能点上一页（#214）。 */}
    {(page > 1 || hasMore) && (
      <Pagination
        mode="cursor"
        page={page}
        hasMore={hasMore}
        loading={loading}
        onPrev={onPrev}
        onNext={onNext}
      />
    )}
    </>
  )
}
