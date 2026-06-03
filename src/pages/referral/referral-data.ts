/**
 * 推荐计划（消费分润）静态数据与文案。
 * V1.1 净新增模块，后端接口未就绪：先用本地 mock 出可评审 UI，
 * 接口就绪后改为 services/referral.ts 拉取，页面消费同样的类型。
 */

export interface ReferralStats {
  /** 累计返佣 */
  totalCommission: number
  /** 本月返佣 */
  monthCommission: number
  /** 活跃被邀请人数 */
  activeInvited: number
  /** 已邀请总数 */
  invitedTotal: number
  /** 奖励余额（可转入主余额 / 提现） */
  rewardBalance: number
}

export interface ReferralTier {
  /** 当前档位名 */
  name: string
  /** 当前返佣比例（百分比，如 13 表示 13%） */
  rate: number
  /** 当前累计邀请消费 */
  cumulativeSpend: number
  /** 升级到下一档所需的累计邀请消费门槛 */
  nextThreshold: number
  /** 下一档位名 */
  nextTierName: string
  /** 下一档比例（百分比） */
  nextRate: number
}

export interface ReferralInvitee {
  name: string
  email: string
  registeredAt: string
  totalSpend: number
  commission: number
}

export interface ReferralCommissionRecord {
  date: string
  source: string
  spend: number
  /** 结算比例（百分比） */
  rate: number
  amount: number
}

export type WithdrawalStatus = 'pending' | 'approved' | 'rejected'

export interface ReferralWithdrawal {
  appliedAt: string
  amount: number
  status: WithdrawalStatus
  paidAt: string | null
}

export interface ReferralData {
  stats: ReferralStats
  inviteLink: string
  inviteCode: string
  tier: ReferralTier
  invitees: ReferralInvitee[]
  commissions: ReferralCommissionRecord[]
  withdrawals: ReferralWithdrawal[]
}

/** 静态演示数据（对齐原型 #/console/referral） */
export const referralMock: ReferralData = {
  stats: {
    totalCommission: 5900,
    monthCommission: 980,
    activeInvited: 3,
    invitedTotal: 5,
    rewardBalance: 1420,
  },
  inviteLink: 'https://console.modelgo.com/signup?aff=MG-KEVIN-8F3A',
  inviteCode: 'MG-KEVIN-8F3A',
  tier: {
    name: '核心伙伴',
    rate: 13,
    cumulativeSpend: 59000,
    nextThreshold: 200000,
    nextTierName: '战略伙伴',
    nextRate: 15,
  },
  invitees: [
    { name: '智设科技', email: 'zhi***@zhishe.com', registeredAt: '2024/4/1', totalSpend: 32000, commission: 3200 },
    { name: '云图数据', email: 'ops***@cloudpic.io', registeredAt: '2025/5/1', totalSpend: 18500, commission: 1850 },
    { name: '极光 AI', email: 'dev***@aurora.ai', registeredAt: '2025/5/12', totalSpend: 6400, commission: 640 },
    { name: '微岩信息', email: 'adm***@weiyan.cn', registeredAt: '2024/3/1', totalSpend: 2100, commission: 210 },
    { name: '测试团队 A', email: 'try***@demo.com', registeredAt: '2025/5/8', totalSpend: 0, commission: 0 },
  ],
  commissions: [
    { date: '2025/5/20', source: '智设科技', spend: 4200, rate: 13, amount: 546 },
    { date: '2025/5/18', source: '云图数据', spend: 2600, rate: 13, amount: 338 },
    { date: '2025/5/15', source: '极光 AI', spend: 1800, rate: 13, amount: 234 },
    { date: '2025/5/10', source: '智设科技', spend: 5000, rate: 13, amount: 650 },
    { date: '2025/5/2', source: '微岩信息', spend: 900, rate: 10, amount: 90 },
  ],
  withdrawals: [
    { appliedAt: '2025/5/19', amount: 1000, status: 'approved', paidAt: '2025/5/21' },
    { appliedAt: '2025/5/12', amount: 500, status: 'approved', paidAt: '2025/5/14' },
    { appliedAt: '2025/5/22', amount: 800, status: 'pending', paidAt: null },
    { appliedAt: '2025/4/30', amount: 300, status: 'rejected', paidAt: null },
  ],
}

export const referralCopy = {
  zh: {
    title: '推荐计划',
    desc: '邀请企业/团队加入 ModelGo，按其实际消费持续返佣（消费分润），返佣比例随业绩阶梯提升。',
    kpiTotalCommission: '累计返佣',
    kpiMonthCommission: '本月返佣',
    kpiActive: '已邀请',
    kpiRewardBalance: '奖励余额（可转入主余额）',
    transferToBalance: '转入主余额',
    requestWithdrawal: '申请提现',
    transferTitle: '转入主余额',
    transferHint: '将奖励余额 {amount} 全部转入主余额？转入后可用于 API 调用消费，且不可再申请提现。',
    transferSuccess: '已成功转入 {amount} 到主余额',
    transferConfirm: '确认转入',
    transferCancel: '取消',
    noRewardBalance: '暂无可转入的奖励余额',
    inviteLinkLabel: '我的专属邀请链接',
    copy: '复制',
    copied: '已复制',
    copySuccess: '邀请链接已复制',
    inviteCodeLabel: '邀请码',
    inviteHint: '被邀请人通过此链接注册，其后续消费的返佣自动归属你。',
    tierLabel: '返佣档位',
    /** 模板：再邀请 ¥{remain} 升级 {nextTier}（{nextRate}%） */
    tierUpgrade: '再邀请 {remain} 升级 {nextTier}（{nextRate}%）',
    tierProgress: '累计邀请消费 {cur} / {target}',
    rulesTitle: '分润规则：',
    rules: '被邀请人每次实际付费消费实时计返佣（退款冲回、赠送/兑换码额度消费不计），按当前档位比例结算至奖励余额；奖励余额满 ¥100 可转入主余额继续消费，或申请提现（运营审核后人工线下打款）。返佣不封顶；平台对同主体 / 同 IP·设备 / 异常刷量保留核查与冻结权。返佣档位、比例、门槛由平台统一配置。',
    tabInvitees: '被邀请人',
    tabCommissions: '返佣流水',
    tabWithdrawals: '提现记录',
    colInvitee: '被邀请人',
    colRegisteredAt: '注册时间',
    colTotalSpend: '累计消费',
    colCommission: '我的返佣',
    colDate: '日期',
    colSpend: '消费',
    colRate: '比例',
    colAmount: '返佣',
    colAppliedAt: '申请时间',
    colWithdrawAmount: '金额',
    colStatus: '状态',
    colPaidAt: '到账时间',
    statusPending: '审核中',
    statusApproved: '已打款',
    statusRejected: '已驳回',
    notYet: '—',
    empty: '暂无记录',
  },
  en: {
    title: 'Referral Program',
    desc: 'Invite teams to ModelGo and earn ongoing commission on their actual spend; rates rise with performance tiers.',
    kpiTotalCommission: 'Total Commission',
    kpiMonthCommission: 'This Month',
    kpiActive: 'Invited',
    kpiRewardBalance: 'Reward Balance (transferable)',
    transferToBalance: 'To Main Balance',
    requestWithdrawal: 'Withdraw',
    transferTitle: 'Transfer to Main Balance',
    transferHint: 'Transfer the full reward balance {amount} to your main balance? It can then be used for API usage and is no longer withdrawable.',
    transferSuccess: 'Successfully transferred {amount} to main balance',
    transferConfirm: 'Confirm Transfer',
    transferCancel: 'Cancel',
    noRewardBalance: 'No reward balance available to transfer',
    inviteLinkLabel: 'My Referral Link',
    copy: 'Copy',
    copied: 'Copied',
    copySuccess: 'Referral link copied',
    inviteCodeLabel: 'Invite Code',
    inviteHint: 'When someone signs up via your link, their future spend commission is attributed to you.',
    tierLabel: 'Commission Tier',
    tierUpgrade: 'Invite {remain} more to reach {nextTier} ({nextRate}%)',
    tierProgress: 'Invited spend {cur} / {target}',
    rulesTitle: 'Commission rules: ',
    rules: 'Commission accrues in real time on each actual paid spend (refunds are clawed back; gifted/redeemed credits excluded), settled to your reward balance at the current tier rate. Once the reward balance reaches ¥100 it can be transferred to your main balance or withdrawn (paid offline after operations review). No cap; the platform reserves the right to audit and freeze same-entity / same-IP·device / abnormal farming. Tiers, rates and thresholds are configured by the platform.',
    tabInvitees: 'Invitees',
    tabCommissions: 'Commission Log',
    tabWithdrawals: 'Withdrawals',
    colInvitee: 'Invitee',
    colRegisteredAt: 'Registered',
    colTotalSpend: 'Total Spend',
    colCommission: 'My Commission',
    colDate: 'Date',
    colSpend: 'Spend',
    colRate: 'Rate',
    colAmount: 'Commission',
    colAppliedAt: 'Applied',
    colWithdrawAmount: 'Amount',
    colStatus: 'Status',
    colPaidAt: 'Paid At',
    statusPending: 'Reviewing',
    statusApproved: 'Paid',
    statusRejected: 'Rejected',
    notYet: '—',
    empty: 'No records',
  },
}
