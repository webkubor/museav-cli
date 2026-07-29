import { useEffect, useState } from 'react'
import { cn, formatMoney } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { LuCoins, LuTrendingUp, LuUsers, LuWallet, LuSparkles, LuLock } from 'react-icons/lu'
import { PageHeader } from '@/components/ui/PageHeader'
import { KpiCard } from '@/components/ui/KpiCard'
import { Button } from '@/components/ui/Button'
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
import { Modal } from '@/components/ui/Modal'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { ReferralInviteCard } from '@/components/referral/ReferralInviteCard'
import { FirstChargeLockGate } from '@/components/ui/FirstChargeLockGate'
import { appToast } from '@/lib/app-toast'
import { formatDateTime } from '@/lib/format-date'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useCursorPager } from '@/hooks/use-cursor-pager'
import { trackPageView } from '@/lib/track'

import {
  getReferralOverview,
  listReferralInvitees,
  listRewardRecords,
  transferRewardToBalance,
} from '@/services/referral'

import {
  referralCopy,
  type ReferralCommissionRecord,
  type ReferralInvitee,
  type ReferralStats,
} from './referral-data'

// 金额展示统一走 @/lib/utils 的 formatMoney（全站单一口径，含亚分级 <¥0.0001 特例，#273）。

type TabKey = 'invitees' | 'commissions'

export default function ReferralPage() {
  const { i18n } = useTranslation()
  const { hasPermission } = usePermissions()
  // 转入主余额入口：现网老功能，referral.reward:transfer 权限门；V1.0.3 范围内保留（1.0.4 才移除，不提前套用）
  const canTransfer = hasPermission(PERMS.REFERRAL_REWARD_TRANSFER)
  const text = i18n.language.startsWith('zh') ? referralCopy.zh : referralCopy.en

  // 推荐计划按当前租户隔离：从哪个租户发出邀请，返佣就进入哪个租户的奖励余额。
  const tenantId = useAuthStore(
    (s) => s.activeTenantId ?? s.tenants.find((t) => t.is_default)?.tenant_id ?? ''
  )
  const queryClient = useQueryClient()

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

  /** 转出成功后刷新所有受影响的余额与记录视图 */
  const invalidateMoneyViews = () => {
    queryClient.invalidateQueries({ queryKey: ['referral', 'overview', tenantId] })
    queryClient.invalidateQueries({ queryKey: ['referral', 'reward-records', tenantId] })
    queryClient.invalidateQueries({ queryKey: ['balance', tenantId] })
    queryClient.invalidateQueries({ queryKey: ['balance', 'breakdown', tenantId] })
    queryClient.invalidateQueries({ queryKey: ['billing', 'recharges', tenantId] })
  }

  const MIN_AMOUNT = 100

  const [activeTab, setActiveTab] = useState<TabKey>('invitees')
  // 稳定幂等键：打开弹窗时生成，确认重试期间复用；金额修改即重铸。
  const [idempotencyKey, setIdempotencyKey] = useState('')

  // 转入主余额弹窗
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferAmount, setTransferAmount] = useState('')

  const transferNum = Number(transferAmount)
  const transferValid = transferNum >= MIN_AMOUNT && transferNum <= rewardBalance

  const handleTransfer = () => {
    if (rewardBalance < MIN_AMOUNT) {
      appToast.info(text.belowMin)
      return
    }
    setIdempotencyKey(crypto.randomUUID())
    setTransferAmount(String(rewardBalance))
    setTransferOpen(true)
  }

  /** 金额一旦修改即重铸幂等键：同键不同额会被后端按原额重放，必须避免 */
  const onTransferAmountChange = (v: string) => {
    setIdempotencyKey(crypto.randomUUID())
    setTransferAmount(v)
  }

  const transferMutation = useMutation({
    mutationFn: () =>
      transferRewardToBalance(tenantId, {
        amount: String(transferNum),
        idempotency_key: idempotencyKey,
      }),
    onSuccess: () => {
      invalidateMoneyViews()
      setTransferOpen(false)
      appToast.success(text.transferSuccess.replace('{amount}', formatMoney(transferNum)))
    },
    onError: (err: Error) => appToast.requestError(err, text.transferFailed),
  })

  const confirmTransfer = () => {
    if (!transferValid || transferMutation.isPending) return
    transferMutation.mutate()
  }

  /** 金额只留数字 + 最多一个小数点、两位小数（type=text 规避原生 spinner 与 step 校验气泡） */
  const sanitizeAmount = (raw: string) => {
    const cleaned = raw.replace(/[^\d.]/g, '').replace(/^(\d*\.\d*).*$/, '$1')
    const [int, dec] = cleaned.split('.')
    return dec !== undefined ? `${int}.${dec.slice(0, 2)}` : cleaned
  }

  /** 金额校验的内联错误（替代原生 tooltip）：仅在有输入时提示 */
  const amountError = (raw: string) => {
    if (!raw.trim()) return null
    const n = Number(raw)
    if (!(n >= MIN_AMOUNT)) return text.errTooLow
    if (n > rewardBalance) return text.errExceed
    return null
  }

  /** 余额面板：弹窗头部的可用额度 + 规则说明 */
  const balancePanel = (label: string) => (
    <div className="flex items-center justify-between rounded-lg border border-mg-border/60 bg-mg-fill-0/50 px-4 py-3">
      <div>
        <div className="text-xs text-mg-text-3">{label}</div>
        <div className="mt-0.5 font-mono text-xl font-bold tabular-nums text-mg-text-1">{formatMoney(rewardBalance)}</div>
      </div>
      <span className="rounded-full border border-mg-border/60 bg-mg-fill-0/60 px-2.5 py-1 text-xs font-semibold text-mg-text-2">
        {text.ruleMin}
      </span>
    </div>
  )

  /** 大号金额输入：¥ 前缀 + 快捷全部 + 内联错误 */
  const moneyField = (value: string, onChange: (v: string) => void, fillLabel: string) => {
    const error = amountError(value)
    return (
      <div>
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg border bg-mg-fill-0/40 px-4 py-3 transition-colors',
            error ? 'border-mg-danger/60' : 'border-mg-border focus-within:border-brand-base',
          )}
        >
          <span className="text-lg font-semibold text-mg-text-3">¥</span>
          <input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(sanitizeAmount(e.target.value))}
            placeholder="0.00"
            className="min-w-0 flex-1 bg-transparent font-mono text-2xl font-bold tabular-nums text-mg-text-1 outline-none placeholder:text-mg-text-4"
          />
          <button
            type="button"
            onClick={() => onChange(String(rewardBalance))}
            className="shrink-0 text-xs font-bold text-brand-base transition-colors hover:text-brand-deep"
          >
            {fillLabel}
          </button>
        </div>
        {error && <p className="mt-1.5 text-xs text-mg-danger">{error}</p>}
      </div>
    )
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'invitees', label: text.tabInvitees },
    { key: 'commissions', label: text.tabCommissions },
  ]

  const isZh = i18n.language.startsWith('zh')

  // 档位阶梯配置——后端接口就绪后替换为 API 数据（#220）
  const tierConfig = [
    { name: isZh ? '成长伙伴' : 'Growth Partner', threshold: 0, rate: 10 },
    { name: isZh ? '核心伙伴' : 'Core Partner', threshold: 50000, rate: 13 },
    { name: isZh ? '战略伙伴' : 'Strategic Partner', threshold: 200000, rate: 15 },
  ]

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 页头 */}
      <PageHeader title={text.title} />

      {/* KPI 行 */}
      <div className="no-canvas-blur grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <KpiCard
          title={text.kpiTotalCommission}
          value={formatMoney(stats.totalCommission)}
          rawNumber={stats.totalCommission}
          formatter={(n) => formatMoney(n)}
          icon={<LuCoins size={16} />}
          color="var(--brand-base)"
          glowColor="var(--brand-glow)"
        />
        <KpiCard
          title={text.kpiMonthCommission}
          value={formatMoney(stats.monthCommission)}
          rawNumber={stats.monthCommission}
          formatter={(n) => formatMoney(n)}
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
          value={formatMoney(rewardBalance)}
          rawNumber={rewardBalance}
          formatter={(n) => formatMoney(n)}
          icon={<LuWallet size={16} />}
          color="var(--brand-base)"
          glowColor="var(--brand-glow)"
          action={canTransfer && rewardBalance > 0 ? { label: text.transferToBalance, onClick: handleTransfer } : undefined}
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
            {tierConfig.map((t) => {
              return (
                <div
                  key={t.name}
                  className="flex items-center justify-between py-2.5 px-3 -mx-3 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-mg-text-2">
                      {t.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-mg-text-3">
                      {t.threshold === 0
                        ? (isZh ? '累计消费 ≥ ¥0' : 'Spend ≥ ¥0')
                        : (isZh ? `累计消费 ≥ ¥${t.threshold.toLocaleString()}` : `Spend ≥ ¥${t.threshold.toLocaleString()}`)}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-mg-text-1">
                      {t.rate}%
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
        {isZh ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-mg-text-3 leading-relaxed">
            <div className="flex gap-2.5 items-start">
              <span className="mt-0.5 p-1 rounded-md bg-[var(--brand-base)]/10 text-[var(--brand-base)] text-xs font-bold shrink-0">01</span>
              <div>
                被邀请人每次实际付费消费<span className="text-[var(--brand-base)] font-bold">实时计返佣</span>（退款冲回、赠送/兑换码额度消费不计），奖励按其累计消费对应的档位比例计算。
              </div>
            </div>
            <div className="flex gap-2.5 items-start">
              <span className="mt-0.5 p-1 rounded-md bg-[var(--brand-base)]/10 text-[var(--brand-base)] text-xs font-bold shrink-0">02</span>
              <div>
                奖励直接计入<span className="text-[var(--brand-base)] font-bold">奖励余额</span>，无需转入主余额；模型调用时在<span className="text-[var(--brand-base)] font-bold">主余额前自动抵扣</span>，暂不支持提现。
              </div>
            </div>
            <div className="flex gap-2.5 items-start">
              <span className="mt-0.5 p-1 rounded-md bg-[var(--brand-base)]/10 text-[var(--brand-base)] text-xs font-bold shrink-0">03</span>
              <div>
                返佣<span className="text-[var(--brand-base)] font-bold">上不封顶</span>；返佣档位、比例与门槛由平台统一设置，以推荐计划页面实际展示为准。
              </div>
            </div>
            <div className="flex gap-2.5 items-start">
              <span className="mt-0.5 p-1 rounded-md bg-mg-danger/10 text-mg-danger text-xs font-bold shrink-0">04</span>
              <div>
                同主体、同设备、同 IP 或异常消费将进入核查；确认违规后，相关奖励可被冻结或取消。
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-mg-text-3 leading-relaxed">
            <div className="flex gap-2.5 items-start">
              <span className="mt-0.5 p-1 rounded-md bg-[var(--brand-base)]/10 text-[var(--brand-base)] text-xs font-bold shrink-0">01</span>
              <div>
                Commission accrues in <span className="text-[var(--brand-base)] font-bold">real time</span> on actual paid spend (refunds clawed back; gifted/promo codes excluded), calculated by the tier matching total spend.
              </div>
            </div>
            <div className="flex gap-2.5 items-start">
              <span className="mt-0.5 p-1 rounded-md bg-[var(--brand-base)]/10 text-[var(--brand-base)] text-xs font-bold shrink-0">02</span>
              <div>
                Rewards go straight into your <span className="text-[var(--brand-base)] font-bold">reward balance</span> — no transfer needed; they <span className="text-[var(--brand-base)] font-bold">auto-deduct before your main balance</span> on model calls. Withdrawal isn't supported yet.
              </div>
            </div>
            <div className="flex gap-2.5 items-start">
              <span className="mt-0.5 p-1 rounded-md bg-[var(--brand-base)]/10 text-[var(--brand-base)] text-xs font-bold shrink-0">03</span>
              <div>
                Commission has <span className="text-[var(--brand-base)] font-bold">no upper limit</span>. Tiers, rates, and thresholds are configured by the platform and shown on this page.
              </div>
            </div>
            <div className="flex gap-2.5 items-start">
              <span className="mt-0.5 p-1 rounded-md bg-mg-danger/10 text-mg-danger text-xs font-bold shrink-0">04</span>
              <div>
                Same-entity, same-device, same-IP, or abnormal spend gets reviewed; confirmed violations may have rewards frozen or revoked.
              </div>
            </div>
          </div>
        )}
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

      {/* 转入主余额 */}
      <Modal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title={text.transferTitle}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTransferOpen(false)}>
              {text.cancel}
            </Button>
            <Button variant="brand" disabled={!transferValid} onClick={confirmTransfer}>
              {transferValid ? `${text.transferConfirm} ${formatMoney(transferNum)}` : text.transferConfirm}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 py-1">
          {balancePanel(text.transferBalanceLabel)}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-mg-text-2">{text.amountLabel}</label>
            {moneyField(transferAmount, onTransferAmountChange, text.fillAll)}
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── 子表格组件 ──────────────────────────────────────────────

type TextCopy = typeof referralCopy.zh


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
                <TableCell className="text-right font-mono">{formatMoney(inv.totalSpend)}</TableCell>
                <TableCell className="text-right font-mono">{formatMoney(inv.commission)}</TableCell>
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
              <TableCell className="text-right font-mono">{formatMoney(rec.spend)}</TableCell>
              <TableCell className="text-right font-mono">{rec.rate}%</TableCell>
              <TableCell className="text-right font-mono">{formatMoney(rec.amount)}</TableCell>
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
