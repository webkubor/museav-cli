/**
 * useOnboardingGuide 的埋点参数位置测试（规格 §13.1 + 顶层契约字段 #423）。
 *
 * 只钉一件事，但这件事编译器和 eslint 都抓不到：**source / result / error_code 必须走
 * trackEvent 的第三个参数**。props 的类型是 Record<string, string|number|boolean>，把
 * source 塞进去完全合法、运行时也不报错，只是服务端 IngestEvent 按固定列落库、props
 * 走脱敏白名单——结果是这个字段静默消失，指标口径全错。我第一版就是这么写的。
 *
 * 顺带钉住公共属性：每条事件都要带 site / tenant_type / role / guide_version /
 * reward_currency / reward_amount / completed_steps。
 */

import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { TenantItem } from '@/types'

const trackEvent = vi.fn()
const listTenants = vi.fn()
const listWorkspaces = vi.fn()

vi.mock('@/lib/track', () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}))
vi.mock('@/services/tenants', () => ({ listTenants: () => listTenants() }))
vi.mock('@/services/workspaces', () => ({ listWorkspaces: () => listWorkspaces() }))
vi.mock('@/hooks/useMarket', () => ({ useMarket: () => 'china' }))

// 指南状态与领取都走后端（prd#943）：这里用假替身，断言的是埋点参数位置而不是网络
const getOnboardingGuide = vi.fn()
const claimOnboardingReward = vi.fn()
const completeOnboardingStepApi = vi.fn()
vi.mock('@/services/onboarding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/onboarding')>()
  return {
    ...actual,
    getOnboardingGuide: (...args: unknown[]) => getOnboardingGuide(...args),
    claimOnboardingReward: (...args: unknown[]) => claimOnboardingReward(...args),
    completeOnboardingStepApi: (...args: unknown[]) => completeOnboardingStepApi(...args),
  }
})

import { useAuthStore } from '@/store/auth'
import { useOnboardingStore } from '@/store/use-onboarding-store'
import { toOnboardingGuideState } from '@/services/onboarding'
import { useOnboardingGuide } from './use-onboarding-guide'
import { completeOnboardingStep, ONBOARDING_STEP_ORDER } from './onboarding-guide-domain'

const TENANT_ID = 'ten_1'

const SPEC_COMMON_KEYS = [
  'site',
  'tenant_type',
  'role',
  'guide_version',
  'reward_currency',
  'reward_amount',
  'completed_steps',
] as const

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

function tenant(): TenantItem {
  return {
    tenant_id: TENANT_ID,
    name: 'ModelGo',
    slug: 'modelgo',
    type: 'personal',
    role: 'tenant_owner',
    is_default: true,
  } as TenantItem
}

/** 渲染 hook 并等到 guide 建好（ensureGuide 在 effect 里，且要等角色查询回来） */
async function renderGuideHook() {
  const view = renderHook(() => useOnboardingGuide(), { wrapper: wrapper() })
  await waitFor(() => expect(view.result.current.guide).toBeDefined())
  trackEvent.mockClear() // 丢掉自动展开那条，让断言只看被测的那次调用
  return view
}

/** 服务端那份指南（eligible、¥10）—— 按需覆盖 autoOpen */
function guideResult(autoOpen = false) {
  return {
    guide: toOnboardingGuideState(
      {
        status: 'eligible',
        guide_version: 'v1',
        eligible_at: '2026-09-11T00:00:00Z',
        completed_steps: [],
        reward: { currency: 'CNY', amount: '10.00', config_version: 'v1' },
      },
      { tenantId: TENANT_ID, tenantKind: 'personal', site: 'domestic' },
    ),
    autoOpen,
  }
}

beforeEach(() => {
  trackEvent.mockClear()
  localStorage.clear()
  listTenants.mockResolvedValue({ items: [tenant()] })
  listWorkspaces.mockResolvedValue([])
  // 每个用例都从零开始数调用次数（下面有断言「第二次领取不该再打服务端」）
  getOnboardingGuide.mockReset()
  completeOnboardingStepApi.mockReset()
  claimOnboardingReward.mockReset()
  getOnboardingGuide.mockResolvedValue(guideResult())
  completeOnboardingStepApi.mockResolvedValue(null)
  claimOnboardingReward.mockResolvedValue({
    status: 'rewarded',
    recordRef: 'txn-1',
    transactionId: 'txn-1',
    reward: { site: 'domestic', currency: 'CNY', amount: 10, configVersion: 'v1' },
  })
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
  useAuthStore.setState({
    isAuthenticated: true,
    activeTenantId: TENANT_ID,
    activeWorkspaceId: null,
    tenants: [tenant()],
    account: { account_id: 'a-1', email: 'dev@example.com' },
  } as never)
})

describe('顶层契约字段的参数位置', () => {
  it('手动展开：source 在第三个参数，不在 props 里', async () => {
    const view = await renderGuideHook()
    act(() => view.result.current.handleOpenChange(true))

    const [event, props, top] = trackEvent.mock.calls.at(-1)!
    expect(event).toBe('onboarding_guide_viewed')
    expect(top).toEqual({ source: 'manual' })
    expect(props).not.toHaveProperty('source')
    for (const key of SPEC_COMMON_KEYS) expect(props).toHaveProperty(key)
  })

  it('关闭：发 onboarding_guide_closed，规格没给 source 就不编一个', async () => {
    const view = await renderGuideHook()
    act(() => view.result.current.handleOpenChange(false))

    const [event, props, top] = trackEvent.mock.calls.at(-1)!
    expect(event).toBe('onboarding_guide_closed')
    expect(top).toBeUndefined()
    for (const key of SPEC_COMMON_KEYS) expect(props).toHaveProperty(key)
  })

  it('自动展开：source=auto 同样走第三个参数（服务端说这次该弹）', async () => {
    getOnboardingGuide.mockResolvedValue(guideResult(true))
    const view = renderHook(() => useOnboardingGuide(), { wrapper: wrapper() })
    await waitFor(() => expect(view.result.current.guide).toBeDefined())
    await waitFor(() =>
      expect(
        trackEvent.mock.calls.some(
          (c) => c[0] === 'onboarding_guide_viewed' && c[2]?.source === 'auto',
        ),
      ).toBe(true),
    )
    const call = trackEvent.mock.calls.find((c) => c[2]?.source === 'auto')!
    expect(call[1]).not.toHaveProperty('source')
  })

  it('CTA 点击：step_key 是业务属性，公共属性带齐', async () => {
    const view = await renderGuideHook()
    act(() => view.result.current.handleStepAction('marketplace'))

    const [event, props] = trackEvent.mock.calls.at(-1)!
    expect(event).toBe('onboarding_step_cta_clicked')
    expect(props).toMatchObject({ step_key: 'marketplace', role: 'tenant_owner', site: 'domestic' })
    for (const key of SPEC_COMMON_KEYS) expect(props).toHaveProperty(key)
  })
})

describe('领取结果的双契约', () => {
  /** 把五步都做完，让 guide 进 claimable */
  function seedClaimable() {
    const guide = ONBOARDING_STEP_ORDER.reduce(
      (g, stepKey, i) =>
        completeOnboardingStep(g, {
          stepKey,
          completedAt: `2026-08-06T00:0${i}:00.000Z`,
          completedBy: 'tester',
          evidenceType: 'test',
          evidenceId: `e-${stepKey}`,
        }),
      useOnboardingStore.getState().guides[TENANT_ID],
    )
    useOnboardingStore.setState((s) => ({ guides: { ...s.guides, [TENANT_ID]: guide } }))
  }

  it('领取成功：顶层 result=success，规格三态放业务属性 claim_result', async () => {
    const view = await renderGuideHook()
    act(() => seedClaimable())
    await act(async () => {
      await view.result.current.handleClaim()
    })

    const submitted = trackEvent.mock.calls.find((c) => c[0] === 'onboarding_reward_claim_submitted')
    expect(submitted).toBeDefined()
    for (const key of SPEC_COMMON_KEYS) expect(submitted![1]).toHaveProperty(key)

    const [, props, top] = trackEvent.mock.calls.find(
      (c) => c[0] === 'onboarding_reward_claim_result',
    )!
    expect(top).toEqual({ result: 'success' })
    expect(props).toMatchObject({ claim_result: 'success' })
    expect(props).not.toHaveProperty('result')
  })

  it('重复领取：顶层 result=fail + error_code，业务属性记 already_claimed', async () => {
    const view = await renderGuideHook()
    act(() => seedClaimable())
    await act(async () => {
      await view.result.current.handleClaim()
    })
    trackEvent.mockClear()
    await act(async () => {
      await view.result.current.handleClaim()
    })

    const [, props, top] = trackEvent.mock.calls.find(
      (c) => c[0] === 'onboarding_reward_claim_result',
    )!
    expect(top).toEqual({ result: 'fail', error_code: 'already_claimed' })
    expect(props).toMatchObject({ claim_result: 'already_claimed' })
    expect(props).not.toHaveProperty('result')
    // 本地已是 rewarded，第二次不该再打服务端（服务端虽然幂等，但白跑一趟）
    expect(claimOnboardingReward).toHaveBeenCalledTimes(1)
  })

  it('领取失败：顶层 result=fail 带服务端错误码，业务属性记 failed', async () => {
    claimOnboardingReward.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 40301 }))
    const view = await renderGuideHook()
    act(() => seedClaimable())
    await act(async () => {
      await view.result.current.handleClaim()
    })

    const [, props, top] = trackEvent.mock.calls.find(
      (c) => c[0] === 'onboarding_reward_claim_result',
    )!
    expect(top).toEqual({ result: 'fail', error_code: '40301' })
    expect(props).toMatchObject({ claim_result: 'failed' })
    // 失败不该把本地状态推成已领取，否则入口消失、用户再也领不了
    expect(useOnboardingStore.getState().guides[TENANT_ID].status).toBe('claimable')
    expect(useOnboardingStore.getState().rewardReceipt).toBeNull()
  })
})
