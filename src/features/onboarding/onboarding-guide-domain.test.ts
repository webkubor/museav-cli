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
  completesImpliedSteps,
  formatOnboardingReward,
  impliedOnboardingSteps,
  markOnboardingRewarded,
  nextOnboardingStep,
  rollbackOnboardingStep,
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

/**
 * 蕴含关系（shared/modelgo_prd#1058：完成 ⑤ 之后 ④ 自动完成）。
 * 只有「⑤ 已完成 + ④ 还没完成 + 没领过奖」这一种组合才该补，其余都不发请求。
 */
describe('步骤蕴含', () => {
  function withSteps(steps: string[], status: 'in_progress' | 'claimable' | 'rewarded' = 'in_progress') {
    return guideFromApi({
      status,
      guide_version: 'v1',
      eligible_at: ELIGIBLE_AT,
      completed_steps: steps,
      reward: { currency: 'CNY', amount: '10.00', config_version: 'v1' },
    })
  }

  it('⑤ 完成而 ④ 没完成 → 该补 ④，并带上是谁蕴含的', () => {
    const guide = withSteps(['browse_marketplace', 'model_experience', 'create_api_key', 'call_and_view_log'])
    expect(impliedOnboardingSteps(guide)).toEqual([
      { stepKey: 'quick_connect', impliedBy: 'request_log' },
    ])
  })

  it('④ 已完成 → 没有要补的', () => {
    const guide = withSteps(['create_api_key', 'quick_integrate', 'call_and_view_log'])
    expect(impliedOnboardingSteps(guide)).toEqual([])
  })

  it('⑤ 没完成 → 不倒推：④ 不会被别的步骤点亮', () => {
    const guide = withSteps(['browse_marketplace', 'model_experience', 'create_api_key'])
    expect(impliedOnboardingSteps(guide)).toEqual([])
  })

  it('已领取 → 不再补，状态机只向前', () => {
    const guide = withSteps(
      ['browse_marketplace', 'model_experience', 'create_api_key', 'call_and_view_log'],
      'rewarded',
    )
    expect(impliedOnboardingSteps(guide)).toEqual([])
  })

  it('只有 ⑤ 是触发方 —— 补出来的 ④ 自己不会再触发一轮对账', () => {
    expect(completesImpliedSteps('request_log')).toBe(true)
    expect(completesImpliedSteps('quick_connect')).toBe(false)
    expect(completesImpliedSteps('marketplace')).toBe(false)
    expect(completesImpliedSteps('playground')).toBe(false)
    expect(completesImpliedSteps('api_key')).toBe(false)
  })
})

/** 上报失败时的撤回 —— 决定「领取」按钮能不能点，错了就是让用户点了拿 400 */
describe('撤回一步', () => {
  function withSteps(steps: string[], status: 'in_progress' | 'claimable' | 'rewarded' = 'in_progress') {
    return guideFromApi({
      status,
      guide_version: 'v1',
      eligible_at: ELIGIBLE_AT,
      completed_steps: steps,
      reward: { currency: 'CNY', amount: '10.00', config_version: 'v1' },
    })
  }

  it('摘掉指定那步，五步齐时从 claimable 退回 in_progress', () => {
    const claimable = withSteps(
      ['browse_marketplace', 'model_experience', 'create_api_key', 'quick_integrate', 'call_and_view_log'],
      'claimable',
    )
    const after = rollbackOnboardingStep(claimable, 'quick_connect')
    expect(after.completedSteps.map((item) => item.stepKey)).toEqual([
      'marketplace',
      'playground',
      'api_key',
      'request_log',
    ])
    expect(after.status).toBe('in_progress')
  })

  it('摘到空退回 eligible —— 与服务端「还没推进过」同义', () => {
    const after = rollbackOnboardingStep(withSteps(['browse_marketplace']), 'marketplace')
    expect(after.completedSteps).toEqual([])
    expect(after.status).toBe('eligible')
  })

  it('本来就没完成那步 → 原样返回（引用不变，调用方据此跳过 setState）', () => {
    const guide = withSteps(['browse_marketplace'])
    expect(rollbackOnboardingStep(guide, 'quick_connect')).toBe(guide)
  })

  it('已领取不回滚 —— 钱已经发了，状态机只向前', () => {
    const rewarded = withSteps(
      ['browse_marketplace', 'model_experience', 'create_api_key', 'quick_integrate', 'call_and_view_log'],
      'rewarded',
    )
    expect(rollbackOnboardingStep(rewarded, 'quick_connect')).toBe(rewarded)
  })
})
