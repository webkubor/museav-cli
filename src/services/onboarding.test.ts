/**
 * 新手指南服务层的**契约测试**（prd#943 三接口）。
 *
 * 钉的是前后端之间那几处会静默出错的落差，编译器一个都拦不住：
 *   · 五步 key 前后端不同名——写错一个，那一步永远完不成，界面上只看到"点了没反应"
 *   · reward.amount 是字符串 "10.00"——漏转数字，界面会渲染成 ¥10.00 且埋点列类型不对
 *   · 企业 Member / 未取得资格是 code=0 空 data——当成正常数据会渲染出一个空指南
 *   · 请求体字段是 snake_case 的 evidence_type / evidence_id——写成驼峰后端读不到
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()
vi.mock('@/lib/request', () => ({
  get: (...args: unknown[]) => get(...args),
  post: (...args: unknown[]) => post(...args),
}))

import { ONBOARDING_STEP_ORDER } from '@/features/onboarding/onboarding-guide-domain'
import {
  ONBOARDING_STEP_KEY_TO_API,
  claimOnboardingReward,
  completeOnboardingStepApi,
  getOnboardingGuide,
  toOnboardingGuideState,
  toOnboardingStepKey,
} from './onboarding'

const CTX = { tenantId: 'ten_1', tenantKind: 'personal', site: 'domestic' } as const

beforeEach(() => {
  get.mockReset()
  post.mockReset()
})

describe('五步 key 映射（billing pkg/model/onboarding.go 的常量）', () => {
  it('前端五个 key 一一映射到后端 step_key，没有遗漏', () => {
    expect(ONBOARDING_STEP_ORDER.map((k) => ONBOARDING_STEP_KEY_TO_API[k])).toEqual([
      'browse_marketplace',
      'model_experience',
      'create_api_key',
      'quick_integrate',
      'call_and_view_log',
    ])
  })

  it('后端 key 能映射回来，认不出的丢掉而不是塞脏值', () => {
    for (const key of ONBOARDING_STEP_ORDER) {
      expect(toOnboardingStepKey(ONBOARDING_STEP_KEY_TO_API[key])).toBe(key)
    }
    expect(toOnboardingStepKey('marketplace')).toBeNull() // 前端 key 不是后端 key
    expect(toOnboardingStepKey('some_future_step')).toBeNull()
  })
})

describe('GET /onboarding/guide 的映射', () => {
  it('金额字符串转数字、币种反推站点、步骤 key 换成前端口径', async () => {
    get.mockResolvedValue({
      status: 'in_progress',
      guide_version: 'v1',
      eligible_at: '2026-09-11T00:00:00Z',
      completed_steps: ['browse_marketplace', 'call_and_view_log'],
      reward: { currency: 'CNY', amount: '10.00', config_version: 'v1' },
      auto_open: true,
    })

    const { guide, autoOpen } = await getOnboardingGuide(CTX)

    expect(get).toHaveBeenCalledWith('tenants/ten_1/onboarding/guide')
    expect(autoOpen).toBe(true)
    expect(guide).toEqual({
      tenantId: 'ten_1',
      tenantKind: 'personal',
      guideVersion: 'v1',
      eligibleAt: '2026-09-11T00:00:00Z',
      status: 'in_progress',
      reward: { site: 'domestic', currency: 'CNY', amount: 10, configVersion: 'v1' },
      completedSteps: [{ stepKey: 'marketplace' }, { stepKey: 'request_log' }],
      rewardedAt: undefined,
      recordRef: undefined,
    })
  })

  it('海外站：USD 反推 overseas，不看调用方传的 site', async () => {
    get.mockResolvedValue({
      status: 'eligible',
      guide_version: 'v1',
      completed_steps: [],
      reward: { currency: 'USD', amount: '5.00' },
    })
    const { guide } = await getOnboardingGuide(CTX)
    expect(guide?.reward).toMatchObject({ site: 'overseas', currency: 'USD', amount: 5 })
  })

  it('企业 Member / 未取得资格：空 data 映射成 null，而不是一个空指南', async () => {
    get.mockResolvedValue({})
    await expect(getOnboardingGuide(CTX)).resolves.toEqual({ guide: null, autoOpen: false })

    expect(toOnboardingGuideState(null, CTX)).toBeNull()
    expect(toOnboardingGuideState(undefined, CTX)).toBeNull()
    expect(toOnboardingGuideState({ status: '' }, CTX)).toBeNull()
  })

  it('服务端没给币种时用调用方的站点兜底，金额脏值不炸', () => {
    const guide = toOnboardingGuideState(
      { status: 'eligible', completed_steps: ['unknown_step'], reward: { amount: 'oops' } },
      CTX,
    )
    expect(guide?.reward).toEqual({
      site: 'domestic',
      currency: '',
      amount: 0,
      configVersion: '',
    })
    // 认不出的 step_key 直接丢，不进状态
    expect(guide?.completedSteps).toEqual([])
  })

  it('已领取的租户带回流水号与领取时间', async () => {
    get.mockResolvedValue({
      status: 'rewarded',
      guide_version: 'v1',
      completed_steps: [],
      reward: { currency: 'CNY', amount: '10.00' },
      record_ref: 'txn-1',
      rewarded_at: '2026-09-11T10:00:00Z',
      auto_open: false,
    })
    const { guide } = await getOnboardingGuide(CTX)
    expect(guide).toMatchObject({
      status: 'rewarded',
      recordRef: 'txn-1',
      rewardedAt: '2026-09-11T10:00:00Z',
    })
  })
})

describe('POST /onboarding/steps/{stepKey}', () => {
  it('路径用后端 key，请求体是 snake_case 的证据字段', async () => {
    post.mockResolvedValue({
      status: 'in_progress',
      guide_version: 'v1',
      completed_steps: ['call_and_view_log'],
      reward: { currency: 'CNY', amount: '10.00' },
    })

    const guide = await completeOnboardingStepApi(CTX, 'request_log', {
      evidenceType: 'request_log_opened',
      evidenceId: 'req-123',
    })

    expect(post).toHaveBeenCalledWith('tenants/ten_1/onboarding/steps/call_and_view_log', {
      evidence_type: 'request_log_opened',
      evidence_id: 'req-123',
    })
    expect(guide?.completedSteps).toEqual([{ stepKey: 'request_log' }])
  })
})

describe('POST /onboarding/reward/claim', () => {
  it('回执同时带展示编号与流水 id —— 账单定位认后者', async () => {
    post.mockResolvedValue({
      status: 'rewarded',
      reward: { currency: 'CNY', amount: '10.00', config_version: 'v1' },
      transaction_id: 'txn-abc',
      record_ref: 'txn-abc',
    })

    const result = await claimOnboardingReward(CTX)

    expect(post).toHaveBeenCalledWith('tenants/ten_1/onboarding/reward/claim', {})
    expect(result).toEqual({
      status: 'rewarded',
      recordRef: 'txn-abc',
      transactionId: 'txn-abc',
      reward: { site: 'domestic', currency: 'CNY', amount: 10, configVersion: 'v1' },
    })
  })
})

/**
 * 映射穷尽性。`ONBOARDING_STEP_KEY_TO_API` 是 `Object.fromEntries(...) as Record<...>`，
 * 那个 cast 让 TS 不再检查五个 key 是否都在 —— 将来加第 6 步而忘了补 pair，编译照过，
 * 运行时拿到 `undefined`：请求 URL 变成 `/steps/undefined`，`evidence_id` 被 JSON.stringify
 * 整个丢掉。#1058 的补报正是靠这张表取 evidence，所以在这里钉一道。
 */
describe('步骤 key 映射', () => {
  it('五个步骤都映射到非空的后端 step_key', () => {
    for (const stepKey of ONBOARDING_STEP_ORDER) {
      expect(ONBOARDING_STEP_KEY_TO_API[stepKey]).toBeTruthy()
      expect(typeof ONBOARDING_STEP_KEY_TO_API[stepKey]).toBe('string')
    }
    expect(Object.keys(ONBOARDING_STEP_KEY_TO_API)).toHaveLength(ONBOARDING_STEP_ORDER.length)
  })
})
