/**
 * 新手指南埋点契约测试（规格 §13.1）。
 *
 * 钉两件**编译器抓不到、线上也不报错、只会静默丢数据**的事：
 *
 *   1. 公共属性七项必须每条事件都带：site / tenant_type / role / guide_version /
 *      reward_currency / reward_amount / 已完成步数。漏了不会报错，只是指标算不出来。
 *
 *   2. source / result / error_code 必须走 trackEvent 的**第三个参数**。它们是服务端
 *      IngestEvent 的顶层列（#423、SDK TrackEventOptions），塞进第二个参数 props 会被
 *      脱敏白名单丢掉——类型上完全合法（props 是 Record<string, string|number|boolean>），
 *      所以只有断言参数位置才拦得住。这条我第一版就写错了。
 *
 * 另外钉住 completed_steps 用的是「完成后」的计数：用完成前的 guide 建属性会让第 5 步
 * 永远上报 4，前五步完成率直接算错。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const trackEvent = vi.fn()
vi.mock('@/lib/track', () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}))

import { useAuthStore } from '@/store/auth'
import { reportOnboardingStep, useOnboardingStore } from '@/store/use-onboarding-store'
import { buildOnboardingGuideProps } from './onboarding-track'
import { createOnboardingGuideState, ONBOARDING_STEP_ORDER } from './onboarding-guide-domain'

const SPEC_COMMON_KEYS = [
  'site',
  'tenant_type',
  'role',
  'guide_version',
  'reward_currency',
  'reward_amount',
  'completed_steps',
] as const

describe('buildOnboardingGuideProps', () => {
  it('带齐规格 §13.1 的公共属性，金额币种取快照而非当前市场', () => {
    const guide = createOnboardingGuideState({
      tenantId: 't-1',
      tenantKind: 'enterprise',
      site: 'overseas',
      eligibleAt: '2026-08-06T00:00:00.000Z',
    })
    const props = buildOnboardingGuideProps(guide, 'tenant_admin')
    for (const key of SPEC_COMMON_KEYS) expect(props).toHaveProperty(key)
    expect(props).toMatchObject({
      tenant_id: 't-1',
      tenant_type: 'enterprise',
      site: 'overseas',
      reward_currency: 'USD',
      reward_amount: 5,
      role: 'tenant_admin',
      completed_steps: 0,
    })
  })

  it('拿不到 role 时不写假值（与 use-track-context 口径一致）', () => {
    const guide = createOnboardingGuideState({
      tenantId: 't-2',
      tenantKind: 'personal',
      site: 'domestic',
      eligibleAt: '2026-08-06T00:00:00.000Z',
    })
    const props = buildOnboardingGuideProps(guide, undefined)
    expect(props).not.toHaveProperty('role')
    expect(props).toMatchObject({ reward_currency: 'CNY', reward_amount: 10 })
  })
})

describe('reportOnboardingStep 的埋点', () => {
  beforeEach(() => {
    trackEvent.mockClear()
    localStorage.clear()
    useOnboardingStore.setState({ guides: {}, trackRoles: {}, open: false, rewardReceipt: null })
    useAuthStore.setState({
      activeTenantId: 't-1',
      account: { account_id: 'a-1', email: 'dev@example.com' },
    } as never)
    useOnboardingStore.getState().ensureGuide({
      tenantId: 't-1',
      tenantKind: 'personal',
      site: 'domestic',
      role: 'tenant_owner',
    })
  })

  it('onboarding_step_completed 带齐公共属性 + step_key / evidence_type', () => {
    reportOnboardingStep('marketplace', 'marketplace_view', 'catalog')

    expect(trackEvent).toHaveBeenCalledTimes(1)
    const [event, props] = trackEvent.mock.calls[0]
    expect(event).toBe('onboarding_step_completed')
    for (const key of SPEC_COMMON_KEYS) expect(props).toHaveProperty(key)
    expect(props).toMatchObject({
      step_key: 'marketplace',
      evidence_type: 'marketplace_view',
      role: 'tenant_owner',
      site: 'domestic',
    })
  })

  it('completed_steps 是完成后的计数，不是完成前（否则最后一步永远少 1）', () => {
    ONBOARDING_STEP_ORDER.forEach((stepKey, i) => {
      reportOnboardingStep(stepKey, 'test', `e-${i}`)
    })
    const counts = trackEvent.mock.calls.map((c) => (c[1] as Record<string, number>).completed_steps)
    expect(counts).toEqual([1, 2, 3, 4, 5])
  })

  it('重复上报同一步不再埋点（领域层返回原引用）', () => {
    reportOnboardingStep('marketplace', 'marketplace_view', 'catalog')
    reportOnboardingStep('marketplace', 'marketplace_view', 'catalog')
    expect(trackEvent).toHaveBeenCalledTimes(1)
  })

  it('没有 guide 的租户（无权限 / 未取得资格）不上报也不埋点', () => {
    useOnboardingStore.setState({ guides: {}, trackRoles: {} })
    reportOnboardingStep('marketplace', 'marketplace_view', 'catalog')
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('顶层契约字段没被塞进 props —— props 里不许出现 source/result/error_code', () => {
    reportOnboardingStep('marketplace', 'marketplace_view', 'catalog')
    const props = trackEvent.mock.calls[0][1] as Record<string, unknown>
    expect(props).not.toHaveProperty('source')
    expect(props).not.toHaveProperty('result')
    expect(props).not.toHaveProperty('error_code')
  })
})

describe('ensureGuide 的 role 回填', () => {
  beforeEach(() => {
    localStorage.clear()
    useOnboardingStore.setState({ guides: {}, trackRoles: {} })
  })

  it('guide 已存在时仍会补上后到的 role（角色查询比 ensureGuide 晚回是常态）', () => {
    const { ensureGuide } = useOnboardingStore.getState()
    // 第一次：角色还没回来
    ensureGuide({ tenantId: 't-9', tenantKind: 'personal', site: 'domestic' })
    expect(useOnboardingStore.getState().trackRoles['t-9']).toBeUndefined()
    // 角色到位后再调一次（hook 的 effect 依赖里有 role）
    ensureGuide({ tenantId: 't-9', tenantKind: 'personal', site: 'domestic', role: 'tenant_owner' })
    expect(useOnboardingStore.getState().trackRoles['t-9']).toBe('tenant_owner')
  })
})
