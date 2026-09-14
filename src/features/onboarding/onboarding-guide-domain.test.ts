/**
 * 新手指南领域层测试 —— 从 PRD 原型的 node 断言脚本改写成 vitest。
 * 来源：modelgo_prd/scripts/test-onboarding-guide-domain.mjs
 * 覆盖规格 §16.1 的：状态推进 / 权限 / 金额展示 / 领取镜像 / 幂等。
 *
 * ⚠️ 2026-09-14 切接口后，「取得资格」「发不发奖」由服务端判，前端不再有等价实现，
 * 所以这里的 fixture 从**真实接口载荷**经 services/onboarding 的映射生成 —— 契约变了
 * 这些测试要一起红，比自己 new 一个领域对象更能兜住前后端不一致。
 */

import { describe, expect, it } from 'vitest'
import { toOnboardingGuideState, type OnboardingGuideDTO } from '@/services/onboarding'
import {
  canAccessOnboardingGuide,
  canClaimOnboardingReward,
  completeOnboardingStep,
  formatOnboardingReward,
  markOnboardingRewarded,
  nextOnboardingStep,
  type OnboardingGuideState,
  type OnboardingStepCompletion,
} from './onboarding-guide-domain'

const ELIGIBLE_AT = '2026-08-06T00:00:00.000Z'

function guideFromApi(dto: OnboardingGuideDTO, kind: 'personal' | 'enterprise' = 'enterprise') {
  return toOnboardingGuideState(dto, {
    tenantId: kind === 'enterprise' ? 'tenant-enterprise' : 'tenant-overseas',
    tenantKind: kind,
    site: 'domestic',
  }) as OnboardingGuideState
}

function domesticGuide() {
  return guideFromApi({
    status: 'eligible',
    guide_version: 'v1',
    eligible_at: ELIGIBLE_AT,
    completed_steps: [],
    reward: { currency: 'CNY', amount: '10.00', config_version: 'v1' },
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

describe('金额快照的展示（规格 §8.2：展示的是快照，不是当前配置）', () => {
  it('国内站 CNY 10 渲染成 ¥10（服务端给的 "10.00" 不带到界面上）', () => {
    const guide = domesticGuide()
    expect(guide.guideVersion).toBe('v1')
    expect(guide.status).toBe('eligible')
    expect(guide.completedSteps).toEqual([])
    expect(guide.reward).toEqual({
      site: 'domestic',
      currency: 'CNY',
      amount: 10,
      configVersion: 'v1',
    })
    expect(formatOnboardingReward(guide.reward)).toBe('¥10')
  })

  it('海外站 USD 5 渲染成 $5，站点由币种反推', () => {
    const guide = guideFromApi(
      {
        status: 'eligible',
        guide_version: 'v1',
        eligible_at: ELIGIBLE_AT,
        completed_steps: [],
        reward: { currency: 'USD', amount: '5.00', config_version: 'v1' },
      },
      'personal',
    )
    expect(guide.reward.site).toBe('overseas')
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

describe('步骤推进（本地乐观更新，服务端回来后整份覆盖）', () => {
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
    // 引用相等是契约的一部分：调用方据此跳过 setState 与 POST，避免无谓请求和重渲染
    expect(repeated).toBe(guide)
  })

  it('五步齐了进 claimable，无下一项', () => {
    const guide = claimableGuide()
    expect(guide.status).toBe('claimable')
    expect(guide.completedSteps).toHaveLength(5)
    expect(nextOnboardingStep(guide)).toBeNull()
    expect(canClaimOnboardingReward(guide)).toBe(true)
  })

  it('服务端只回 step key，时间/证据字段缺省也能正常判进度', () => {
    const guide = guideFromApi({
      status: 'in_progress',
      guide_version: 'v1',
      eligible_at: ELIGIBLE_AT,
      completed_steps: ['browse_marketplace', 'model_experience'],
      reward: { currency: 'CNY', amount: '10.00' },
    })
    expect(guide.completedSteps).toEqual([{ stepKey: 'marketplace' }, { stepKey: 'playground' }])
    expect(nextOnboardingStep(guide)).toBe('api_key')
    expect(canClaimOnboardingReward(guide)).toBe(false)
  })
})

describe('领取镜像与幂等（规格 §11）', () => {
  it('没到 claimable 就不给领（按钮的闸门），服务端另有一道', () => {
    const guide = completeOnboardingStep(domesticGuide(), marketplaceCompletion)
    expect(canClaimOnboardingReward(guide)).toBe(false)
  })

  it('领取成功后进 rewarded 并记下流水号，不再可领', () => {
    const rewarded = markOnboardingRewarded(claimableGuide(), {
      rewardedAt: '2026-08-06T00:10:00.000Z',
      transactionId: 'txn-onboarding-1',
      recordRef: 'txn-onboarding-1',
    })
    expect(rewarded.status).toBe('rewarded')
    expect(rewarded.rewardTransactionId).toBe('txn-onboarding-1')
    expect(canClaimOnboardingReward(rewarded)).toBe(false)
  })

  it('重复领取返回原对象，不覆盖首次的流水号与时间', () => {
    const rewarded = markOnboardingRewarded(claimableGuide(), {
      rewardedAt: '2026-08-06T00:10:00.000Z',
      transactionId: 'txn-onboarding-1',
    })
    const again = markOnboardingRewarded(rewarded, {
      rewardedAt: '2026-08-06T00:11:00.000Z',
      transactionId: 'different-transaction',
    })
    expect(again).toBe(rewarded)
    expect(again.rewardTransactionId).toBe('txn-onboarding-1')
  })

  it('已领取后不再接受新的步骤上报', () => {
    const rewarded = markOnboardingRewarded(claimableGuide(), {
      rewardedAt: '2026-08-06T00:10:00.000Z',
      transactionId: 'txn-onboarding-1',
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
