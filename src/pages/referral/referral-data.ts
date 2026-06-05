/**
 * 推荐计划（消费分润）静态数据与文案。
 * V1.1 净新增模块，后端接口未就绪：先用本地 mock 出可评审 UI，
 * 接口就绪后改为 services/referral.ts 拉取，页面消费同样的类型。
 */

// 金额字段统一为 string（与后端一致：后端金额返回字符串，前端按需 Number() 解析）
export interface ReferralStats {
  /** 累计返佣 */
  totalCommission: string
  /** 本月返佣 */
  monthCommission: string
  /** 活跃被邀请人数 */
  activeInvited: number
  /** 已邀请总数 */
  invitedTotal: number
  /** 奖励余额（可转入主余额 / 提现） */
  rewardBalance: string
}

export interface ReferralTier {
  /** 当前档位名 */
  name: string
  /** 当前返佣比例（百分比，如 13 表示 13%） */
  rate: number
  /** 当前累计邀请消费 */
  cumulativeSpend: string
  /** 升级到下一档所需的累计邀请消费门槛 */
  nextThreshold: string
  /** 下一档位名 */
  nextTierName: string
  /** 下一档比例（百分比） */
  nextRate: number
}

export interface ReferralInvitee {
  name: string
  email: string
  registeredAt: string
  totalSpend: string
  commission: string
}

export interface ReferralCommissionRecord {
  date: string
  source: string
  spend: string
  /** 结算比例（百分比） */
  rate: number
  amount: string
  /** 结算时的返佣档位 */
  tierName?: string
}

export type WithdrawalStatus = 'pending' | 'approved' | 'rejected'

export interface ReferralWithdrawal {
  appliedAt: string
  amount: string
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
    totalCommission: '5900',
    monthCommission: '980',
    activeInvited: 3,
    invitedTotal: 5,
    rewardBalance: '1420',
  },
  inviteLink: 'https://console.modelgo.com/signup?aff=MG-KEVIN-8F3A',
  inviteCode: 'MG-KEVIN-8F3A',
  tier: {
    name: '核心伙伴',
    rate: 13,
    cumulativeSpend: '59000',
    nextThreshold: '200000',
    nextTierName: '战略伙伴',
    nextRate: 15,
  },
  invitees: [
    { name: '智设科技', email: 'zhi***@zhishe.com', registeredAt: '2024/4/1', totalSpend: '32000', commission: '3200' },
    { name: '云图数据', email: 'ops***@cloudpic.io', registeredAt: '2025/5/1', totalSpend: '18500', commission: '1850' },
    { name: '极光 AI', email: 'dev***@aurora.ai', registeredAt: '2025/5/12', totalSpend: '6400', commission: '640' },
    { name: '微岩信息', email: 'adm***@weiyan.cn', registeredAt: '2024/3/1', totalSpend: '2100', commission: '210' },
    { name: '测试团队 A', email: 'try***@demo.com', registeredAt: '2025/5/8', totalSpend: '0', commission: '0' },
  ],
  commissions: [
    { date: '2025/5/20', source: '智设科技', spend: '4200', rate: 13, amount: '546', tierName: '核心伙伴' },
    { date: '2025/5/18', source: '云图数据', spend: '2600', rate: 13, amount: '338', tierName: '核心伙伴' },
    { date: '2025/5/15', source: '极光 AI', spend: '1800', rate: 13, amount: '234', tierName: '核心伙伴' },
    { date: '2025/5/10', source: '智设科技', spend: '5000', rate: 13, amount: '650', tierName: '核心伙伴' },
    { date: '2025/5/2', source: '微岩信息', spend: '900', rate: 10, amount: '90', tierName: '普通伙伴' },
  ],
  withdrawals: [
    { appliedAt: '2025/5/19', amount: '1000', status: 'approved', paidAt: '2025/5/21' },
    { appliedAt: '2025/5/12', amount: '500', status: 'approved', paidAt: '2025/5/14' },
    { appliedAt: '2025/5/22', amount: '800', status: 'pending', paidAt: null },
    { appliedAt: '2025/4/30', amount: '300', status: 'rejected', paidAt: null },
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
    transferTitle: '返佣转入余额',
    transferModalHint: '可提取 {balance} · 单次≥¥100',
    transferConfirm: '确认转入',
    transferSuccess: '已成功转入 {amount} 到主余额',
    belowMin: '奖励余额需满 ¥100 才可操作',
    withdrawTitle: '申请提现',
    withdrawModalHint: '可提现奖励余额 {balance} · 单次≥¥100',
    withdrawAmountLabel: '提现金额',
    withdrawMethodLabel: '收款方式',
    methodAlipay: '支付宝',
    methodBank: '银行卡',
    alipayPlaceholder: '支付宝账号（手机号 / 邮箱）',
    bankNamePlaceholder: '银行名称（如：招商银行）',
    bankCardPlaceholder: '银行卡号',
    bankHolderPlaceholder: '账户名称（开户人）',
    withdrawNote: '提现申请提交后金额从奖励余额冻结，经运营审核通过后人工线下打款；驳回则退回奖励余额。',
    withdrawSubmit: '提交提现申请',
    withdrawSuccess: '提现申请已提交，等待运营审核',
    transferFailed: '转入失败，请稍后重试',
    withdrawFailed: '提现申请失败，请稍后重试',
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
    colTier: '档位',
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
    transferModalHint: 'Available {balance} · min ¥100 per transfer',
    transferConfirm: 'Confirm Transfer',
    transferSuccess: 'Successfully transferred {amount} to main balance',
    belowMin: 'Reward balance must reach ¥100 to proceed',
    withdrawTitle: 'Request Withdrawal',
    withdrawModalHint: 'Withdrawable reward balance {balance} · min ¥100',
    withdrawAmountLabel: 'Amount',
    withdrawMethodLabel: 'Payout Method',
    methodAlipay: 'Alipay',
    methodBank: 'Bank Card',
    alipayPlaceholder: 'Alipay account (phone / email)',
    bankNamePlaceholder: 'Bank name (e.g. CMB)',
    bankCardPlaceholder: 'Card number',
    bankHolderPlaceholder: 'Account holder name',
    withdrawNote: 'Once submitted, the amount is frozen from your reward balance and paid offline after operations review; rejected requests are returned to your reward balance.',
    withdrawSubmit: 'Submit Request',
    withdrawSuccess: 'Withdrawal request submitted, pending review',
    transferFailed: 'Transfer failed, please retry later',
    withdrawFailed: 'Withdrawal request failed, please retry later',
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
    colTier: 'Tier',
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
