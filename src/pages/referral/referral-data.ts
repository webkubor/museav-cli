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
  /** 奖励余额（PRD 1.0.4 §8.1：不出现转入操作暗示，调用时在主余额前自动抵扣） */
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
