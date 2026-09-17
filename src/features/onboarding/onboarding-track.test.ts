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
 * 另外钉住两条：completed_steps 用的是「完成后」的计数（用完成前的 guide 建属性会让第 5
 * 步永远上报 4）；上报失败**不埋点**（2026-09-14 切接口后，乐观打勾会回滚，那一步并没
 * 有真完成，先记一条会让漏斗比服务端多算）。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const trackEvent = vi.fn()
vi.mock('@/lib/track', () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}))

const getOnboardingGuide = vi.fn()
const completeOnboardingStepApi = vi.fn()
vi.mock('@/services/onboarding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/onboarding')>()
  return {
    ...actual,
    getOnboardingGuide: (...args: unknown[]) => getOnboardingGuide(...args),
    completeOnboardingStepApi: (...args: unknown[]) => completeOnboardingStepApi(...args),
  }
})

import { useAuthStore } from '@/store/auth'
import { reportOnboardingStep, useOnboardingStore } from '@/store/use-onboarding-store'
import {
  ONBOARDING_STEP_KEY_TO_API,
  toOnboardingGuideState,
  type OnboardingGuideContext,
} from '@/services/onboarding'
import { buildOnboardingGuideProps } from './onboarding-track'
import { ONBOARDING_STEP_ORDER, type OnboardingStepKey } from './onboarding-guide-domain'

const SPEC_COMMON_KEYS = [
  'site',
  'tenant_type',
  'role',
  'guide_version',
  'reward_currency',
  'reward_amount',
  'completed_steps',
] as const

const CTX: OnboardingGuideContext = {
  tenantId: 't-1',
  tenantKind: 'personal',
  site: 'domestic',
}

function guideDTO(completed: string[] = [], currency = 'CNY', amount = '10.00') {
  return {
    status: completed.length === 0 ? ('eligible' as const) : ('in_progress' as const),
    guide_version: 'v1',
    eligible_at: '2026-08-06T00:00:00.000Z',
    completed_steps: completed,
    reward: { currency, amount, config_version: 'v1' },
  }
}

/** 服务端那份进度的假替身：POST 累加步骤并回完整状态，和真接口同形状 */
function fakeServer(ctx: OnboardingGuideContext = CTX) {
  const completed: string[] = []
  getOnboardingGuide.mockResolvedValue({
    guide: toOnboardingGuideState(guideDTO(), ctx),
    autoOpen: false,
  })
  completeOnboardingStepApi.mockImplementation(async (_ctx, stepKey: OnboardingStepKey) => {
    completed.push(ONBOARDING_STEP_KEY_TO_API[stepKey])
    return toOnboardingGuideState(guideDTO([...completed]), ctx)
  })
}

async function seedGuide() {
  useOnboardingStore.getState().ensureGuide({ ...CTX, role: 'tenant_owner' })
  await vi.waitFor(() => expect(useOnboardingStore.getState().guides['t-1']).toBeDefined())
}

function resetStore() {
  useOnboardingStore.setState({
    guides: {},
    trackRoles: {},
    open: false,
    pendingAutoOpen: null,
    rewardReceipt: null,
    billingHighlight: null,
    loadingTenants: {},
    guidelessTenants: {},
    claimingTenants: {},
  })
}

describe('buildOnboardingGuideProps', () => {
  it('带齐规格 §13.1 的公共属性，金额币种取快照而非当前市场', () => {
    const guide = toOnboardingGuideState(guideDTO([], 'USD', '5.00'), {
      tenantId: 't-1',
      tenantKind: 'enterprise',
      site: 'domestic',
    })!
    const props = buildOnboardingGuideProps(guide, 'tenant_admin')
    for (const key of SPEC_COMMON_KEYS) expect(props).toHaveProperty(key)
    expect(props).toMatchObject({
      tenant_id: 't-1',
      tenant_type: 'enterprise',
      // 站点跟着奖励快照的币种走，不跟当前市场（ctx.site 传的是 domestic）
      site: 'overseas',
      reward_currency: 'USD',
      reward_amount: 5,
      role: 'tenant_admin',
      completed_steps: 0,
    })
  })

  it('拿不到 role 时不写假值（与 use-track-context 口径一致）', () => {
    const guide = toOnboardingGuideState(guideDTO(), { ...CTX, tenantId: 't-2' })!
    const props = buildOnboardingGuideProps(guide, undefined)
    expect(props).not.toHaveProperty('role')
    expect(props).toMatchObject({ reward_currency: 'CNY', reward_amount: 10 })
  })
})

describe('reportOnboardingStep 的埋点', () => {
  beforeEach(async () => {
    trackEvent.mockClear()
    getOnboardingGuide.mockReset()
    completeOnboardingStepApi.mockReset()
    resetStore()
    useAuthStore.setState({
      activeTenantId: 't-1',
      account: { account_id: 'a-1', email: 'dev@example.com' },
    } as never)
    fakeServer()
    await seedGuide()
  })

  it('onboarding_step_completed 带齐公共属性 + step_key / evidence_type', async () => {
    reportOnboardingStep('marketplace', 'marketplace_view', 'catalog')

    await vi.waitFor(() => expect(trackEvent).toHaveBeenCalledTimes(1))
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

  it('completed_steps 是完成后的计数，不是完成前（否则最后一步永远少 1）', async () => {
    ONBOARDING_STEP_ORDER.forEach((stepKey, i) => {
      reportOnboardingStep(stepKey, 'test', `e-${i}`)
    })
    await vi.waitFor(() => expect(trackEvent).toHaveBeenCalledTimes(5))
    const counts = trackEvent.mock.calls.map((c) => (c[1] as Record<string, number>).completed_steps)
    expect(counts).toEqual([1, 2, 3, 4, 5])
  })

  it('重复上报同一步不再埋点、也不再发请求（领域层返回原引用）', async () => {
    reportOnboardingStep('marketplace', 'marketplace_view', 'catalog')
    await vi.waitFor(() => expect(trackEvent).toHaveBeenCalledTimes(1))
    reportOnboardingStep('marketplace', 'marketplace_view', 'catalog')
    await Promise.resolve()
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(completeOnboardingStepApi).toHaveBeenCalledTimes(1)
  })

  it('上报失败：乐观打的勾回滚，不埋点（那一步并没有真完成）', async () => {
    completeOnboardingStepApi.mockRejectedValueOnce(new Error('network down'))
    const before = useOnboardingStore.getState().guides['t-1']

    reportOnboardingStep('marketplace', 'marketplace_view', 'catalog')

    await vi.waitFor(() => {
      expect(useOnboardingStore.getState().guides['t-1']).toBe(before)
    })
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('没有 guide 的租户（无权限 / 未取得资格）不上报也不埋点', async () => {
    resetStore()
    reportOnboardingStep('marketplace', 'marketplace_view', 'catalog')
    await Promise.resolve()
    expect(trackEvent).not.toHaveBeenCalled()
    expect(completeOnboardingStepApi).not.toHaveBeenCalled()
  })

  it('顶层契约字段没被塞进 props —— props 里不许出现 source/result/error_code', async () => {
    reportOnboardingStep('marketplace', 'marketplace_view', 'catalog')
    await vi.waitFor(() => expect(trackEvent).toHaveBeenCalledTimes(1))
    const props = trackEvent.mock.calls[0][1] as Record<string, unknown>
    expect(props).not.toHaveProperty('source')
    expect(props).not.toHaveProperty('result')
    expect(props).not.toHaveProperty('error_code')
  })
})

describe('ensureGuide 的请求纪律', () => {
  beforeEach(() => {
    getOnboardingGuide.mockReset()
    completeOnboardingStepApi.mockReset()
    resetStore()
    fakeServer({ ...CTX, tenantId: 't-9' })
  })

  it('guide 已存在时仍会补上后到的 role（角色查询比 ensureGuide 晚回是常态）', async () => {
    const { ensureGuide } = useOnboardingStore.getState()
    // 第一次：角色还没回来
    ensureGuide({ tenantId: 't-9', tenantKind: 'personal', site: 'domestic' })
    expect(useOnboardingStore.getState().trackRoles['t-9']).toBeUndefined()
    // 角色到位后再调一次（hook 的 effect 依赖里有 role）
    ensureGuide({ tenantId: 't-9', tenantKind: 'personal', site: 'domestic', role: 'tenant_owner' })
    expect(useOnboardingStore.getState().trackRoles['t-9']).toBe('tenant_owner')
  })

  /**
   * auto_open 读一次即消费：两个入口同帧各调一次 ensureGuide，若都发 GET，第二个会拿到
   * false 并盖掉第一个的 true，自动展开就没了。这里钉住「同一租户只发一次」。
   */
  it('并发调用只发一次 GET，auto_open 不会被第二次请求吞掉', async () => {
    getOnboardingGuide.mockResolvedValue({
      guide: toOnboardingGuideState(guideDTO(), { ...CTX, tenantId: 't-9' }),
      autoOpen: true,
    })
    const { ensureGuide } = useOnboardingStore.getState()
    ensureGuide({ tenantId: 't-9', tenantKind: 'personal', site: 'domestic' })
    ensureGuide({ tenantId: 't-9', tenantKind: 'personal', site: 'domestic' })

    await vi.waitFor(() => expect(useOnboardingStore.getState().guides['t-9']).toBeDefined())
    expect(getOnboardingGuide).toHaveBeenCalledTimes(1)
    expect(useOnboardingStore.getState().pendingAutoOpen).toBe('t-9')
  })

  it('没有指南的租户（Member / 未取得资格）不重复问', async () => {
    getOnboardingGuide.mockResolvedValue({ guide: null, autoOpen: false })
    const { ensureGuide } = useOnboardingStore.getState()
    ensureGuide({ tenantId: 't-9', tenantKind: 'enterprise', site: 'domestic' })
    await vi.waitFor(() =>
      expect(useOnboardingStore.getState().guidelessTenants['t-9']).toBe(true),
    )
    ensureGuide({ tenantId: 't-9', tenantKind: 'enterprise', site: 'domestic' })
    expect(getOnboardingGuide).toHaveBeenCalledTimes(1)
    expect(useOnboardingStore.getState().guides['t-9']).toBeUndefined()
  })
})
