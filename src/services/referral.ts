/**
 * 推荐计划 / 消费分润
 * 路由：/tenants/:tenantId/referral/...
 *
 * 后端已就绪（web-api referral BFF，qa/ai-quality-platform#96）——本文件直连真实接口。
 * 金额一律字符串；transfer 必须携带稳定 idempotency_key（每次确认动作
 * 生成一个 uuid 并在重试时复用），否则超时重试可能产生双重转账。
 */
import { get, post } from '@/lib/request'
import type { CursorPage } from '@/types'
import type {
  ReferralStats,
  ReferralTier,
  ReferralInvitee,
  ReferralCommissionRecord,
} from '@/pages/referral/referral-data'

// ─── 响应/请求类型 ───────────────────────────────────────────────────────────

/** 推荐计划总览：KPI 统计 + 当前档位 + 专属邀请信息 */
export interface ReferralOverview {
  stats: ReferralStats
  tier: ReferralTier
  inviteLink: string
  inviteCode: string
}

/** 奖励余额转入主余额（金额为字符串，与后端一致） */
export interface TransferRewardRequest {
  /** 转入金额，单次 ≥100，且不超过当前奖励余额 */
  amount: string
  /** 稳定幂等键：同一次确认动作的重试必须复用同一个值 */
  idempotency_key: string
}
export interface TransferRewardResult {
  /** 转入后的奖励余额 */
  reward_balance: string
  /** 转入后的主余额 */
  main_balance: string
}

// ─── 接口 ───────────────────────────────────────────────────────────────────

/** GET /tenants/:tenantId/referral/overview — 总览 KPI + 档位 + 邀请信息 */
export function getReferralOverview(tenantId: string): Promise<ReferralOverview> {
  return get<ReferralOverview>(`tenants/${tenantId}/referral/overview`)
}

/** GET /tenants/:tenantId/referral/invitees — 被邀请人列表，游标翻页 */
export function listReferralInvitees(
  tenantId: string,
  params?: { cursor?: string; page_size?: number }
): Promise<CursorPage<ReferralInvitee>> {
  return get<CursorPage<ReferralInvitee>>(`tenants/${tenantId}/referral/invitees`, params)
}

/** GET /tenants/:tenantId/referral/reward-records — 奖励记录（即返佣流水），游标翻页 */
export function listRewardRecords(
  tenantId: string,
  params?: { cursor?: string; page_size?: number }
): Promise<CursorPage<ReferralCommissionRecord>> {
  return get<CursorPage<ReferralCommissionRecord>>(`tenants/${tenantId}/referral/reward-records`, params)
}

/** POST /tenants/:tenantId/referral/transfer — 奖励余额转入主余额 */
export function transferRewardToBalance(
  tenantId: string,
  body: TransferRewardRequest
): Promise<TransferRewardResult> {
  return post<TransferRewardResult>(`tenants/${tenantId}/referral/transfer`, body)
}
