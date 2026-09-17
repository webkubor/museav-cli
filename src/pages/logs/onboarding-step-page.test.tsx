/**
 * 新手指南第 ⑤ 步在**调用日志页**上的上报回归（shared/modelgo_prd#1036）。
 *
 * onboarding-step.test.ts 只证明判据本身对；这一条证明**页面真的在用它** ——
 * 把 index.tsx 里那行 `if (!canCompleteRequestLogStep(row)) return` 删掉或改回
 * 只看 status，纯函数那 8 条用例照样全绿，而这条会红。判据背后是「发出不可回收」
 * 的赠金（规格 §11），值一条页面级回归。
 *
 * 覆盖提单人实际复现的两条打开路径：手动点行、`?request_id=` 下钻自动展开。
 */

import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

const listCallLogs = vi.fn()
vi.mock('@/services/logs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/logs')>()
  return {
    ...actual,
    listCallLogs: (...args: unknown[]) => listCallLogs(...args),
    getLogPayload: vi.fn().mockResolvedValue({}),
  }
})
vi.mock('@/services/api-keys', () => ({ listApiKeys: vi.fn().mockResolvedValue({ items: [] }) }))
vi.mock('@/services/catalog', () => ({ listModels: vi.fn().mockResolvedValue({ items: [] }) }))
vi.mock('@/services/tenants', () => ({
  listTenantMembers: vi.fn().mockResolvedValue({ items: [] }),
}))
vi.mock('@/services/workspaces', () => ({ listWorkspaces: vi.fn().mockResolvedValue([]) }))
vi.mock('@/services/tasks', () => ({ getTask: vi.fn().mockResolvedValue({}) }))
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission: () => true }) }))
vi.mock('@/hooks/useMarket', () => ({ useMarket: () => 'china' }))
vi.mock('@/hooks/use-tenant-role', () => ({
  useTenantRole: () => ({
    canManage: false,
    isEnterprise: false,
    isSpaceOwner: false,
    ownedWorkspaceIds: [],
    role: 'tenant_owner',
  }),
}))
// 异步任务面板不参与本用例，挡掉它自己的请求链
vi.mock('@/pages/tasks', () => ({ AsyncTasksPanel: () => null }))
vi.mock('@/lib/track', () => ({ trackEvent: vi.fn(), trackPageView: vi.fn() }))

// 指南状态走后端（prd#943）；这里只关心「有没有上报第 ⑤ 步」
const completeOnboardingStepApi = vi.fn()
vi.mock('@/services/onboarding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/onboarding')>()
  return {
    ...actual,
    getOnboardingGuide: vi.fn(),
    completeOnboardingStepApi: (...args: unknown[]) => completeOnboardingStepApi(...args),
  }
})

import type { CallLogItem } from '@/types'
import { useAuthStore } from '@/store/auth'
import { useOnboardingStore } from '@/store/use-onboarding-store'
import { toOnboardingGuideState } from '@/services/onboarding'
import LogsPage from './index'

const TENANT_ID = 'ten_1036'
const REQUEST_ID = '228b1d59-5128-4724-a0f4-e6ae6af24157'

/** 一条成功的同步调用行，按需覆盖字段。 */
function row(over: Partial<CallLogItem> = {}): CallLogItem {
  return {
    call_log_id: 'c1',
    request_id: REQUEST_ID,
    started_at: '2026-09-15T08:18:48Z',
    duration_ms: 1200,
    model: { id: 'qwen3.6-flash', display_name: 'Qwen3.6 Flash' },
    provider: { id: 'p', name: 'aliyun', type: 'llm' },
    workspace_id: 'w',
    tenant_id: TENANT_ID,
    trace_id: 'tr',
    requested_model: 'qwen3.6-flash',
    upstream_model: 'qwen3.6-flash',
    path: '/v1/chat/completions',
    call_type: 'sync',
    http_status: 200,
    tpot_ms: 0,
    fallback_count: 0,
    api_key: { api_key_id: 'k', name: 'key', masked: '***' },
    api_key_type: 'personal',
    account: { account_id: 'a-1', display_name: 'dev' },
    app_name: null,
    status: 'succeeded',
    finish_reason: 'stop',
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      total_tokens: 2,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
    },
    usage_type: 'token',
    speed: { tps: 1, first_token_ms: 1 },
    cost: { amount: '0', currency: 'CNY' },
    billing_status: 'settled',
    error: null,
    ...over,
  }
}

function wrapper(initialEntry = '/logs') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

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
})

beforeEach(() => {
  completeOnboardingStepApi.mockReset()
  completeOnboardingStepApi.mockResolvedValue(null)
  listCallLogs.mockReset()
  useOnboardingStore.setState({
    guides: {
      [TENANT_ID]: toOnboardingGuideState(
        {
          status: 'in_progress',
          guide_version: 'v1',
          eligible_at: '2026-09-11T00:00:00Z',
          completed_steps: ['browse_marketplace'],
          reward: { currency: 'CNY', amount: '10.00', config_version: 'v1' },
        },
        { tenantId: TENANT_ID, tenantKind: 'personal', site: 'domestic' },
      )!,
    },
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
    activeWorkspaceId: 'w',
    account: { account_id: 'a-1', email: 'dev@example.com' },
  } as never)
})

/** 打开详情后，第 ⑤ 步到底有没有被上报。 */
function reportedStepKeys() {
  return completeOnboardingStepApi.mock.calls.map((call) => call[1])
}

describe('调用日志页上报第 ⑤ 步', () => {
  it('手动点开自己 Key 的成功调用 → 上报第 ⑤ 步', async () => {
    listCallLogs.mockResolvedValue({ items: [row()], limit: 15 })

    render(<LogsPage />, { wrapper: wrapper() })
    fireEvent.click(await screen.findByText('Qwen3.6 Flash'))

    await waitFor(() => expect(reportedStepKeys()).toContain('request_log'))
    expect(completeOnboardingStepApi.mock.calls[0][2]).toMatchObject({
      evidenceType: 'request_log_opened',
      evidenceId: REQUEST_ID,
    })
  })

  it('手动点开模型体验（trial）那条 → 不上报（#1036）', async () => {
    listCallLogs.mockResolvedValue({ items: [row({ api_key_type: 'trial' })], limit: 15 })

    render(<LogsPage />, { wrapper: wrapper() })
    fireEvent.click(await screen.findByText('Qwen3.6 Flash'))

    // 详情已打开（证明点击生效、不是没点到），但没有任何上报
    expect(await screen.findByText(REQUEST_ID)).toBeTruthy()
    expect(reportedStepKeys()).not.toContain('request_log')
  })

  it('?request_id= 下钻自动展开模型体验那条 → 同样不上报', async () => {
    listCallLogs.mockResolvedValue({ items: [row({ api_key_type: 'trial' })], limit: 15 })

    render(<LogsPage />, { wrapper: wrapper(`/logs?request_id=${REQUEST_ID}`) })

    expect(await screen.findByText(REQUEST_ID)).toBeTruthy()
    expect(reportedStepKeys()).not.toContain('request_log')
  })
})
