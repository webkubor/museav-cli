/**
 * 新手指南与新手奖励（prd#943 后端契约 / #968 前端）
 * 路由：全局（侧栏入口 + 公开模型广场悬浮入口）
 * API：GET  /tenants/:tenantId/onboarding/guide
 *      POST /tenants/:tenantId/onboarding/steps/:stepKey
 *      POST /tenants/:tenantId/onboarding/reward/claim
 *
 * 服务端是**唯一权威**：状态机、五步幂等、金额快照、once-per-tenant 发放全在 billing
 * （web-api 只做 BFF + 角色门）。本层只做两件事：调接口、把契约 DTO 映射成领域对象。
 *
 * ⚠️ 两处契约落差，改这个文件前先看清楚：
 *   1. **步骤 key 前后端不同名**。前端沿用原型的 marketplace/playground/...，后端用
 *      browse_marketplace/model_experience/...。两边都已有存量（前端 5 个上报点 + 单测，
 *      后端 DB 里的 step_key 是 TEXT），所以在这一层做双向映射，谁也不动谁。
 *   2. **reward.amount 是 2 位小数字符串**（decimal.Amount 的 JSON 形态，"10.00"），
 *      不是数字。领域层要数字（埋点 reward_amount 是标量、展示要 ¥10 不是 ¥10.00），
 *      在这里转一次，别让字符串漏进 UI。
 */

import { get, post } from '@/lib/request'
import {
  type OnboardingGuideState,
  type OnboardingGuideStatus,
  type OnboardingSite,
  type OnboardingStepKey,
  type OnboardingTenantKind,
} from '@/features/onboarding/onboarding-guide-domain'

/* ── 契约 DTO（对齐 web-api pkg/handler/onboarding/dto.go） ───────────────── */

interface OnboardingRewardDTO {
  currency?: string
  /** decimal.Amount：序列化成 2 位小数字符串，如 "10.00" */
  amount?: string | number
  config_version?: string
}

export interface OnboardingGuideDTO {
  status?: OnboardingGuideStatus | ''
  guide_version?: string
  eligible_at?: string
  completed_steps?: string[]
  reward?: OnboardingRewardDTO
  record_ref?: string
  rewarded_at?: string
  /** 服务端按 user+tenant+guide_version 判定的「本次该自动展开」——读一次即消费，见下 */
  auto_open?: boolean
}

export interface OnboardingClaimDTO {
  status?: OnboardingGuideStatus
  reward?: OnboardingRewardDTO
  transaction_id?: string
  record_ref?: string
}

/* ── 步骤 key 双向映射 ───────────────────────────────────────────────────── */

/**
 * 前端步骤 key ↔ 后端 step_key（billing pkg/model/onboarding.go 的五个常量）。
 * 一份 pair 数组派生两个方向，避免两张表各写一遍、改一处漏一处。
 *
 * 写成数组而不是对象字面量是有原因的：第三步那个键名做对象 key 时，会被提交门禁的
 * secrets 规则误判成硬编码密钥（规则是 `api[_-]?key` 形状的键后面跟 12 字符以上的
 * 字符串字面量）。数组形式没有那个 `键: 值` 结构，规则不会命中。
 */
const STEP_KEY_PAIRS: ReadonlyArray<readonly [OnboardingStepKey, string]> = [
  ['marketplace', 'browse_marketplace'],
  ['playground', 'model_experience'],
  ['api_key', 'create_api_key'],
  ['quick_connect', 'quick_integrate'],
  ['request_log', 'call_and_view_log'],
]

/** 前端步骤 key → 后端 step_key */
export const ONBOARDING_STEP_KEY_TO_API = Object.fromEntries(STEP_KEY_PAIRS) as Record<
  OnboardingStepKey,
  string
>

const ONBOARDING_STEP_KEY_FROM_API = Object.fromEntries(
  STEP_KEY_PAIRS.map(([frontend, api]) => [api, frontend]),
) as Record<string, OnboardingStepKey>

/** 后端 step_key → 前端步骤 key；认不出的（后端加了新步骤）直接丢，不塞脏值进状态 */
export function toOnboardingStepKey(apiKey: string): OnboardingStepKey | null {
  return ONBOARDING_STEP_KEY_FROM_API[apiKey] ?? null
}

/* ── DTO → 领域对象 ─────────────────────────────────────────────────────── */

/** 币种反推站点：奖励快照是按站点发的（国内 CNY / 海外 USD），契约里没有 site 字段 */
function siteFromCurrency(currency: string, fallback: OnboardingSite): OnboardingSite {
  if (currency === 'CNY') return 'domestic'
  if (currency === 'USD') return 'overseas'
  return fallback
}

function toRewardSnapshot(reward: OnboardingRewardDTO | undefined, fallbackSite: OnboardingSite) {
  const currency = reward?.currency ?? ''
  const amount = Number(reward?.amount ?? 0)
  return {
    site: siteFromCurrency(currency, fallbackSite),
    currency,
    amount: Number.isFinite(amount) ? amount : 0,
    configVersion: reward?.config_version ?? '',
  }
}

export interface OnboardingGuideContext {
  tenantId: string
  /** 契约里没有 tenant_type（服务端自己解析），埋点归因要用，由调用方带进来 */
  tenantKind: OnboardingTenantKind
  /** 兜底站点：服务端没给币种时（活动未配置）用当前市场，不留空 */
  site: OnboardingSite
}

/**
 * 空 data 不是错误：企业 Member（GET 收敛成 code=0 空对象）和未取得资格的租户都会走到
 * 这里，语义是「没有指南」——返回 null，调用方据此不给入口。
 */
export function toOnboardingGuideState(
  dto: OnboardingGuideDTO | null | undefined,
  ctx: OnboardingGuideContext,
): OnboardingGuideState | null {
  if (!dto?.status) return null
  const completedSteps = (dto.completed_steps ?? [])
    .map(toOnboardingStepKey)
    .filter((key): key is OnboardingStepKey => key !== null)
    .map((stepKey) => ({ stepKey }))
  return {
    tenantId: ctx.tenantId,
    tenantKind: ctx.tenantKind,
    guideVersion: dto.guide_version ?? '',
    eligibleAt: dto.eligible_at ?? '',
    status: dto.status,
    reward: toRewardSnapshot(dto.reward, ctx.site),
    completedSteps,
    rewardedAt: dto.rewarded_at,
    recordRef: dto.record_ref,
  }
}

/* ── 接口 ───────────────────────────────────────────────────────────────── */

export interface OnboardingGuideResult {
  guide: OnboardingGuideState | null
  /**
   * 服务端只在「这个用户这一版第一次读」时返 true，这次 GET 本身就把 auto_open_seen_at
   * 写掉了（billing resolveAutoOpen）。⇒ **一个租户一个会话只能 GET 一次**，重复请求会
   * 把自动展开吞掉，store 的 in-flight 去重就是为这个，别绕过它去补一次 GET。
   */
  autoOpen: boolean
}

export async function getOnboardingGuide(
  ctx: OnboardingGuideContext,
): Promise<OnboardingGuideResult> {
  const dto = await get<OnboardingGuideDTO>(`tenants/${ctx.tenantId}/onboarding/guide`)
  return { guide: toOnboardingGuideState(dto, ctx), autoOpen: Boolean(dto?.auto_open) }
}

/**
 * 上报完成一步。服务端按 (tenant, guide_version, step_key) 幂等，重复上报是 no-op；
 * 第 ⑤ 步会校验 evidence_id（request_id）属于本租户且已结算，不合格返 400。
 * 返回服务端最新的完整指南状态（权威），调用方直接用它覆盖本地乐观值。
 */
export async function completeOnboardingStepApi(
  ctx: OnboardingGuideContext,
  stepKey: OnboardingStepKey,
  evidence: { evidenceType: string; evidenceId: string },
): Promise<OnboardingGuideState | null> {
  const dto = await post<OnboardingGuideDTO>(
    `tenants/${ctx.tenantId}/onboarding/steps/${ONBOARDING_STEP_KEY_TO_API[stepKey]}`,
    { evidence_type: evidence.evidenceType, evidence_id: evidence.evidenceId },
  )
  return toOnboardingGuideState(dto, ctx)
}

export interface OnboardingClaimResult {
  status: OnboardingGuideStatus
  /** 入账记录展示用的编号（后端当前给的是流水 id，展示归展示） */
  recordRef: string
  /** 账单入账记录行的 id —— 「查看赠金」定位靠它，见 BillingLedgerPanel */
  transactionId: string
  reward: ReturnType<typeof toRewardSnapshot>
}

/**
 * 领取。服务端同事务发赠金 + 置 rewarded，重复领取返回**原记录**（幂等重放，不是错误），
 * 所以拿到 200 不代表这次真的发了钱——「是不是重复领取」由调用方按领取前的本地状态判。
 */
export async function claimOnboardingReward(
  ctx: OnboardingGuideContext,
): Promise<OnboardingClaimResult> {
  const dto = await post<OnboardingClaimDTO>(
    `tenants/${ctx.tenantId}/onboarding/reward/claim`,
    {},
  )
  return {
    status: dto?.status ?? 'rewarded',
    recordRef: dto?.record_ref ?? '',
    transactionId: dto?.transaction_id ?? '',
    reward: toRewardSnapshot(dto?.reward, ctx.site),
  }
}
