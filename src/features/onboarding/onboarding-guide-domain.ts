/**
 * 新手指南领域层 —— 从 PRD 原型 1:1 移植。
 * 路由：全局（侧栏入口 + 公开模型广场悬浮入口）
 * API：无（本轮全 Mock，服务端契约见文件末尾「待后端」）
 *
 * 来源：modelgo_prd/src/onboardingGuideDomain.ts（163 行，整文件移植）
 * 规格：modelgo_prd/docs/superpowers/specs/2026-08-06-onboarding-guide-reward-design.md §6/§7/§8/§9
 *
 * 纯函数、不依赖 React（规格 §10.1 的组件边界要求）。所有状态转换都是
 * 「只向前、不回退、重复事件返回原状态」——删 API Key、删日志、后续调用
 * 失败都不该让已完成的步骤退回去（规格 §6.3 / §12）。
 *
 * ⚠️ 本轮是 Mock：真实的租户进度、幂等发奖、金额快照全在服务端。这里的
 * 函数是「服务端应该怎么算」的前端等价物，接口到位后 UI 不用动，只把
 * 状态来源从 localStorage 换成接口即可。
 */

export const ONBOARDING_GUIDE_VERSION = 'v1' as const
export const ONBOARDING_REWARD_CONFIG_VERSION = 'onboarding-reward-2026-08-06' as const

export const ONBOARDING_STEP_ORDER = [
  'marketplace',
  'playground',
  'api_key',
  'quick_connect',
  'request_log',
] as const

export type OnboardingStepKey = (typeof ONBOARDING_STEP_ORDER)[number]
export type OnboardingGuideStatus = 'eligible' | 'in_progress' | 'claimable' | 'rewarded'
export type OnboardingTenantKind = 'personal' | 'enterprise'
export type OnboardingSite = 'domestic' | 'overseas'
export type OnboardingRole = 'owner' | 'admin' | 'member'

export interface OnboardingRewardSnapshot {
  site: OnboardingSite
  currency: 'CNY' | 'USD'
  amount: number
  configVersion: string
}

export interface OnboardingStepCompletion {
  stepKey: OnboardingStepKey
  completedAt: string
  completedBy: string
  evidenceType: string
  evidenceId: string
}

export interface OnboardingGuideState {
  tenantId: string
  tenantKind: OnboardingTenantKind
  guideVersion: typeof ONBOARDING_GUIDE_VERSION
  eligibleAt: string
  status: OnboardingGuideStatus
  reward: OnboardingRewardSnapshot
  completedSteps: OnboardingStepCompletion[]
  rewardedAt?: string
  rewardTransactionId?: string
}

interface CreateOnboardingGuideStateInput {
  tenantId: string
  tenantKind: OnboardingTenantKind
  site: OnboardingSite
  eligibleAt: string
}

interface RewardOnboardingGuideInput {
  rewardedAt: string
  transactionId: string
}

/**
 * 奖励快照：国内站 CNY 10 / 海外站 USD 5（规格 §8.1 默认值）。
 * 真实实现里这份值来自 ModelGo Admin 的赠金规则配置，租户取得资格时快照下来，
 * 后台调价只影响之后取得资格的租户（规格 §8.2）——所以它是 state 的一部分，
 * 不是渲染时现算的常量。
 */
function createRewardSnapshot(site: OnboardingSite): OnboardingRewardSnapshot {
  return site === 'domestic'
    ? { site, currency: 'CNY', amount: 10, configVersion: ONBOARDING_REWARD_CONFIG_VERSION }
    : { site, currency: 'USD', amount: 5, configVersion: ONBOARDING_REWARD_CONFIG_VERSION }
}

export function createOnboardingGuideState({
  tenantId,
  tenantKind,
  site,
  eligibleAt,
}: CreateOnboardingGuideStateInput): OnboardingGuideState {
  return {
    tenantId,
    tenantKind,
    guideVersion: ONBOARDING_GUIDE_VERSION,
    eligibleAt,
    status: 'eligible',
    reward: createRewardSnapshot(site),
    completedSteps: [],
  }
}

/**
 * 完成一步。已领取、或该步已完成 → 原样返回（引用不变，调用方据此跳过 setState）。
 * 五步齐了自动进 claimable（规格 §6.3）。
 */
export function completeOnboardingStep(
  guide: OnboardingGuideState,
  completion: OnboardingStepCompletion,
): OnboardingGuideState {
  if (
    guide.status === 'rewarded' ||
    guide.completedSteps.some((item) => item.stepKey === completion.stepKey)
  ) {
    return guide
  }

  const completedSteps = [...guide.completedSteps, completion]
  return {
    ...guide,
    completedSteps,
    status: completedSteps.length === ONBOARDING_STEP_ORDER.length ? 'claimable' : 'in_progress',
  }
}

export function canClaimOnboardingReward(guide: OnboardingGuideState): boolean {
  return guide.status === 'claimable'
}

export function markOnboardingRewarded(
  guide: OnboardingGuideState,
  { rewardedAt, transactionId }: RewardOnboardingGuideInput,
): OnboardingGuideState {
  if (guide.status === 'rewarded') {
    return guide
  }
  if (!canClaimOnboardingReward(guide)) {
    throw new Error('Onboarding guide is not claimable')
  }
  return { ...guide, status: 'rewarded', rewardedAt, rewardTransactionId: transactionId }
}

/** 气泡只推荐下一项未完成任务，不锁定后续页面（规格 §5.2「可按任意顺序完成」）。 */
export function nextOnboardingStep(guide: OnboardingGuideState): OnboardingStepKey | null {
  return (
    ONBOARDING_STEP_ORDER.find(
      (stepKey) => !guide.completedSteps.some((item) => item.stepKey === stepKey),
    ) ?? null
  )
}

export function formatOnboardingReward(reward: OnboardingRewardSnapshot): string {
  return `${reward.currency === 'CNY' ? '¥' : '$'}${reward.amount}`
}

/** 企业 Member 看不到入口、也拿不到指南数据（规格 §6.2 权限矩阵）。 */
export function canAccessOnboardingGuide(
  tenantKind: OnboardingTenantKind,
  role: OnboardingRole,
): boolean {
  return tenantKind === 'personal' || role === 'owner' || role === 'admin'
}
