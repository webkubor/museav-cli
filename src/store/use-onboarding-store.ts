/**
 * 新手指南全局状态
 * 路由：全局
 * API：services/onboarding.ts（prd#943：guide / steps/{key} / reward/claim）
 *
 * 规格：2026-08-06-onboarding-guide-reward-design.md §9.2（生产对象）
 *      2026-08-13-onboarding-reward-balance-guide-design.md（领取回执 + 账单定位）
 *
 * **服务端是权威，这个 store 是它的本地镜像**（2026-09-14 由全 Mock 切过来）：
 *   · 进度按 tenant 共享（企业 Owner / Admin 看到同一份），由服务端按 tenant_id 存
 *   · 自动展开偏好按 user+tenant+guideVersion，也在服务端（billing 的 user_preference）
 *   · 金额快照、once-per-tenant 发放、五步幂等全在 billing，客户端传值一律不可信
 *
 * ⚠️ 不再写 localStorage：本地缓存一份进度只会和服务端打架（换设备/换人看到的该是
 * 同一份），领取与否更不能由浏览器说了算。
 */

import { create } from 'zustand'
import { useAuthStore } from '@/store/auth'
import { trackEvent } from '@/lib/track'
import {
  canClaimOnboardingReward,
  completeOnboardingStep,
  completesImpliedSteps,
  formatOnboardingReward,
  impliedOnboardingSteps,
  markOnboardingRewarded,
  rollbackOnboardingStep,
  type OnboardingGuideState,
  type OnboardingSite,
  type OnboardingStepKey,
  type OnboardingTenantKind,
} from '@/features/onboarding/onboarding-guide-domain'
import { buildOnboardingGuideProps } from '@/features/onboarding/onboarding-track'
import {
  claimOnboardingReward,
  completeOnboardingStepApi,
  getOnboardingGuide,
  ONBOARDING_STEP_KEY_TO_API,
  type OnboardingGuideContext,
} from '@/services/onboarding'

/** 领取成功后交给弹框和账单页的回执（2026-08-13 规格：跨页面定位标识）。 */
export interface OnboardingRewardReceipt {
  /** 入账记录编号，展示用 */
  recordRef: string
  /**
   * 入账记录行 id。与 recordRef **两个标识交叉比对**任一命中即高亮：不同数据源下这两个
   * 值对应的字段不一样（前端合成的行 id === record_ref；接口直出时 record_ref 是
   * `redm_<日期>_<后8位>` 展示编号、id 另算），只认一个就会有一侧对不上。
   * 匹配规则见 pages/billing/income-highlight.ts，不在这里内联。
   */
  transactionId: string
  rewardLabel: string
}

/** 领取结果三态（规格 §13.1 的 claim_result；顶层 result 列另有 SDK 枚举） */
export type OnboardingClaimOutcome =
  | { result: 'success'; receipt: OnboardingRewardReceipt }
  | { result: 'already_claimed'; receipt: OnboardingRewardReceipt | null }
  | { result: 'failed'; errorCode: string; error?: unknown }

interface OnboardingState {
  /** 按租户分桶的任务状态（服务端镜像） */
  guides: Record<string, OnboardingGuideState>
  /**
   * 埋点用的角色，按租户分桶。**不进 guide** —— guide 是服务端契约的镜像，塞展示/埋点
   * 字段进去会污染它，而且角色是会变的（Admin 被降权），不该跟着进度一起存。
   *
   * 存在这儿是因为命令式上报路径（reportOnboardingStep ← experience-run.ts）拿不到
   * React 上下文，而 role 的真源 useTenantRole 是 hook，auth store 的 TenantBrief
   * 又不带 role。由 hook 在 ensureGuide 时灌进来。
   */
  trackRoles: Record<string, string>
  /** 气泡开合（瞬时 UI 状态） */
  open: boolean
  /**
   * 待自动展开的租户：服务端 GET /guide 回 auto_open=true 时置上，hook 消费一次即清。
   * 服务端已经保证每个 user+tenant+版本只回一次 true，这里只防同一次会话里重复弹。
   */
  pendingAutoOpen: string | null
  /** 本次领取的回执；非 null 时成功弹框可见 */
  rewardReceipt: OnboardingRewardReceipt | null
  /** 账单入账记录里要高亮的那一行 */
  billingHighlight: OnboardingRewardReceipt | null
  /**
   * 请求去重（瞬时，不对 UI 可见）：
   *   loadingTenants —— GET 在途，挡住并发请求（见 ensureGuide 的注释）
   *   guidelessTenants —— GET 回了空（企业 Member / 未取得资格），本会话不再重复问
   *   claimingTenants —— 领取在途，挡住双击与多标签页
   */
  loadingTenants: Record<string, true>
  guidelessTenants: Record<string, true>
  claimingTenants: Record<string, true>
}

interface OnboardingActions {
  /** 拉取当前租户的指南状态（幂等：一个租户一个会话只 GET 一次，见下方 inflight 注释） */
  ensureGuide: (input: {
    tenantId: string
    tenantKind: OnboardingTenantKind
    site: OnboardingSite
    /** 仅用于埋点公共属性（规格 §13.1）；权限判定在调用方 hook 里已经做过 */
    role?: string
  }) => void
  /** 完成一步：本地先乐观打勾，再上报；服务端回来的状态整份覆盖，失败回滚 */
  completeStep: (input: {
    tenantId: string
    stepKey: OnboardingStepKey
    evidenceType: string
    evidenceId: string
    completedBy: string
    /**
     * 返回上报请求的结束（成功或已回滚都算结束，永不 reject）。绝大多数调用方不等它；
     * 只有上报后紧跟整页跳走的调用方需要等（控制台 /models 转官网前报「浏览广场」，prd#1272）。
     */
  }) => Promise<void>
  /** 领取奖励。三态由「领取前的本地状态 + 请求结果」共同决定，见 OnboardingClaimOutcome */
  claimReward: (tenantId: string) => Promise<OnboardingClaimOutcome>
  setOpen: (open: boolean) => void
  consumeAutoOpen: () => void
  dismissReceipt: () => void
  /** 「查看赠金」：收弹框、把回执交给账单页做定位高亮 */
  takeReceiptForBilling: () => OnboardingRewardReceipt | null
  clearBillingHighlight: () => void
}

function withKey(map: Record<string, true>, key: string): Record<string, true> {
  return { ...map, [key]: true }
}

function withoutKey(map: Record<string, true>, key: string): Record<string, true> {
  if (!map[key]) return map
  const next = { ...map }
  delete next[key]
  return next
}

function guideContext(guide: OnboardingGuideState): OnboardingGuideContext {
  return { tenantId: guide.tenantId, tenantKind: guide.tenantKind, site: guide.reward.site }
}

/** 账单高亮信号的存活上限；超过就作废，见 takeReceiptForBilling */
export const BILLING_HIGHLIGHT_TTL_MS = 8000
let billingHighlightExpiry: ReturnType<typeof setTimeout> | null = null
function disarmBillingHighlightExpiry() {
  if (billingHighlightExpiry) clearTimeout(billingHighlightExpiry)
  billingHighlightExpiry = null
}
function armBillingHighlightExpiry(expire: () => void) {
  disarmBillingHighlightExpiry()
  billingHighlightExpiry = setTimeout(() => {
    billingHighlightExpiry = null
    expire()
  }, BILLING_HIGHLIGHT_TTL_MS)
}

export const useOnboardingStore = create<OnboardingState & OnboardingActions>()((set, get) => ({
  guides: {},
  trackRoles: {},
  open: false,
  pendingAutoOpen: null,
  rewardReceipt: null,
  billingHighlight: null,
  loadingTenants: {},
  guidelessTenants: {},
  claimingTenants: {},

  /**
   * 一个租户一个会话只 GET 一次。两个入口（侧栏 + 广场悬浮）会在同一帧各调一次
   * ensureGuide，StrictMode 下还要再翻倍；而 **auto_open 是读一次即消费的**（服务端在
   * 这次 GET 里就把 auto_open_seen_at 写了），并发 GET 会让第二个请求拿到 false，
   * 自动展开就静默丢了。所以在途期间挡住后续请求，失败时放开以便下次重试。
   */
  ensureGuide: ({ tenantId, tenantKind, site, role }) => {
    // guide 已建时仍要刷 role：角色查询比 ensureGuide 晚回是常态，早退会让埋点永远缺 role
    if (role && get().trackRoles[tenantId] !== role) {
      set((s) => ({ trackRoles: { ...s.trackRoles, [tenantId]: role } }))
    }
    const state = get()
    if (state.guides[tenantId] || state.loadingTenants[tenantId] || state.guidelessTenants[tenantId]) {
      return
    }
    set((s) => ({ loadingTenants: withKey(s.loadingTenants, tenantId) }))
    void getOnboardingGuide({ tenantId, tenantKind, site })
      .then(({ guide, autoOpen }) => {
        // guide 为 null = 没有指南（企业 Member / 未取得资格）：不建状态，入口自然不出现
        if (!guide) {
          set((s) => ({ guidelessTenants: withKey(s.guidelessTenants, tenantId) }))
          return
        }
        set((s) => ({
          guides: { ...s.guides, [tenantId]: guide },
          pendingAutoOpen: autoOpen ? tenantId : s.pendingAutoOpen,
        }))
        // 存量对账（#1058）：⑤ 已完成但 ④ 还灰着的租户在这里自愈，见 reconcileImpliedSteps
        reconcileImpliedSteps(tenantId)
      })
      // 拉不到指南不该打断进控制台：静默降级成「没有入口」，下次 effect 再试
      .catch(() => {})
      .finally(() => set((s) => ({ loadingTenants: withoutKey(s.loadingTenants, tenantId) })))
  },

  completeStep: ({ tenantId, stepKey, evidenceType, evidenceId, completedBy }) => {
    const current = get().guides[tenantId]
    if (!current) return Promise.resolve()
    const optimistic = completeOnboardingStep(current, {
      stepKey,
      completedAt: new Date().toISOString(),
      completedBy,
      evidenceType,
      evidenceId,
    })
    // 领域层重复事件返回原引用 → 这一步早就完成过，连请求都不用发（服务端也是幂等的）
    if (optimistic === current) return Promise.resolve()
    set((s) => ({ guides: { ...s.guides, [tenantId]: optimistic } }))

    return completeOnboardingStepApi(guideContext(current), stepKey, { evidenceType, evidenceId })
      .then((authoritative) => {
        if (authoritative) {
          set((s) => {
            const live = s.guides[tenantId]
            /**
             * 连着上报两步时响应可能乱序到达，先回来的那份不含后一步 —— 直接覆盖会把
             * 刚打上的勾抹掉（界面上看着像"完成了又退回去"）。只接受不比本地少的那份，
             * 少的那份等下一次 GET / 下一步上报自然纠正。
             */
            if (live && authoritative.completedSteps.length < live.completedSteps.length) return s
            return { guides: { ...s.guides, [tenantId]: authoritative } }
          })
        }
        /**
         * 埋点落在**服务端确认之后**，不是乐观更新那一刻：上报失败会回滚，那一步并没有
         * 真的完成，先记一条「完成」会让漏斗比服务端数据多算。
         * 用 authoritative 建公共属性：completed_steps 要含这一步，否则第 5 步永远上报 4。
         */
        trackEvent('onboarding_step_completed', {
          ...buildOnboardingGuideProps(authoritative ?? optimistic, get().trackRoles[tenantId]),
          step_key: stepKey,
          evidence_type: evidenceType,
        })
        /**
         * 蕴含步骤补报（#1058）。放在服务端确认之后，和埋点同一时机：上报失败会回滚，
         * 那一步并没真的完成，凭它去点亮别的步骤等于凭空发奖。
         * 只有触发方（当前是 ⑤）才对账，补出来的那一步不会再触发一轮。
         */
        if (completesImpliedSteps(stepKey)) reconcileImpliedSteps(tenantId, evidenceId)
      })
      .catch(() => {
        /**
         * 回滚这一步：勾不能白打——它决定「领取」按钮能不能点，而钱是服务端发的。
         * 本地留着假勾会让用户点了领取拿到 400。不弹 toast：这些上报都挂在业务动作的成功
         * 回调上（浏览广场 / 体验成功 / 建 Key…），用户没在等这个结果，下次动作会再报一次。
         *
         * ⚠️ 引用没变时换回上报前那一份（保持"回滚后引用与上报前相同"这个既有不变式）；
         * **引用变了不能就此跳过** —— 原来那种只比引用的写法在期间有别的步骤落地时会整个
         * 放弃回滚，本地留下服务端没有的假勾，而 ensureGuide 一个会话只 GET 一次、整个
         * 会话都不自愈。#1058 的存量对账让「页面一加载就自动打一个勾」成为常态，这种交叠
         * 从边角变成日常，所以补一条按 stepKey 摘的兜底。
         * 方向是保守的：万一服务端其实记下了只是响应没回来，下次 GET 会把它加回来；
         * 反过来留个假勾则整个会话都在骗用户。
         */
        set((s) => {
          const live = s.guides[tenantId]
          if (!live) return s
          if (live === optimistic) return { guides: { ...s.guides, [tenantId]: current } }
          const rolled = rollbackOnboardingStep(live, stepKey)
          return rolled === live ? s : { guides: { ...s.guides, [tenantId]: rolled } }
        })
      })
  },

  claimReward: async (tenantId) => {
    const current = get().guides[tenantId]
    if (!current) return { result: 'failed', errorCode: 'no_guide' }
    // 已是 rewarded（本会话领过 / 另一个管理员领过后刷新到）：不重复发请求
    if (current.status === 'rewarded') {
      return { result: 'already_claimed', receipt: get().rewardReceipt }
    }
    if (!canClaimOnboardingReward(current)) return { result: 'failed', errorCode: 'not_claimable' }
    if (get().claimingTenants[tenantId]) {
      return { result: 'already_claimed', receipt: get().rewardReceipt }
    }

    set((s) => ({ claimingTenants: withKey(s.claimingTenants, tenantId) }))
    try {
      const claimed = await claimOnboardingReward(guideContext(current))
      const receipt: OnboardingRewardReceipt = {
        recordRef: claimed.recordRef,
        transactionId: claimed.transactionId,
        // 金额用服务端这次回的快照，不用本地那份——后台调价后两者可能不同，以服务端为准
        rewardLabel: formatOnboardingReward(claimed.reward),
      }
      const rewarded = markOnboardingRewarded(get().guides[tenantId] ?? current, {
        rewardedAt: new Date().toISOString(),
        transactionId: claimed.transactionId,
        recordRef: claimed.recordRef,
      })
      set((s) => ({
        guides: { ...s.guides, [tenantId]: rewarded },
        // 领取后收起气泡，交给成功弹框（2026-08-13 规格：领取 → 关闭指南 → 居中弹框）
        open: false,
        rewardReceipt: receipt,
      }))
      return { result: 'success', receipt }
    } catch (error) {
      const code = (error as { code?: number })?.code
      return { result: 'failed', errorCode: code ? String(code) : 'request_failed', error }
    } finally {
      set((s) => ({ claimingTenants: withoutKey(s.claimingTenants, tenantId) }))
    }
  },

  setOpen: (open) => set({ open }),

  consumeAutoOpen: () => set({ pendingAutoOpen: null }),

  dismissReceipt: () => set({ rewardReceipt: null }),

  takeReceiptForBilling: () => {
    const receipt = get().rewardReceipt
    if (!receipt) return null
    set({ rewardReceipt: null, billingHighlight: receipt })
    // 信号自毁：账单页要么在 TTL 内把它用掉（找到行 → 钉住 / 判定找不到），要么它自己作废。
    // 放在这里而不是账单面板的 effect 里，是因为面板卸载会把 effect 的定时器一起清掉——
    // 用户在列表落地前就离开账单页，信号会无限期挂着，下次进来又复位一次筛选并高亮，
    // 违背「离开再进来必须没有高亮」（2026-09-16 owner 口径）。
    armBillingHighlightExpiry(() => {
      if (get().billingHighlight === receipt) set({ billingHighlight: null })
    })
    return receipt
  },

  clearBillingHighlight: () => {
    disarmBillingHighlightExpiry()
    set({ billingHighlight: null })
  },
}))

/**
 * 补报出来的那一步在 billing 里的 evidence_type 前缀，后面接**触发方**的后端 step_key
 * （如 `implied_by_call_and_view_log`）—— 与用户直接做出来的证据一眼区分开。
 *
 * 埋点 onboarding_step_completed 也会带上它：补报同样发一条「④ 完成」，漏斗里这条的
 * completed_steps 是 5、时间还晚于 ⑤，口径上要按这个前缀排除，否则 ④ 的完成率被自己
 * 填平，下次再出 #1058 这类问题就看不见了。
 */
export const ONBOARDING_IMPLIED_EVIDENCE_PREFIX = 'implied_by_'

/**
 * 把「被别的步骤蕴含、但还没点亮」的步骤补报上去（shared/modelgo_prd#1058：完成 ⑤ 之后
 * ④ 自动完成）。蕴含关系本身在领域层（impliedOnboardingSteps），这里只负责发请求。
 *
 * 两条调用路径：拉到指南时（治存量卡在 4/5 的租户）、⑤ 上报成功后（治新发生的）。
 * 走 completeStep 而不是直接打接口，是为了复用它那套乐观更新 / 乱序保护 / 失败回滚 /
 * 埋点；重复补报由 completeStep 自己挡掉（领域层对已完成的步骤返回原引用）。
 *
 * ⚠️ 这只是**客户端派生**。状态机的权威在 billing，同样的规则后端补上之后这里就是冗余的
 * （两边幂等，不冲突）；在那之前，非控制台路径（比如直接调接口的租户）不会被自动补。
 */
function reconcileImpliedSteps(tenantId: string, triggerEvidenceId?: string) {
  const store = useOnboardingStore.getState()
  const guide = store.guides[tenantId]
  if (!guide) return
  const implied = impliedOnboardingSteps(guide)
  if (implied.length === 0) return
  const { account } = useAuthStore.getState()
  const completedBy = account?.email ?? account?.account_id ?? 'unknown'
  for (const { stepKey, impliedBy } of implied) {
    // 触发方用后端认识的那个 step_key（call_and_view_log），不是前端的内部命名
    const triggerKey = ONBOARDING_STEP_KEY_TO_API[impliedBy]
    store.completeStep({
      tenantId,
      stepKey,
      evidenceType: `${ONBOARDING_IMPLIED_EVIDENCE_PREFIX}${triggerKey}`,
      /**
       * 刚完成 ⑤ 这条路手里有真的 request_id，透传下去 —— 万一将来要倒查「这笔 ¥10 是靠
       * 哪次调用派生出来的」，billing 里翻得到。存量对账那条路没有（服务端不回 evidence），
       * 退回触发方的 step_key，至少不是空值。
       */
      evidenceId: triggerEvidenceId || triggerKey,
      completedBy,
    })
  }
}

/**
 * 命令式上报一步 —— 给拿不到 React 上下文的调用方用（如 experience-run.ts 里的
 * trackModelRun，它是普通函数、同时服务体验页和对比页）。
 *
 * 权限判定靠一条不变式：**store 里存在该租户的 guide ⟺ 当时判过 hasAccess**
 * （只有 useOnboardingGuide 的 ensureGuide 会建它，而它已经门控了角色），加上服务端
 * 自己也有角色门（企业 Member POST 返 40301），两道闸。
 */
export function reportOnboardingStep(
  stepKey: OnboardingStepKey,
  evidenceType: string,
  evidenceId: string,
): Promise<void> {
  const { activeTenantId, account } = useAuthStore.getState()
  if (!activeTenantId) return Promise.resolve()
  const store = useOnboardingStore.getState()
  if (!store.guides[activeTenantId]) return Promise.resolve()
  // 重复上报的静默忽略、以及 onboarding_step_completed 埋点，都在 completeStep 里
  return store.completeStep({
    tenantId: activeTenantId,
    stepKey,
    evidenceType,
    evidenceId,
    completedBy: account?.email ?? account?.account_id ?? 'unknown',
  })
}
