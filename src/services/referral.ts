/**
 * 推荐计划 / 消费分润（净新增模块）
 * 路由：/tenants/:tenantId/referral/...
 *
 * ⚠️ 当前后端接口未就绪：DEV 环境返回本地 mock（referralMock）以驱动可评审 UI。
 * 后端按本文件的「请求/响应类型 + 路径」补全 web-api 后，移除 isMock 分支即可切真实接口。
 */
import { get, post } from '@/lib/request'
import {
  referralMock,
  type ReferralStats,
  type ReferralTier,
  type ReferralInvitee,
  type ReferralCommissionRecord,
  type ReferralWithdrawal,
} from '@/pages/referral/referral-data'

/** DEV 兜底开关：后端就绪后移除此守卫即可切真实接口 */
const isMock = () => import.meta.env.DEV

// ─── 响应/请求类型（即后端需对齐的契约） ───────────────────────────────────

/** 推荐计划总览：KPI 统计 + 当前档位 + 专属邀请信息 */
export interface ReferralOverview {
  stats: ReferralStats
  tier: ReferralTier
  inviteLink: string
  inviteCode: string
}

/** 奖励余额转入主余额 */
export interface TransferRewardRequest {
  /** 转入金额，单次 ≥100，且不超过当前奖励余额 */
  amount: number
}
export interface TransferRewardResult {
  /** 转入后的奖励余额 */
  reward_balance: number
  /** 转入后的主余额 */
  main_balance: number
}

export type WithdrawMethod = 'alipay' | 'bank'

/** 申请提现（运营审核后人工线下打款） */
export interface WithdrawRequest {
  /** 提现金额，单次 ≥100，且不超过当前奖励余额 */
  amount: number
  method: WithdrawMethod
  /** method=alipay 时必填 */
  alipay_account?: string
  /** method=bank 时必填 */
  bank_name?: string
  bank_card?: string
  bank_holder?: string
}

// ─── 接口 ───────────────────────────────────────────────────────────────────

/** GET /tenants/:tenantId/referral/overview — 总览 KPI + 档位 + 邀请信息 */
export function getReferralOverview(tenantId: string): Promise<ReferralOverview> {
  if (isMock()) {
    return Promise.resolve({
      stats: referralMock.stats,
      tier: referralMock.tier,
      inviteLink: referralMock.inviteLink,
      inviteCode: referralMock.inviteCode,
    })
  }
  return get<ReferralOverview>(`tenants/${tenantId}/referral/overview`)
}

/** GET /tenants/:tenantId/referral/invitees — 被邀请人列表 */
export function listReferralInvitees(tenantId: string): Promise<ReferralInvitee[]> {
  if (isMock()) return Promise.resolve(referralMock.invitees)
  return get<ReferralInvitee[]>(`tenants/${tenantId}/referral/invitees`)
}

/** GET /tenants/:tenantId/referral/reward-records — 奖励记录（即返佣流水） */
export function listRewardRecords(tenantId: string): Promise<ReferralCommissionRecord[]> {
  if (isMock()) return Promise.resolve(referralMock.commissions)
  return get<ReferralCommissionRecord[]>(`tenants/${tenantId}/referral/reward-records`)
}

/** GET /tenants/:tenantId/referral/withdrawals — 提现记录 */
export function listWithdrawals(tenantId: string): Promise<ReferralWithdrawal[]> {
  if (isMock()) return Promise.resolve(referralMock.withdrawals)
  return get<ReferralWithdrawal[]>(`tenants/${tenantId}/referral/withdrawals`)
}

/** POST /tenants/:tenantId/referral/transfer — 奖励余额转入主余额 */
export function transferRewardToBalance(
  tenantId: string,
  body: TransferRewardRequest
): Promise<TransferRewardResult> {
  if (isMock()) {
    return Promise.resolve({
      reward_balance: Math.max(0, referralMock.stats.rewardBalance - body.amount),
      main_balance: 0,
    })
  }
  return post<TransferRewardResult>(`tenants/${tenantId}/referral/transfer`, body)
}

/** POST /tenants/:tenantId/referral/withdrawals — 申请提现，返回新建的提现记录 */
export function requestWithdrawal(
  tenantId: string,
  body: WithdrawRequest
): Promise<ReferralWithdrawal> {
  if (isMock()) {
    return Promise.resolve({ appliedAt: '', amount: body.amount, status: 'pending', paidAt: null })
  }
  return post<ReferralWithdrawal>(`tenants/${tenantId}/referral/withdrawals`, body)
}
