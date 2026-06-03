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
import { appToast } from '@/lib/app-toast'

import {
  referralMock,
  referralCopy,
  type ReferralInvitee,
  type ReferralCommissionRecord,
  type ReferralWithdrawal,
  type WithdrawalStatus,
} from './referral-data'

const fmt = (n: number) => '¥' + n.toLocaleString('zh-CN')

type TabKey = 'invitees' | 'commissions' | 'withdrawals'

const WITHDRAWAL_STATUS_VARIANT: Record<WithdrawalStatus, 'warning' | 'success' | 'outline'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'outline',
}

export default function ReferralPage() {
  const { i18n } = useTranslation()
  const text = i18n.language.startsWith('zh') ? referralCopy.zh : referralCopy.en

  const { stats, inviteLink, inviteCode, tier, invitees, commissions, withdrawals } = referralMock

  const [activeTab, setActiveTab] = useState<TabKey>('invitees')
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteLink)
    appToast.success(text.copySuccess)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleTransfer = () => {
    appToast.info('功能开发中')
  }

  const handleWithdraw = () => {
    appToast.success('已提交申请')
  }

  const remain = tier.nextThreshold - tier.cumulativeSpend

  const tierProgressText = text.tierProgress
    .replace('{cur}', fmt(tier.cumulativeSpend))
    .replace('{target}', fmt(tier.nextThreshold))

  const tierUpgradeText = text.tierUpgrade
    .replace('{remain}', fmt(remain))
    .replace('{nextTier}', tier.nextTierName)
    .replace('{nextRate}', String(tier.nextRate))

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'invitees', label: text.tabInvitees },
    { key: 'commissions', label: text.tabCommissions },
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
          value={`${stats.activeInvited} / ${stats.invitedTotal}`}
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
            {fmt(stats.rewardBalance)}
          </span>
          <div className="flex gap-2 mt-auto">
            <Button variant="brand" size="sm" onClick={handleTransfer}>
              {text.transferToBalance}
            </Button>
            <Button variant="outline" size="sm" onClick={handleWithdraw}>
              {text.requestWithdrawal}
            </Button>
          </div>
        </div>
      </div>

      {/* 邀请区 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 邀请链接卡 */}
        <div className="rounded-2xl border border-mg-border bg-card-bg p-5 space-y-4">
          <p className="text-sm font-bold text-mg-text-0">{text.inviteLinkLabel}</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={inviteLink}
              className="flex-1 min-w-0 rounded-lg border border-mg-border bg-mg-fill-0 px-3 py-2 text-xs text-mg-text-1 font-mono outline-none"
            />
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? text.copied : text.copy}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-mg-text-2">{text.inviteCodeLabel}</span>
            <span className="rounded-md border border-mg-border bg-mg-fill-0 px-2 py-0.5 text-xs font-mono text-mg-text-0 tracking-widest">
              {inviteCode}
            </span>
          </div>
          <p className="text-xs text-mg-text-2 leading-relaxed">{text.inviteHint}</p>
        </div>

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
              value={tier.cumulativeSpend}
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
              <p className="text-xs text-mg-text-2 font-medium">{tierUpgradeText}</p>
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
          {activeTab === 'commissions' && (
            <CommissionsTable commissions={commissions} text={text} />
          )}
          {activeTab === 'withdrawals' && (
            <WithdrawalsTable withdrawals={withdrawals} text={text} />
          )}
        </div>
      </div>
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
          invitees.map((inv, i) => (
            <TableRow key={i}>
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

function CommissionsTable({
  commissions,
  text,
}: {
  commissions: ReferralCommissionRecord[]
  text: TextCopy
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{text.colDate}</TableHead>
          <TableHead>{text.colInvitee}</TableHead>
          <TableHead className="text-right">{text.colSpend}</TableHead>
          <TableHead className="text-right">{text.colRate}</TableHead>
          <TableHead className="text-right">{text.colAmount}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {commissions.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-mg-text-2 py-8">
              {text.empty}
            </TableCell>
          </TableRow>
        ) : (
          commissions.map((rec, i) => (
            <TableRow key={i}>
              <TableCell>{rec.date}</TableCell>
              <TableCell>{rec.source}</TableCell>
              <TableCell className="text-right font-mono">{fmt(rec.spend)}</TableCell>
              <TableCell className="text-right">{rec.rate}%</TableCell>
              <TableCell className="text-right font-mono">{fmt(rec.amount)}</TableCell>
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
          withdrawals.map((w, i) => (
            <TableRow key={i}>
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
