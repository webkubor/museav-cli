import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCoins, LuTrendingUp, LuUsers, LuWallet, LuSparkles } from 'react-icons/lu'
import { KpiCard } from '@/components/ui/KpiCard'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { Modal } from '@/components/ui/Modal'
import { ReferralInviteCard } from '@/components/referral/ReferralInviteCard'
import { appToast } from '@/lib/app-toast'
import { useAuthStore } from '@/store/auth'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'

import {
  getReferralOverview,
  listReferralInvitees,
  listWithdrawals,
  transferRewardToBalance,
  requestWithdrawal,
} from '@/services/referral'

import {
  referralCopy,
  type ReferralInvitee,
  type ReferralStats,
  type ReferralTier,
  type ReferralWithdrawal,
  type WithdrawalStatus,
} from './referral-data'

// 金额字段为字符串（后端约定），统一在此解析为数字再格式化
const fmt = (n: number | string) => '¥' + Number(n).toLocaleString('zh-CN')

type TabKey = 'invitees' | 'withdrawals'

const WITHDRAWAL_STATUS_VARIANT: Record<WithdrawalStatus, 'warning' | 'success' | 'outline'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'outline',
}

export default function ReferralPage() {
  const { i18n } = useTranslation()
  const text = i18n.language.startsWith('zh') ? referralCopy.zh : referralCopy.en

  // 推荐计划绑定用户「默认（个人）租户」：佣金只入默认租户的奖励余额
  // （qa/ai-quality-platform#96 评审决策），与当前切换的组织无关。
  const tenantId = useAuthStore(
    (s) => s.tenants.find((t) => t.is_default)?.tenant_id ?? s.activeTenantId ?? ''
  )
  const queryClient = useQueryClient()
  const { hasPermission } = usePermissions()
  const canTransfer = hasPermission(PERMS.REFERRAL_REWARD_TRANSFER)
  const canWithdraw = hasPermission(PERMS.REFERRAL_REWARD_WITHDRAW)

  const { data: overview } = useQuery({
    queryKey: ['referral', 'overview', tenantId],
    queryFn: () => getReferralOverview(tenantId),
    enabled: !!tenantId,
  })
  const { data: invitees = [] } = useQuery({
    queryKey: ['referral', 'invitees', tenantId],
    queryFn: () => listReferralInvitees(tenantId),
    enabled: !!tenantId,
  })
  const { data: withdrawalList = [] } = useQuery({
    queryKey: ['referral', 'withdrawals', tenantId],
    queryFn: () => listWithdrawals(tenantId),
    enabled: !!tenantId,
  })

  const emptyStats: ReferralStats = {
    totalCommission: '0',
    monthCommission: '0',
    activeInvited: 0,
    invitedTotal: 0,
    rewardBalance: '0',
  }
  const emptyTier: ReferralTier = {
    name: '—',
    rate: 0,
    cumulativeSpend: '0',
    nextThreshold: '0',
    nextTierName: '',
    nextRate: 0,
  }
  const stats = overview?.stats ?? emptyStats
  const tier = overview?.tier ?? emptyTier
  const inviteLink = overview?.inviteLink ?? ''
  const inviteCode = overview?.inviteCode ?? ''
  const rewardBalance = Number(stats.rewardBalance)

  /** 转出/提现成功后刷新所有受影响的余额与记录视图 */
  const invalidateMoneyViews = () => {
    queryClient.invalidateQueries({ queryKey: ['referral', 'overview', tenantId] })
    queryClient.invalidateQueries({ queryKey: ['referral', 'withdrawals', tenantId] })
    queryClient.invalidateQueries({ queryKey: ['referral', 'reward-records', tenantId] })
    queryClient.invalidateQueries({ queryKey: ['balance', tenantId] })
    queryClient.invalidateQueries({ queryKey: ['balance', 'breakdown', tenantId] })
  }

  const MIN_AMOUNT = 100

  const [activeTab, setActiveTab] = useState<TabKey>('invitees')
  // 稳定幂等键：打开弹窗时生成，确认重试期间复用；金额修改即重铸。
  const [idempotencyKey, setIdempotencyKey] = useState('')

  // 转入主余额弹窗
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferAmount, setTransferAmount] = useState('')

  // 申请提现弹窗
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [payMethod, setPayMethod] = useState<'alipay' | 'bank'>('alipay')
  const [alipayAccount, setAlipayAccount] = useState('')
  const [bankName, setBankName] = useState('')
  const [bankCard, setBankCard] = useState('')
  const [bankHolder, setBankHolder] = useState('')

  const transferNum = Number(transferAmount)
  const transferValid = transferNum >= MIN_AMOUNT && transferNum <= rewardBalance

  const withdrawNum = Number(withdrawAmount)
  const withdrawAmountValid = withdrawNum >= MIN_AMOUNT && withdrawNum <= rewardBalance
  const accountValid =
    payMethod === 'alipay'
      ? alipayAccount.trim().length > 0
      : bankName.trim().length > 0 && bankCard.trim().length > 0 && bankHolder.trim().length > 0
  const withdrawValid = withdrawAmountValid && accountValid

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
  const onWithdrawAmountChange = (v: string) => {
    setIdempotencyKey(crypto.randomUUID())
    setWithdrawAmount(v)
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
      appToast.success(text.transferSuccess.replace('{amount}', fmt(transferNum)))
    },
    onError: (err: Error) => appToast.error(err.message || text.transferFailed),
  })

  const confirmTransfer = () => {
    if (!transferValid || transferMutation.isPending) return
    transferMutation.mutate()
  }

  const handleWithdraw = () => {
    if (rewardBalance < MIN_AMOUNT) {
      appToast.info(text.belowMin)
      return
    }
    setIdempotencyKey(crypto.randomUUID())
    setWithdrawAmount(String(rewardBalance))
    setPayMethod('alipay')
    setAlipayAccount('')
    setBankName('')
    setBankCard('')
    setBankHolder('')
    setWithdrawOpen(true)
  }

  const withdrawMutation = useMutation({
    mutationFn: () =>
      requestWithdrawal(tenantId, {
        amount: String(withdrawNum),
        method: payMethod,
        idempotency_key: idempotencyKey,
        alipay_account: payMethod === 'alipay' ? alipayAccount.trim() : undefined,
        bank_name: payMethod === 'bank' ? bankName.trim() : undefined,
        bank_card: payMethod === 'bank' ? bankCard.trim() : undefined,
        bank_holder: payMethod === 'bank' ? bankHolder.trim() : undefined,
      }),
    onSuccess: () => {
      invalidateMoneyViews()
      setWithdrawOpen(false)
      setActiveTab('withdrawals')
      appToast.success(text.withdrawSuccess)
    },
    onError: (err: Error) => appToast.error(err.message || text.withdrawFailed),
  })

  const submitWithdraw = () => {
    if (!withdrawValid || withdrawMutation.isPending) return
    withdrawMutation.mutate()
  }

  const moneyField = (value: string, onChange: (v: string) => void) => (
    <div className="flex items-center rounded-lg border border-mg-border bg-mg-fill-0 px-3 focus-within:border-brand-base">
      <span className="mr-1 text-sm text-mg-text-2">¥</span>
      <input
        type="number"
        min={MIN_AMOUNT}
        max={rewardBalance}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 bg-transparent py-2 font-mono text-sm text-mg-text-0 outline-none"
      />
    </div>
  )

  // 顶级档位时后端返回空 nextTierName（无下一档），隐藏升级进度文案。
  const hasNextTier = !!tier.nextTierName
  const remain = hasNextTier
    ? Math.max(0, Number(tier.nextThreshold) - Number(tier.cumulativeSpend))
    : 0

  const tierProgressText = hasNextTier
    ? text.tierProgress
        .replace('{cur}', fmt(tier.cumulativeSpend))
        .replace('{target}', fmt(tier.nextThreshold))
    : text.tierProgress.replace('{cur}', fmt(tier.cumulativeSpend)).replace('{target}', '—')

  const tierUpgradeText = hasNextTier
    ? text.tierUpgrade
        .replace('{remain}', fmt(remain))
        .replace('{nextTier}', tier.nextTierName)
        .replace('{nextRate}', String(tier.nextRate))
    : ''

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'invitees', label: text.tabInvitees },
    { key: 'withdrawals', label: text.tabWithdrawals },
  ]

  const isZh = i18n.language.startsWith('zh')
  const referralMilestones = [
    { value: 10000, label: isZh ? '普通伙伴' : 'Partner', subLabel: isZh ? '10% 返佣' : '10% Comm.' },
    { value: 50000, label: isZh ? '核心伙伴' : 'Core Partner', subLabel: isZh ? '13% 返佣' : '13% Comm.' },
    { value: 200000, label: isZh ? '战略伙伴' : 'Strategic Partner', subLabel: isZh ? '15% 返佣' : '15% Comm.' },
  ]

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 页头 */}
      <div>
        <h1 className="text-xl font-bold text-mg-text-0">{text.title}</h1>
        <p className="mt-1 text-sm text-mg-text-2">{text.desc}</p>
      </div>

      {/* KPI 行 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <KpiCard
          title={text.kpiTotalCommission}
          value={fmt(stats.totalCommission)}
          icon={<LuCoins size={16} />}
          color="var(--brand-base)"
          glowColor="var(--brand-glow)"
        />
        <KpiCard
          title={text.kpiMonthCommission}
          value={fmt(stats.monthCommission)}
          icon={<LuTrendingUp size={16} />}
          color="var(--brand-base)"
          glowColor="var(--brand-glow)"
        />
        <KpiCard
          title={text.kpiActive}
          value={`${stats.invitedTotal}`}
          icon={<LuUsers size={16} />}
          color="var(--brand-base)"
          glowColor="var(--brand-glow)"
        />

        {/* 奖励余额卡（自定义，含按钮） */}
        <div className="rounded-2xl border border-mg-border bg-card-bg p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-mg-text-2 tracking-wide">
              {text.kpiRewardBalance}
            </span>
            <div
              className="p-2 rounded-xl shrink-0"
              style={{ backgroundColor: 'var(--brand-glow)', color: 'var(--brand-base)' }}
            >
              <LuWallet size={16} />
            </div>
          </div>
          <span
            className="text-[28px] font-bold tracking-tight font-mono"
            style={{ color: 'var(--brand-base)', fontVariantNumeric: 'tabular-nums' }}
          >
            {fmt(rewardBalance)}
          </span>
          <div className="flex gap-2 mt-auto">
            {canTransfer && (
              <Button variant="brand" size="sm" disabled={rewardBalance <= 0} onClick={handleTransfer}>
                {text.transferToBalance}
              </Button>
            )}
            {canWithdraw && (
              <Button variant="outline" size="sm" onClick={handleWithdraw}>
                {text.requestWithdrawal}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 邀请区 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ReferralInviteCard
          inviteLink={inviteLink}
          inviteCode={inviteCode}
          inviteLinkLabel={text.inviteLinkLabel}
          inviteCodeLabel={text.inviteCodeLabel}
          inviteHint={text.inviteHint}
          copySuccess={text.copySuccess}
        />

        {/* 档位卡 */}
        <div className="rounded-2xl border border-mg-border bg-card-bg p-5 space-y-4">
          <p className="text-sm font-bold text-mg-text-0">{text.tierLabel}</p>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: 'var(--brand-base)' }}>
              {tier.name}
            </span>
            <span className="text-xs text-mg-text-2">·</span>
            <span className="text-sm font-bold" style={{ color: 'var(--brand-base)' }}>
              {tier.rate}%
            </span>
          </div>

          {/* 进度条 */}
          <div className="pt-2 pb-6">
            <ProgressBar
              value={Number(tier.cumulativeSpend)}
              min={0}
              max={250000}
              variant="rainbow"
              size="sm"
              showGlow={true}
              milestones={referralMilestones}
              milestoneLayout="bottom"
            />
            <div className="mt-8 space-y-1">
              <p className="text-xs text-mg-text-2 font-medium">{tierProgressText}</p>
              {tierUpgradeText && (
                <p className="text-xs text-mg-text-2 font-medium">{tierUpgradeText}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 分润规则 */}
      <div className="rounded-xl border border-[var(--brand-base)]/15 bg-gradient-to-r from-[var(--brand-base)]/5 to-transparent p-5 space-y-3.5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--brand-base)]">
          <LuSparkles size={15} className="animate-pulse" />
          <span>{text.rulesTitle}</span>
        </div>
        {isZh ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-mg-text-2 leading-relaxed">
            <div className="flex gap-2.5 items-start">
              <span className="mt-0.5 p-1 rounded-md bg-[var(--brand-base)]/10 text-[var(--brand-base)] text-[10px] font-bold shrink-0">01</span>
              <div>
                被邀请人每次实际付费消费<span className="text-[var(--brand-base)] font-bold">实时计返佣</span>（退款冲回、赠送/兑换码额度消费不计），按当前档位比例结算至奖励余额。
              </div>
            </div>
            <div className="flex gap-2.5 items-start">
              <span className="mt-0.5 p-1 rounded-md bg-[var(--brand-base)]/10 text-[var(--brand-base)] text-[10px] font-bold shrink-0">02</span>
              <div>
                奖励余额<span className="text-[var(--brand-base)] font-bold">满 ¥100</span> 可<span className="text-[var(--brand-base)] font-bold">转入主余额</span>继续消费，或申请提现（运营审核后人工线下打款）。
              </div>
            </div>
            <div className="flex gap-2.5 items-start">
              <span className="mt-0.5 p-1 rounded-md bg-[var(--brand-base)]/10 text-[var(--brand-base)] text-[10px] font-bold shrink-0">03</span>
              <div>
                返佣<span className="text-[var(--brand-base)] font-bold">上不封顶</span>；返佣档位、比例、门槛由平台统一配置。
              </div>
            </div>
            <div className="flex gap-2.5 items-start">
              <span className="mt-0.5 p-1 rounded-md bg-rose-500/10 text-rose-500 text-[10px] font-bold shrink-0">04</span>
              <div>
                平台对同主体 / 同 IP·设备 / 异常刷量保留核查与冻结权，保障返佣生态公平合规。
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-mg-text-2 leading-relaxed">
            <div className="flex gap-2.5 items-start">
              <span className="mt-0.5 p-1 rounded-md bg-[var(--brand-base)]/10 text-[var(--brand-base)] text-[10px] font-bold shrink-0">01</span>
              <div>
                Commission accrues in <span className="text-[var(--brand-base)] font-bold">real time</span> on actual paid spend (refunds clawed back; gifted/promo codes excluded), settled at your tier rate.
              </div>
            </div>
            <div className="flex gap-2.5 items-start">
              <span className="mt-0.5 p-1 rounded-md bg-[var(--brand-base)]/10 text-[var(--brand-base)] text-[10px] font-bold shrink-0">02</span>
              <div>
                Reward balance <span className="text-[var(--brand-base)] font-bold">reaches ¥100</span> can be <span className="text-[var(--brand-base)] font-bold">transferred to main balance</span> or withdrawn.
              </div>
            </div>
            <div className="flex gap-2.5 items-start">
              <span className="mt-0.5 p-1 rounded-md bg-[var(--brand-base)]/10 text-[var(--brand-base)] text-[10px] font-bold shrink-0">03</span>
              <div>
                Commission has <span className="text-[var(--brand-base)] font-bold">no upper limit</span>. Tiers, rates, and thresholds are configured by the platform.
              </div>
            </div>
            <div className="flex gap-2.5 items-start">
              <span className="mt-0.5 p-1 rounded-md bg-rose-500/10 text-rose-500 text-[10px] font-bold shrink-0">04</span>
              <div>
                The platform reserves the right to audit and freeze same-entity / same-IP / abnormal farming activities.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 三 Tab */}
      <div className="rounded-2xl border border-mg-border bg-card-bg overflow-hidden">
        {/* Tab 导航 */}
        <div className="border-b border-mg-border/60 flex gap-6 px-5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 pt-4 font-bold transition-all border-b-2 cursor-pointer bg-transparent border-none text-xs ${
                activeTab === tab.key
                  ? 'border-brand-base text-brand-base'
                  : 'border-transparent text-mg-text-2 hover:text-mg-text-0'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 内容 */}
        <div>
          {activeTab === 'invitees' && (
            <InviteesTable invitees={invitees} text={text} />
          )}
          {activeTab === 'withdrawals' && (
            <WithdrawalsTable withdrawals={withdrawalList} text={text} />
          )}
        </div>
      </div>

      {/* 转入主余额 */}
      <Modal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title={text.transferTitle}
        size="sm"
        footer={
          <Button variant="brand" disabled={!transferValid} onClick={confirmTransfer}>
            {text.transferConfirm}
          </Button>
        }
      >
        <div className="space-y-3 py-1">
          <p className="text-xs text-mg-text-2">
            {text.transferModalHint.replace('{balance}', fmt(rewardBalance))}
          </p>
          {moneyField(transferAmount, onTransferAmountChange)}
        </div>
      </Modal>

      {/* 申请提现 */}
      <Modal
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        title={text.withdrawTitle}
        size="sm"
        footer={
          <Button variant="brand" disabled={!withdrawValid} onClick={submitWithdraw}>
            {text.withdrawSubmit}
          </Button>
        }
      >
        <div className="space-y-4 py-1">
          <p className="text-xs text-mg-text-2">
            {text.withdrawModalHint.replace('{balance}', fmt(rewardBalance))}
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-mg-text-1">{text.withdrawAmountLabel}</label>
            {moneyField(withdrawAmount, onWithdrawAmountChange)}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-mg-text-1">{text.withdrawMethodLabel}</label>
            <div className="flex gap-2">
              {(['alipay', 'bank'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPayMethod(m)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                    payMethod === m
                      ? 'border-brand-base text-brand-base bg-[var(--brand-base)]/5'
                      : 'border-mg-border text-mg-text-1 hover:text-mg-text-0'
                  }`}
                >
                  {m === 'alipay' ? text.methodAlipay : text.methodBank}
                </button>
              ))}
            </div>

            {payMethod === 'alipay' ? (
              <input
                value={alipayAccount}
                onChange={(e) => setAlipayAccount(e.target.value)}
                placeholder={text.alipayPlaceholder}
                className="w-full rounded-lg border border-mg-border bg-mg-fill-0 px-3 py-2 text-sm text-mg-text-0 outline-none placeholder:text-mg-text-2 focus:border-brand-base"
              />
            ) : (
              <div className="space-y-2">
                <input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder={text.bankNamePlaceholder}
                  className="w-full rounded-lg border border-mg-border bg-mg-fill-0 px-3 py-2 text-sm text-mg-text-0 outline-none placeholder:text-mg-text-2 focus:border-brand-base"
                />
                <input
                  value={bankCard}
                  onChange={(e) => setBankCard(e.target.value)}
                  placeholder={text.bankCardPlaceholder}
                  className="w-full rounded-lg border border-mg-border bg-mg-fill-0 px-3 py-2 font-mono text-sm text-mg-text-0 outline-none placeholder:text-mg-text-2 focus:border-brand-base"
                />
                <input
                  value={bankHolder}
                  onChange={(e) => setBankHolder(e.target.value)}
                  placeholder={text.bankHolderPlaceholder}
                  className="w-full rounded-lg border border-mg-border bg-mg-fill-0 px-3 py-2 text-sm text-mg-text-0 outline-none placeholder:text-mg-text-2 focus:border-brand-base"
                />
              </div>
            )}
          </div>

          <p className="text-xs leading-relaxed text-mg-text-2">{text.withdrawNote}</p>
        </div>
      </Modal>
    </div>
  )
}

// ── 子表格组件 ──────────────────────────────────────────────

type TextCopy = typeof referralCopy.zh

function InviteesTable({ invitees, text }: { invitees: ReferralInvitee[]; text: TextCopy }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{text.colInvitee}</TableHead>
          <TableHead>{text.colRegisteredAt}</TableHead>
          <TableHead className="text-right">{text.colTotalSpend}</TableHead>
          <TableHead className="text-right">{text.colCommission}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invitees.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="text-center text-mg-text-2 py-8">
              {text.empty}
            </TableCell>
          </TableRow>
        ) : (
          invitees.map((inv) => (
            <TableRow key={`${inv.email}-${inv.registeredAt}`}>
              <TableCell>
                <div className="font-medium text-mg-text-0">{inv.name}</div>
                <div className="text-[11px] text-mg-text-2 mt-0.5">{inv.email}</div>
              </TableCell>
              <TableCell>{inv.registeredAt}</TableCell>
              <TableCell className="text-right font-mono">{fmt(inv.totalSpend)}</TableCell>
              <TableCell className="text-right font-mono">{fmt(inv.commission)}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}

function WithdrawalsTable({
  withdrawals,
  text,
}: {
  withdrawals: ReferralWithdrawal[]
  text: TextCopy
}) {
  const statusLabel: Record<WithdrawalStatus, string> = {
    pending: text.statusPending,
    approved: text.statusApproved,
    rejected: text.statusRejected,
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{text.colAppliedAt}</TableHead>
          <TableHead className="text-right">{text.colWithdrawAmount}</TableHead>
          <TableHead>{text.colStatus}</TableHead>
          <TableHead>{text.colPaidAt}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {withdrawals.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="text-center text-mg-text-2 py-8">
              {text.empty}
            </TableCell>
          </TableRow>
        ) : (
          withdrawals.map((w) => (
            <TableRow key={`${w.appliedAt}-${w.amount}-${w.status}`}>
              <TableCell>{w.appliedAt}</TableCell>
              <TableCell className="text-right font-mono">{fmt(w.amount)}</TableCell>
              <TableCell>
                <Badge variant={WITHDRAWAL_STATUS_VARIANT[w.status]}>
                  {statusLabel[w.status]}
                </Badge>
              </TableCell>
              <TableCell>{w.paidAt ?? text.notYet}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}
