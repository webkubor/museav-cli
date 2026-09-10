/**
 * 新手指南领域层测试 —— 从 PRD 原型的 node 断言脚本改写成 vitest。
 * 来源：modelgo_prd/scripts/test-onboarding-guide-domain.mjs
 * 覆盖规格 §16.1 的六组：资格创建 / 状态推进 / 权限 / 金额快照 / 领取 / 幂等。
 */

import { describe, expect, it } from 'vitest'
import {
  canAccessOnboardingGuide,
  canClaimOnboardingReward,
  completeOnboardingStep,
  createOnboardingGuideState,
  formatOnboardingReward,
  markOnboardingRewarded,
  nextOnboardingStep,
  type OnboardingStepCompletion,
} from './onboarding-guide-domain'

const ELIGIBLE_AT = '2026-08-06T00:00:00.000Z'

function domesticGuide() {
  return createOnboardingGuideState({
    tenantId: 'tenant-enterprise',
    tenantKind: 'enterprise',
    site: 'domestic',
    eligibleAt: ELIGIBLE_AT,
  })
}

const marketplaceCompletion: OnboardingStepCompletion = {
  stepKey: 'marketplace',
  completedAt: '2026-08-06T00:01:00.000Z',
  completedBy: 'user-1',
  evidenceType: 'page_visit',
  evidenceId: 'marketplace',
}

/** 除 marketplace 外的四步，刻意乱序 —— 规格 §7.1「可按任意顺序完成并自动回填」。 */
const remainingCompletions = [
  { stepKey: 'request_log', evidenceType: 'request_log_opened', evidenceId: 'req-onboarding-1' },
  { stepKey: 'api_key', evidenceType: 'api_key_created', evidenceId: 'key-new-1' },
  { stepKey: 'quick_connect', evidenceType: 'quick_connect_copied', evidenceId: 'req-onboarding-1' },
  { stepKey: 'playground', evidenceType: 'playground_success', evidenceId: 'playground-event-1' },
] as const

function claimableGuide() {
  return remainingCompletions.reduce(
    (guide, fixture, index) =>
      completeOnboardingStep(guide, {
        ...fixture,
        completedAt: `2026-08-06T00:0${index + 3}:00.000Z`,
        completedBy: 'user-1',
      }),
    completeOnboardingStep(domesticGuide(), marketplaceCompletion),
  )
}

describe('资格创建与金额快照', () => {
  it('国内站快照 CNY 10，初始 eligible 且零完成步骤', () => {
    const guide = domesticGuide()
    expect(guide.guideVersion).toBe('v1')
    expect(guide.status).toBe('eligible')
    expect(guide.completedSteps).toEqual([])
    expect(guide.reward).toEqual({
      site: 'domestic',
      currency: 'CNY',
      amount: 10,
      configVersion: 'onboarding-reward-2026-08-06',
    })
    expect(formatOnboardingReward(guide.reward)).toBe('¥10')
  })

  it('海外站快照 USD 5', () => {
    const guide = createOnboardingGuideState({
      tenantId: 'tenant-overseas',
      tenantKind: 'personal',
      site: 'overseas',
      eligibleAt: ELIGIBLE_AT,
    })
    expect(guide.reward.currency).toBe('USD')
    expect(guide.reward.amount).toBe(5)
    expect(formatOnboardingReward(guide.reward)).toBe('$5')
  })
})

describe('权限矩阵（规格 §6.2）', () => {
  it('个人租户 owner、企业 owner/admin 可见，企业 member 不可见', () => {
    expect(canAccessOnboardingGuide('personal', 'owner')).toBe(true)
    expect(canAccessOnboardingGuide('enterprise', 'owner')).toBe(true)
    expect(canAccessOnboardingGuide('enterprise', 'admin')).toBe(true)
    expect(canAccessOnboardingGuide('enterprise', 'member')).toBe(false)
  })
})

describe('步骤推进', () => {
  it('完成一步进 in_progress，下一项推荐 playground', () => {
    const guide = completeOnboardingStep(domesticGuide(), marketplaceCompletion)
    expect(guide.status).toBe('in_progress')
    expect(guide.completedSteps).toHaveLength(1)
    expect(nextOnboardingStep(guide)).toBe('playground')
  })

  it('重复上报同一步返回原对象引用，不累计也不改完成时间', () => {
    const guide = completeOnboardingStep(domesticGuide(), marketplaceCompletion)
    const repeated = completeOnboardingStep(guide, {
      ...marketplaceCompletion,
      completedAt: '2026-08-06T00:02:00.000Z',
      completedBy: 'user-2',
      evidenceId: 'marketplace-again',
    })
    // 引用相等是契约的一部分：调用方据此跳过 setState，避免无谓重渲染
    expect(repeated).toBe(guide)
  })

  it('五步齐了进 claimable，无下一项', () => {
    const guide = claimableGuide()
    expect(guide.status).toBe('claimable')
    expect(guide.completedSteps).toHaveLength(5)
    expect(nextOnboardingStep(guide)).toBeNull()
    expect(canClaimOnboardingReward(guide)).toBe(true)
  })
})

describe('领取与幂等（规格 §11）', () => {
  it('未满足条件领取抛错，任务保持原状', () => {
    const guide = completeOnboardingStep(domesticGuide(), marketplaceCompletion)
    expect(() =>
      markOnboardingRewarded(guide, {
        rewardedAt: '2026-08-06T00:10:00.000Z',
        transactionId: 'onboarding-tenant-enterprise-v1',
      }),
    ).toThrow(/not claimable/i)
  })

  it('领取成功后进 rewarded 并记下 transactionId，不再可领', () => {
    const rewarded = markOnboardingRewarded(claimableGuide(), {
      rewardedAt: '2026-08-06T00:10:00.000Z',
      transactionId: 'onboarding-tenant-enterprise-v1',
    })
    expect(rewarded.status).toBe('rewarded')
    expect(rewarded.rewardTransactionId).toBe('onboarding-tenant-enterprise-v1')
    expect(canClaimOnboardingReward(rewarded)).toBe(false)
  })

  it('重复领取返回原对象，不覆盖已有 transactionId', () => {
    const rewarded = markOnboardingRewarded(claimableGuide(), {
      rewardedAt: '2026-08-06T00:10:00.000Z',
      transactionId: 'onboarding-tenant-enterprise-v1',
    })
    const again = markOnboardingRewarded(rewarded, {
      rewardedAt: '2026-08-06T00:11:00.000Z',
      transactionId: 'different-transaction',
    })
    expect(again).toBe(rewarded)
    expect(again.rewardTransactionId).toBe('onboarding-tenant-enterprise-v1')
  })

  it('已领取后不再接受新的步骤上报', () => {
    const rewarded = markOnboardingRewarded(claimableGuide(), {
      rewardedAt: '2026-08-06T00:10:00.000Z',
      transactionId: 'onboarding-tenant-enterprise-v1',
    })
    const after = completeOnboardingStep(rewarded, {
      stepKey: 'marketplace',
      completedAt: '2026-08-06T00:12:00.000Z',
      completedBy: 'user-1',
      evidenceType: 'page_visit',
      evidenceId: 'marketplace',
    })
    expect(after).toBe(rewarded)
  })
})
