/**
 * 新手指南第 1 步「浏览模型广场」的上报时序回归测试。
 *
 * 复现的真实故障：`/models` 是**公开页**，模型列表（公开接口）常常比 GET /tenants
 * 先返回。租户信息没回来时 guide 还没建，store 的 `if (!guides[tenantId]) return`
 * 会把这一步静默丢掉；而第 1 步原来挂在 marketplace_view 那个带 viewTrackedRef
 * 单次闩锁的 effect 里，闩锁一翻就再也补不回来。
 *
 * 用户看到的症状：进广场、点「去浏览」，指南一直停在 0/5，像「功能没做」。
 *
 * 这个测试把两个请求的返回顺序倒过来（模型先、租户后），断言第 1 步最终仍然完成。
 */

import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { TenantItem } from '@/types'

const listModels = vi.fn()
const listModelTags = vi.fn()
const listFeatured = vi.fn()
const listTenants = vi.fn()
const listWorkspaces = vi.fn()

const trackEvent = vi.fn()
vi.mock('@/lib/track', () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
  trackPageView: vi.fn(),
}))
vi.mock('@/services/catalog', () => ({
  listModels: () => listModels(),
  listModelTags: () => listModelTags(),
  listFeatured: () => listFeatured(),
}))
vi.mock('@/services/tenants', () => ({ listTenants: () => listTenants() }))
vi.mock('@/services/workspaces', () => ({ listWorkspaces: () => listWorkspaces() }))
vi.mock('@/hooks/useMarket', () => ({ useMarket: () => 'china' }))

// 指南状态走后端（prd#943）；这里只关心上报时序，用假替身挡住真请求
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
import { useOnboardingStore } from '@/store/use-onboarding-store'
import { toOnboardingGuideState } from '@/services/onboarding'
import ModelCatalogPage from './index'

const TENANT_ID = 'ten_1'

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

function model(id: string) {
  return {
    model_id: id,
    name: id,
    display_name: id,
    vendor: 'openai',
    tags: [],
    input_modalities: ['text'],
    output_modalities: ['text'],
  }
}

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/models']}>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

/**
 * jsdom 没有 matchMedia / IntersectionObserver，而广场页的卡片入场动画两个都用。
 * matches: false = 不减弱动效，走正常分支（本测试不关心动画，只要别抛错）。
 */
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as never
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  } as never
})

beforeEach(() => {
  trackEvent.mockClear()
  localStorage.clear()
  listModels.mockResolvedValue({ items: [model('gpt-x')] })
  listModelTags.mockResolvedValue({ items: [] })
  listFeatured.mockResolvedValue({ items: [] })
  listWorkspaces.mockResolvedValue([])
  getOnboardingGuide.mockResolvedValue({
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
    autoOpen: false,
  })
  completeOnboardingStepApi.mockResolvedValue(null)
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

function completedStepKeys() {
  return (useOnboardingStore.getState().guides[TENANT_ID]?.completedSteps ?? []).map(
    (s) => s.stepKey,
  )
}

describe('第 1 步「浏览模型广场」的上报', () => {
  it('GET /tenants 晚于模型列表返回时，第 1 步仍然完成', async () => {
    // 租户信息卡住不返回，模型列表先到 —— 这是公开页的常见时序
    let releaseTenants: (v: unknown) => void = () => {}
    listTenants.mockReturnValue(
      new Promise((resolve) => {
        releaseTenants = resolve
      }),
    )

    render(<ModelCatalogPage />, { wrapper: wrapper() })

    /**
     * 必须等 marketplace_view 真的发出 —— 它和第 1 步原来同在一个 effect 里，
     * 发出即证明「模型数据已到、viewTrackedRef 已翻」。
     * ⚠️ 别用 `listModels 被调用` 当信号：那只说明请求发出去了、数据还没回，
     * 此时 effect 根本没跑，等于没复现「模型先到」这个前提（我第一版就错在这）。
     */
    await waitFor(() =>
      expect(trackEvent.mock.calls.some((c) => c[0] === 'marketplace_view')).toBe(true),
    )
    // 此刻 guide 还没建（租户信息卡着）—— 上报会被 store 的 guard 丢掉
    expect(useOnboardingStore.getState().guides[TENANT_ID]).toBeUndefined()

    // 租户信息到位
    releaseTenants({ items: [tenant()] })

    // 第 1 步必须补上，而不是因为闩锁已翻而永久丢失
    await waitFor(() => expect(completedStepKeys()).toContain('marketplace'))
  })

  it('租户信息先到的正常顺序也只完成一次（域层幂等）', async () => {
    listTenants.mockResolvedValue({ items: [tenant()] })

    render(<ModelCatalogPage />, { wrapper: wrapper() })

    await waitFor(() => expect(completedStepKeys()).toContain('marketplace'))
    expect(completedStepKeys().filter((k) => k === 'marketplace')).toHaveLength(1)
  })

  it('匿名访客不计（规格 §7：认证后的页面访问业务事件）', async () => {
    listTenants.mockResolvedValue({ items: [tenant()] })
    useAuthStore.setState({ isAuthenticated: false, activeTenantId: null, account: null } as never)

    render(<ModelCatalogPage />, { wrapper: wrapper() })

    await waitFor(() =>
      expect(trackEvent.mock.calls.some((c) => c[0] === 'marketplace_view')).toBe(true),
    )
    expect(useOnboardingStore.getState().guides[TENANT_ID]).toBeUndefined()
  })
})
