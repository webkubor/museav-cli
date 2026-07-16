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
  /** 今日返佣 */
  todayCommission: string
  /** 活跃被邀请人数 */
  activeInvited: number
  /** 已邀请总数 */
  invitedTotal: number
  /** 奖励余额（可转入主余额） */
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
  /** 该被邀请人自身累计消费对应的当前档位名 */
  currentTier?: string
  /** 后端当前推荐字段：该被邀请租户当前档位名 */
  tierName?: string
  /** 兼容后端阶段性 snake_case 字段 */
  tier_name?: string
  /** 后端当前推荐字段：当前档位返佣比例（百分比，如 13 表示 13%） */
  tierRate?: number
  /** 兼容后端阶段性 snake_case 字段 */
  tier_rate?: number
  /** 返佣窗口截止日期（ISO date string，如 "2026-09-15"），由后端按注册日 + N 天计算 */
  windowExpireAt?: string
  commissionWindowEnd?: string
  commission_window_end?: string
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

export interface ReferralData {
  stats: ReferralStats
  inviteLink: string
  inviteCode: string
  tier: ReferralTier
  invitees: ReferralInvitee[]
  commissions: ReferralCommissionRecord[]
}
export const referralCopy = {
  zh: {
    title: '推荐计划',
    desc: '邀请企业/团队加入 ModelGo，按其实际消费持续返佣（消费分润），返佣比例随业绩阶梯提升。',
    kpiTotalCommission: '累计返佣',
    kpiMonthCommission: '本月返佣',
    kpiTodayCommission: '今日返佣',
    kpiActive: '活跃 / 已邀请',
    kpiRewardBalance: '奖励余额（可转入主余额）',
    transferToBalance: '转入主余额',
    transferTitle: '返佣转入余额',
    transferModalHint: '可提取 {balance} · 单次≥¥100',
    transferConfirm: '确认转入',
    transferBalanceLabel: '可转入奖励余额',
    ruleMin: '单次 ≥ ¥100',
    amountLabel: '转入金额',
    fillAll: '全部转入',
    errTooLow: '单次最低 ¥100',
    errExceed: '超出可用奖励余额',
    cancel: '取消',
    transferSuccess: '已成功转入 {amount} 到主余额',
    belowMin: '奖励余额需满 ¥100 才可操作',
    transferFailed: '转入失败，请稍后重试',
    inviteLinkLabel: '我的专属邀请链接',
    copy: '复制',
    copied: '已复制',
    copySuccess: '邀请链接已复制',
    copyCodeSuccess: '邀请码已复制',
    inviteCodeLabel: '邀请码',
    inviteHint: '被邀请人通过此链接注册，其后续消费的返佣自动归属你。',
    inviteRealtimeLabel: '实时计返佣',
    inviteBalanceLabel: '满 ¥100 可转入余额',
    inviteRulesLink: '查看分润规则',
    tierLabel: '返佣档位',
    tierTableLabel: '返佣档位阶梯',
    tierTableHint: '按被邀请人各自消费定档',
    /** 模板：再邀请 ¥{remain} 升级 {nextTier}（{nextRate}%） */
    tierUpgrade: '再邀请 {remain} 升级 {nextTier}（{nextRate}%）',
    tierProgress: '累计邀请消费 {cur} / {target}',
    rulesTitle: '分润规则：',
    rules: '被邀请人每次实际付费消费实时计返佣（退款冲回、赠送/兑换码额度消费不计），按当前档位比例结算至奖励余额；奖励余额满 ¥100 可转入主余额继续消费，或申请提现（运营审核后人工线下打款）。返佣不封顶；平台对同主体 / 同 IP·设备 / 异常刷量保留核查与冻结权。返佣档位、比例、门槛由平台统一配置。',
    tabInvitees: '被邀请人',
    tabCommissions: '返佣流水',
    colInvitee: '被邀请人',
    colRegisteredAt: '注册时间',
    colTotalSpend: '累计消费',
    colCommission: '返佣合计',
    colCurrentTier: '当前档位',
    colWindow: '返佣窗口',
    colDate: '日期',
    colSpend: '消费',
    colRate: '比例',
    colTier: '档位',
    colAmount: '返佣',
    notYet: '—',
    empty: '暂无记录',
    gateTitle: '充值后开通推荐返佣',
    gateDesc: '首次充值任意金额后，立即解锁专属邀请链接与实时返佣资格。',
    gateCta: '去充值',
    gateInviteePlaceholder: '充值后开通，被邀请人记录将在此显示',
  },
  en: {
    title: 'Referral Program',
    desc: 'Invite teams to ModelGo and earn ongoing commission on their actual spend; rates rise with performance tiers.',
    kpiTotalCommission: 'Total Commission',
    kpiMonthCommission: 'This Month',
    kpiTodayCommission: 'Today',
    kpiActive: 'Active / Invited',
    kpiRewardBalance: 'Reward Balance (transferable)',
    transferToBalance: 'To Main Balance',
    transferTitle: 'Transfer to Main Balance',
    transferModalHint: 'Available {balance} · min ¥100 per transfer',
    transferConfirm: 'Confirm Transfer',
    transferBalanceLabel: 'Transferable reward balance',
    ruleMin: 'Min ¥100 per request',
    amountLabel: 'Amount',
    fillAll: 'Max',
    errTooLow: 'Minimum ¥100 per request',
    errExceed: 'Exceeds available balance',
    cancel: 'Cancel',
    transferSuccess: 'Successfully transferred {amount} to main balance',
    belowMin: 'Reward balance must reach ¥100 to proceed',
    transferFailed: 'Transfer failed, please retry later',
    inviteLinkLabel: 'My Referral Link',
    copy: 'Copy',
    copied: 'Copied',
    copySuccess: 'Referral link copied',
    copyCodeSuccess: 'Invite code copied',
    inviteCodeLabel: 'Invite Code',
    inviteHint: 'When someone signs up via your link, their future spend commission is attributed to you.',
    inviteRealtimeLabel: 'Real-time commission',
    inviteBalanceLabel: 'Transfer at ¥100',
    inviteRulesLink: 'View rules',
    tierLabel: 'Commission Tier',
    tierTableLabel: 'Commission Tiers',
    tierTableHint: 'Per-invitee spend determines tier',
    tierUpgrade: 'Invite {remain} more to reach {nextTier} ({nextRate}%)',
    tierProgress: 'Invited spend {cur} / {target}',
    rulesTitle: 'Commission rules: ',
    rules: 'Commission accrues in real time on each actual paid spend (refunds are clawed back; gifted/redeemed credits excluded), settled to your reward balance at the current tier rate. Once the reward balance reaches ¥100 it can be transferred to your main balance or withdrawn (paid offline after operations review). No cap; the platform reserves the right to audit and freeze same-entity / same-IP·device / abnormal farming. Tiers, rates and thresholds are configured by the platform.',
    tabInvitees: 'Invitees',
    tabCommissions: 'Commission Log',
    colInvitee: 'Invitee',
    colRegisteredAt: 'Registered',
    colTotalSpend: 'Total Spend',
    colCommission: 'Commission',
    colCurrentTier: 'Tier',
    colWindow: 'Window',
    colDate: 'Date',
    colSpend: 'Spend',
    colRate: 'Rate',
    colTier: 'Tier',
    colAmount: 'Commission',
    notYet: '—',
    empty: 'No records',
    gateTitle: 'Unlock referral program',
    gateDesc: 'Make your first top-up to unlock your personal referral link and start earning real-time commission.',
    gateCta: 'Top up now',
    gateInviteePlaceholder: 'Unlock with your first top-up to see invitee records here',
  },
}
