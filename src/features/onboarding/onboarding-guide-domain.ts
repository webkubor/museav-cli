/**
 * 新手指南领域层 —— 从 PRD 原型 1:1 移植。
 * 路由：全局（侧栏入口；原公开模型广场悬浮入口已随广场拆到官网，prd#1272）
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

/**
 * 撤回一步 —— 上报失败时把乐观打上的勾摘掉。服务端没记下的勾不能留在本地：它决定
 * 「领取」按钮能不能点，而钱是服务端发的，留着假勾只会让用户点了领取拿 400。
 *
 * **按 stepKey 摘，不是把整份 state 换回上报前那个引用**：#1058 的存量对账让「页面一加载
 * 就自动打一个勾」成为常态，期间很容易有别的步骤先落地（补报 ④ 在途时用户进了模型广场
 * 点亮 ①），引用早就换过 —— 用引用相等判回滚会**整个跳过**，本地留下一个服务端没有的
 * 勾，而 ensureGuide 一个会话只 GET 一次，整个会话都不会自愈。
 *
 * 已领取不回滚（状态机只向前）。摘到空就退回 eligible，与服务端「还没推进过」同义。
 */
export function rollbackOnboardingStep(
  guide: OnboardingGuideState,
  stepKey: OnboardingStepKey,
): OnboardingGuideState {
  if (guide.status === 'rewarded') return guide
  const completedSteps = guide.completedSteps.filter((item) => item.stepKey !== stepKey)
  if (completedSteps.length === guide.completedSteps.length) return guide
  return {
    ...guide,
    completedSteps,
    status: completedSteps.length === 0 ? 'eligible' : 'in_progress',
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

/**
 * 蕴含关系：完成左边那步 ⇒ 右边那步也算完成（shared/modelgo_prd#1058）。
 *
 * 目前只有一条 `request_log ⇒ quick_connect`。理由是**⑤ 的判据本身已经覆盖了 ④ 的目的**：
 * 经 #1036 收紧后，⑤ 要求「用户自己那把 Key 打出去的一次成功同步调用 + 打开该 request_id
 * 的日志详情」（见 pages/logs/onboarding-step.ts），能走到这一步的人一定已经完成接入。
 * 而 ④ 的证据窄得多 —— 只认快速接入弹窗里「复制完整配置/代码」那一个动作，照着文档自己
 * 写代码、或只复制了 Key 的用户永远点不亮它，卡在 4/5 领不到奖励（#1058 线上实拍）。
 *
 * ⚠️ 这不是把 #1036 放回去：#1036 堵的是「模型体验那条 trial 日志冒充 ⑤」，即**一个动作
 * 点亮两步**；这里是「⑤ 这个更严的动作顺带满足 ④」，方向相反，五步并没有塌成四个动作。
 *
 * 写成 pair 数组而不是对象，是为了让「加一条蕴含」只改数据不改逻辑，且顺带避开
 * services/onboarding.ts 里提到的那条 secrets 门禁规则（`api_key` 形状的对象键）。
 */
const ONBOARDING_IMPLIED_STEP_PAIRS: ReadonlyArray<readonly [OnboardingStepKey, OnboardingStepKey]> =
  [['request_log', 'quick_connect']]

export interface OnboardingImpliedStep {
  stepKey: OnboardingStepKey
  /** 是哪一步蕴含了它 —— 补报时当 evidence 落库，billing 里能看出这条不是用户直接做的 */
  impliedBy: OnboardingStepKey
}

/**
 * 按当前进度算出「该被顺带点亮、但还没点亮」的步骤。
 *
 * 只读当前 completedSteps，不关心这一步是刚上报的还是 GET 回来的历史进度 —— 所以同一个
 * 函数能同时服务两条路径：**新完成 ⑤ 的**（上报成功后补一发）和**已经卡在 4/5 的存量租户**
 * （每次拉到指南时对账）。少了后者，#1058 截图里那个 ⑤ 已完成的租户永远不会自愈：⑤ 不会
 * 再上报第二次，服务端也是幂等的。
 *
 * 已领取（rewarded）的租户不再补 —— 状态机只向前，补了也不改变任何结果，白发请求。
 */
export function impliedOnboardingSteps(guide: OnboardingGuideState): OnboardingImpliedStep[] {
  if (guide.status === 'rewarded') return []
  const completed = new Set(guide.completedSteps.map((item) => item.stepKey))
  return ONBOARDING_IMPLIED_STEP_PAIRS.filter(
    ([trigger, implied]) => completed.has(trigger) && !completed.has(implied),
  ).map(([impliedBy, stepKey]) => ({ stepKey, impliedBy }))
}

/**
 * 这一步的完成会不会顺带点亮别的步骤。
 *
 * 上报成功后只有**触发方**才去对账 —— 补报出来的那一步自己不会再触发一轮，递归天然收敛，
 * 不用额外记「补过没有」的状态。
 */
export function completesImpliedSteps(stepKey: OnboardingStepKey): boolean {
  return ONBOARDING_IMPLIED_STEP_PAIRS.some(([trigger]) => trigger === stepKey)
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
