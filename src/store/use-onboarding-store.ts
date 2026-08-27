/**
 * 新手指南全局状态（本轮全 Mock，落 localStorage）
 * 路由：全局
 * API：⚠️ 无 —— 服务端契约见文件末尾「待后端」，接口到位后只换数据来源，UI 不动
 *
 * 规格：2026-08-06-onboarding-guide-reward-design.md §9.2（原型状态建议）
 *      2026-08-13-onboarding-reward-balance-guide-design.md（领取回执 + 账单定位）
 *
 * 状态分桶口径照规格：
 *   · 任务进度按 tenantId 分桶 —— 个人/企业隔离，企业 Owner 与 Admin 共享同一份（§6.2）
 *   · 自动展开偏好按 user+tenant+guideVersion 分桶 —— Owner 关掉不影响 Admin 首次自动展开（§5.4）
 */

import { create } from 'zustand'
import { storageKeys } from '@/lib/storage'
import { useAuthStore } from '@/store/auth'
import { trackEvent } from '@/lib/track'
import {
  ONBOARDING_GUIDE_VERSION,
  completeOnboardingStep,
  canClaimOnboardingReward,
  createOnboardingGuideState,
  formatOnboardingReward,
  markOnboardingRewarded,
  type OnboardingGuideState,
  type OnboardingSite,
  type OnboardingStepKey,
  type OnboardingTenantKind,
} from '@/features/onboarding/onboarding-guide-domain'
import { buildOnboardingGuideProps } from '@/features/onboarding/onboarding-track'

/** 领取成功后交给弹框和账单页的回执（2026-08-13 规格：recordRef 是跨页面定位标识）。 */
export interface OnboardingRewardReceipt {
  recordRef: string
  rewardLabel: string
}

interface OnboardingState {
  /** 按租户分桶的任务状态 */
  guides: Record<string, OnboardingGuideState>
  /**
   * 埋点用的角色，按租户分桶。**不持久化、不进 guide** —— guide 是 1:1 移植的领域
   * 对象，塞展示/埋点字段进去会污染它，而且角色是会变的（Admin 被降权），不该跟着
   * 任务进度一起落 localStorage。
   *
   * 存在这儿是因为命令式上报路径（reportOnboardingStep ← experience-run.ts）拿不到
   * React 上下文，而 role 的真源 useTenantRole 是 hook，auth store 的 TenantBrief
   * 又不带 role。由 hook 在 ensureGuide 时灌进来。
   */
  trackRoles: Record<string, string>
  /** 气泡开合（瞬时 UI 状态，不持久化） */
  open: boolean
  /** 本次领取的回执；非 null 时成功弹框可见 */
  rewardReceipt: OnboardingRewardReceipt | null
  /** 账单入账记录里要高亮的那一行 */
  billingHighlightRecordRef: string | null
}

interface OnboardingActions {
  /** 取得资格（幂等）：租户第一次进控制台时建状态并快照奖励金额 */
  ensureGuide: (input: {
    tenantId: string
    tenantKind: OnboardingTenantKind
    site: OnboardingSite
    /** 仅用于埋点公共属性（规格 §13.1）；权限判定在调用方 hook 里已经做过 */
    role?: string
  }) => void
  /** 完成一步；重复上报静默忽略（领域层保证引用不变） */
  completeStep: (input: {
    tenantId: string
    stepKey: OnboardingStepKey
    evidenceType: string
    evidenceId: string
    completedBy: string
  }) => void
  /** 领取奖励，返回回执；不满足条件返回 null（不抛，调用方是 onClick） */
  claimReward: (tenantId: string) => OnboardingRewardReceipt | null
  setOpen: (open: boolean) => void
  dismissReceipt: () => void
  /** 「查看赠金」：收弹框、把 recordRef 交给账单页做定位高亮 */
  takeReceiptForBilling: () => OnboardingRewardReceipt | null
  clearBillingHighlight: () => void
}

function readGuide(tenantId: string): OnboardingGuideState | null {
  try {
    const raw = window.localStorage.getItem(storageKeys.onboardingGuide(tenantId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as OnboardingGuideState
    // 换版本等于换活动：旧版进度不迁移，重新取得资格（§6.1「不设截止时间」但按 guideVersion 分活动）
    return parsed.guideVersion === ONBOARDING_GUIDE_VERSION ? parsed : null
  } catch {
    // 隐私模式 / 存量脏数据：当作没有，重新建一份，不阻断进控制台
    return null
  }
}

function writeGuide(guide: OnboardingGuideState) {
  try {
    window.localStorage.setItem(storageKeys.onboardingGuide(guide.tenantId), JSON.stringify(guide))
  } catch {
    /* 写不进去只影响刷新后的保持，不影响本次会话 */
  }
}

/**
 * 入账记录号。真实实现由服务端在同一事务里生成正式流水编号
 * （规格 §11「用可追踪的正常流水编号，不用业务名称占用编号字段」）。
 * Mock 阶段用 gnt 前缀 + 租户 + 版本，保证同一租户重复领取拿到同一个号 —— 幂等的一部分。
 */
function mockRecordRef(tenantId: string): string {
  return `gnt-${tenantId}-${ONBOARDING_GUIDE_VERSION}`
}

export const useOnboardingStore = create<OnboardingState & OnboardingActions>()((set, get) => ({
  guides: {},
  trackRoles: {},
  open: false,
  rewardReceipt: null,
  billingHighlightRecordRef: null,

  ensureGuide: ({ tenantId, tenantKind, site, role }) => {
    // guide 已建时仍要刷 role：角色查询比 ensureGuide 晚回是常态，早退会让埋点永远缺 role
    if (get().guides[tenantId]) {
      if (role && get().trackRoles[tenantId] !== role) {
        set((s) => ({ trackRoles: { ...s.trackRoles, [tenantId]: role } }))
      }
      return
    }
    const guide =
      readGuide(tenantId) ??
      createOnboardingGuideState({
        tenantId,
        tenantKind,
        site,
        eligibleAt: new Date().toISOString(),
      })
    writeGuide(guide)
    set((s) => ({
      guides: { ...s.guides, [tenantId]: guide },
      trackRoles: role ? { ...s.trackRoles, [tenantId]: role } : s.trackRoles,
    }))
  },

  completeStep: ({ tenantId, stepKey, evidenceType, evidenceId, completedBy }) => {
    const current = get().guides[tenantId]
    if (!current) return
    const next = completeOnboardingStep(current, {
      stepKey,
      completedAt: new Date().toISOString(),
      completedBy,
      evidenceType,
      evidenceId,
    })
    // 领域层重复事件返回原引用 → 这里跳过 setState，避免无谓重渲染
    if (next === current) return
    writeGuide(next)
    set((s) => ({ guides: { ...s.guides, [tenantId]: next } }))
  },

  claimReward: (tenantId) => {
    const current = get().guides[tenantId]
    if (!current || !canClaimOnboardingReward(current)) return null

    const transactionId = `onboarding-${tenantId}-${current.guideVersion}`
    const recordRef = mockRecordRef(tenantId)
    const rewarded = markOnboardingRewarded(current, {
      rewardedAt: new Date().toISOString(),
      transactionId,
    })
    writeGuide(rewarded)

    const receipt: OnboardingRewardReceipt = {
      recordRef,
      rewardLabel: formatOnboardingReward(current.reward),
    }
    set((s) => ({
      guides: { ...s.guides, [tenantId]: rewarded },
      // 领取后收起气泡，交给成功弹框（2026-08-13 规格：领取 → 关闭指南 → 居中弹框）
      open: false,
      rewardReceipt: receipt,
    }))
    return receipt
  },

  setOpen: (open) => set({ open }),

  dismissReceipt: () => set({ rewardReceipt: null }),

  takeReceiptForBilling: () => {
    const receipt = get().rewardReceipt
    if (!receipt) return null
    set({ rewardReceipt: null, billingHighlightRecordRef: receipt.recordRef })
    return receipt
  },

  clearBillingHighlight: () => set({ billingHighlightRecordRef: null }),
}))

/**
 * 命令式上报一步 —— 给拿不到 React 上下文的调用方用（如 experience-run.ts 里的
 * trackModelRun，它是普通函数、同时服务体验页和对比页）。
 *
 * 权限判定靠一条不变式：**store 里存在该租户的 guide ⟺ 当时判过 hasAccess**
 * （只有 useOnboardingGuide 的 ensureGuide 会建它，而它已经门控了角色）。
 * 所以这里不需要再查一次角色，没有 guide 就直接不上报。
 */
export function reportOnboardingStep(
  stepKey: OnboardingStepKey,
  evidenceType: string,
  evidenceId: string,
) {
  const { activeTenantId, account } = useAuthStore.getState()
  if (!activeTenantId) return
  const store = useOnboardingStore.getState()
  if (!store.guides[activeTenantId]) return
  const before = store.guides[activeTenantId]
  store.completeStep({
    tenantId: activeTenantId,
    stepKey,
    evidenceType,
    evidenceId,
    completedBy: account?.email ?? account?.account_id ?? 'unknown',
  })
  // 只在真的推进了才埋点：重复上报（用户第二次成功体验）不该再记一次完成
  const after = useOnboardingStore.getState().guides[activeTenantId]
  if (after !== before) {
    // 用 after 而非 before 建公共属性：completed_steps 要含这一步，否则第 5 步永远上报 4
    trackEvent('onboarding_step_completed', {
      ...buildOnboardingGuideProps(after, store.trackRoles[activeTenantId]),
      step_key: stepKey,
      evidence_type: evidenceType,
    })
  }
}

/** 自动展开偏好：每个 user+tenant+guideVersion 只自动弹一次（规格 §5.4）。 */
export function hasSeenOnboardingAutoOpen(userId: string, tenantId: string): boolean {
  try {
    return (
      window.localStorage.getItem(storageKeys.onboardingAutoOpen(userId, tenantId)) ===
      ONBOARDING_GUIDE_VERSION
    )
  } catch {
    // 读不到就当已看过：宁可不弹，也不要每次进控制台都弹一次
    return true
  }
}

export function markOnboardingAutoOpenSeen(userId: string, tenantId: string) {
  try {
    window.localStorage.setItem(
      storageKeys.onboardingAutoOpen(userId, tenantId),
      ONBOARDING_GUIDE_VERSION,
    )
  } catch {
    /* 写不进去最多下次再弹一次，不影响功能 */
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * 待后端（规格 §9.1 生产对象 / §11 发放约束）—— 本轮前端全 Mock，需要后端提供：
 *
 *   GET  /onboarding/guide            返回当前租户 TenantOnboardingProgress
 *                                     （status / completedSteps / reward 快照 / guideVersion）
 *   POST /onboarding/steps/{stepKey}  上报完成，带 evidenceType + evidenceId，服务端按
 *                                     tenant_id + guide_version + step_key 幂等写入
 *   POST /onboarding/reward/claim     领取：重校验租户+角色+状态，同事务写赠送余额流水并
 *                                     置 rewarded，返回入账记录的正式 recordRef
 *
 * 三条硬约束：①tenant_id + guide_version 唯一约束保证每租户每版只发一笔；②Owner/Admin
 * 并发领取只有一个建流水、另一个返回原结果而不是通用失败；③金额/币种/配置版本一律用
 * 服务端快照，不信客户端传值。
 * ────────────────────────────────────────────────────────────────────────── */
