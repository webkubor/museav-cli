/**
 * 新手指南领域层 —— 从 PRD 原型 1:1 移植。
 * 路由：全局（侧栏入口 + 公开模型广场悬浮入口）
 * API：见 services/onboarding.ts（prd#943 三接口）
 *
 * 来源：modelgo_prd/src/onboardingGuideDomain.ts（163 行，整文件移植）
 * 规格：modelgo_prd/docs/superpowers/specs/2026-08-06-onboarding-guide-reward-design.md §6/§7/§8/§9
 *
 * 纯函数、不依赖 React（规格 §10.1 的组件边界要求）。所有状态转换都是
 * 「只向前、不回退、重复事件返回原状态」——删 API Key、删日志、后续调用
 * 失败都不该让已完成的步骤退回去（规格 §6.3 / §12）。
 *
 * ⚠️ 2026-09-14 起**状态机的权威在服务端**（billing 的 onboarding 领域）：取得资格、
 * 五步幂等、金额快照、发奖都由后端算。这里剩下的转换函数只做两件事：上报成功前的
 * 乐观更新、领取成功后的本地镜像——都是「把服务端已经认定的事实落到本地 state」，
 * 不再自己决定发不发奖。金额快照也不再有前端默认值（国内 CNY10 / 海外 USD5 由
 * billing_onboarding_reward_config 落库），谁也别在这里写死价格。
 */

export const ONBOARDING_GUIDE_VERSION = 'v1' as const

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
  /** 服务端快照的币种（CNY / USD）；不收窄成联合类型，后端加币种不该让前端白屏 */
  currency: string
  amount: number
  configVersion: string
}

/**
 * 一步的完成记录。**只有 stepKey 是服务端会回的**：GET /onboarding/guide 的
 * completed_steps 是纯 key 数组，时间/人/证据只落在 billing 的
 * billing_onboarding_step_completion 表里、不对前端透出。所以其余字段都是可选的，
 * 只有本地乐观更新那一次填得上——别在 UI 里依赖它们（会随刷新消失）。
 */
export interface OnboardingStepCompletion {
  stepKey: OnboardingStepKey
  completedAt?: string
  completedBy?: string
  evidenceType?: string
  evidenceId?: string
}

export interface OnboardingGuideState {
  tenantId: string
  tenantKind: OnboardingTenantKind
  /** 服务端的 guide_version（当前 'v1'）；换版本等于换活动，进度不迁移 */
  guideVersion: string
  eligibleAt: string
  status: OnboardingGuideStatus
  reward: OnboardingRewardSnapshot
  completedSteps: OnboardingStepCompletion[]
  rewardedAt?: string
  rewardTransactionId?: string
  /** 入账记录编号（服务端给的展示用编号） */
  recordRef?: string
}

interface RewardOnboardingGuideInput {
  rewardedAt: string
  transactionId: string
  recordRef?: string
}

/**
 * 完成一步。已领取、或该步已完成 → 原样返回（引用不变，调用方据此跳过 setState）。
 * 五步齐了自动进 claimable（规格 §6.3）。
 *
 * 服务端接口到位后这个函数只负责**乐观更新**：POST 发出前先把勾打上，让气泡即时反馈，
 * 服务端回来的权威状态会整份覆盖它；POST 失败则回滚到调用前的引用。
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

/**
 * 把服务端确认的领取结果落到本地（不是本地决定发奖——服务端已经在同一事务里发完了）。
 * 已是 rewarded 就原样返回：幂等重放拿到的是同一笔，不该覆盖首次的时间戳。
 */
export function markOnboardingRewarded(
  guide: OnboardingGuideState,
  { rewardedAt, transactionId, recordRef }: RewardOnboardingGuideInput,
): OnboardingGuideState {
  if (guide.status === 'rewarded') {
    return guide
  }
  return { ...guide, status: 'rewarded', rewardedAt, rewardTransactionId: transactionId, recordRef }
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
