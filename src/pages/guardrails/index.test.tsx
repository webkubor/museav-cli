import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import type {
  AddBudgetPolicyRequest,
  GuardrailBudgetPolicy,
  GuardrailDetail,
  UpdateBudgetPolicyRequest,
} from '@/interfaces/guardrails'

// ── service mocks: the page is a read+mutate view over @/services/guardrails ─
const listGuardrails = vi.fn<(workspaceId: string) => Promise<{ items: GuardrailDetail[] }>>()
const getGuardrail = vi.fn<(id: string) => Promise<GuardrailDetail>>()
const addBudgetPolicy = vi.fn<(id: string, body: AddBudgetPolicyRequest) => Promise<GuardrailDetail>>()
const updateBudgetPolicy = vi.fn<(id: string, policyId: string, body: UpdateBudgetPolicyRequest) => Promise<GuardrailDetail>>()
const deleteBudgetPolicy = vi.fn<(guardrailId: string, policyId: string) => Promise<GuardrailDetail>>()
const createGuardrail = vi.fn()
const updateGuardrail = vi.fn()
const deleteGuardrail = vi.fn()

vi.mock('@/services/guardrails', () => ({
  listGuardrails: (workspaceId: string) => listGuardrails(workspaceId),
  createGuardrail: (workspaceId: string, body: unknown) => createGuardrail(workspaceId, body),
  getGuardrail: (id: string) => getGuardrail(id),
  updateGuardrail: (id: string, body: unknown) => updateGuardrail(id, body),
  addBudgetPolicy: (id: string, body: AddBudgetPolicyRequest) => addBudgetPolicy(id, body),
  updateBudgetPolicy: (id: string, policyId: string, body: UpdateBudgetPolicyRequest) =>
    updateBudgetPolicy(id, policyId, body),
  deleteBudgetPolicy: (guardrailId: string, policyId: string) => deleteBudgetPolicy(guardrailId, policyId),
  deleteGuardrail: (id: string) => deleteGuardrail(id),
}))

// Sibling data sources the page mounts but this suite does not exercise.
vi.mock('@/services/catalog', () => ({
  listModels: vi.fn().mockResolvedValue({ items: [] }),
}))
vi.mock('@/services/workspaces', () => ({
  listWorkspaceMembers: vi.fn().mockResolvedValue({ items: [] }),
  listWorkspaces: vi.fn().mockResolvedValue({ items: [] }),
}))
vi.mock('@/services/api-keys', () => ({
  listApiKeys: vi.fn().mockResolvedValue([]),
}))

// Permission + platform-config hooks are page inputs, not what we test here:
// grant everything so the budget tab save/clear controls render.
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    permissions: [],
    hasPermission: () => true,
    menus: [],
    getMenuActions: () => ({}),
  }),
}))
vi.mock('@/hooks/use-platform-config', () => ({
  useCurrency: () => ({ currency: 'USD', symbol: '$' }),
}))

// The page tree consumes useTranslation's t; keys are stable, the budget tab
// labels we interact with (预算 / 保存预算) are hardcoded Chinese strings.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'zh' } }),
}))

// appToast wraps sonner (DOM portals/timers) — mock it and assert calls.
vi.mock('@/lib/app-toast', () => ({
  appToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

import { appToast } from '@/lib/app-toast'
import { useAuthStore } from '@/store/auth'
import GuardrailsPage from '@/pages/guardrails/index'

const WORKSPACE_ID = 'ws-1'
const GUARDRAIL_ID = 'g-1'
const GUARDRAIL_NAME = '测试护栏'
const OLD_POLICY_ID = 'bp-1'

function budgetPolicy(over: Partial<GuardrailBudgetPolicy>): GuardrailBudgetPolicy {
  return {
    id: OLD_POLICY_ID,
    aggregation_scope: 'guardrail_total',
    enforcement_mode: 'hard_limit',
    enabled: true,
    currency: 'USD',
    timezone: 'UTC',
    period_unit: 'month',
    period_length: 1,
    // NUMERIC(24,12)::text padding exactly as the backend echoes it (qa#156)
    spend_limit_amount: '100.000000000000',
    token_limit: 0,
    request_limit: 0,
    rate_token_limit: 0,
    rate_request_limit: 0,
    rate_window_seconds: 0,
    effective_from: '2026-06-01T00:00:00Z',
    effective_to: '', // open-ended → active policy
    ...over,
  }
}

function guardrailDetail(policies: GuardrailBudgetPolicy[]): GuardrailDetail {
  return {
    id: GUARDRAIL_ID,
    name: GUARDRAIL_NAME,
    description: '',
    status: 'active',
    is_default: false,
    priority: 0,
    scope_level: 'workspace',
    policy_id: 'pol-1',
    gateway_policy_version: 1,
    version: 1,
    tenant_id: 't-1',
    workspace_id: WORKSPACE_ID,
    metadata: {},
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    assignments: [],
    budget_policies: policies,
  }
}

// Mutable backing store so the refetch after invalidateQueries sees whatever
// the (mocked) save produced.
let detailNow: GuardrailDetail

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
  return render(<GuardrailsPage />, { wrapper: Wrapper })
}

// Open the drawer from the table row, switch to the budget tab, and wait for
// the input to be back-filled from the active policy (detail load is async).
async function openBudgetTab() {
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: GUARDRAIL_NAME }))
  fireEvent.click(await screen.findByRole('button', { name: '预算' }))
  const input = (await screen.findByRole('textbox', { name: '预算限额金额' })) as HTMLInputElement
  await waitFor(() => expect(input.value).toBe('100'))
  return input
}

beforeEach(() => {
  detailNow = guardrailDetail([budgetPolicy({})])
  listGuardrails.mockReset().mockImplementation(async () => ({ items: [detailNow] }))
  getGuardrail.mockReset().mockImplementation(async () => detailNow)
  addBudgetPolicy.mockReset()
  updateBudgetPolicy.mockReset()
  deleteBudgetPolicy.mockReset()
  createGuardrail.mockReset()
  updateGuardrail.mockReset()
  deleteGuardrail.mockReset()

  useAuthStore.setState({ activeWorkspaceId: WORKSPACE_ID })
})

afterEach(() => {
  vi.clearAllMocks()
})

// ── drawer fill: stored padded NUMERIC echoes back trimmed ────────────────────

describe('GuardrailsPage — budget input fill on drawer open', () => {
  it('fills the input with "100" when the active policy stores "100.000000000000"', async () => {
    const input = await openBudgetTab()
    // exact string, not parseFloat round-trip: the padded scale must be gone
    expect(input.value).toBe('100')
    expect(getGuardrail).toHaveBeenCalledWith(GUARDRAIL_ID)
  })
})

// ── invalid amount: reject locally, never call the service ───────────────────

describe('GuardrailsPage — invalid budget amount', () => {
  it.each([
    ['1.234', 'three fraction digits'],
    ['0', 'not > 0'],
  ])('typing %j (%s) + 保存预算 shows an error toast and calls no service', async (bad) => {
    const input = await openBudgetTab()

    fireEvent.change(input, { target: { value: bad } })
    expect(input.value).toBe(bad)

    fireEvent.click(screen.getByRole('button', { name: '保存预算' }))

    await waitFor(() => expect(appToast.error).toHaveBeenCalledTimes(1))
    expect(vi.mocked(appToast.error).mock.calls[0][0]).toContain('预算金额无效')
    expect(addBudgetPolicy).not.toHaveBeenCalled()
    expect(updateBudgetPolicy).not.toHaveBeenCalled()
    expect(deleteBudgetPolicy).not.toHaveBeenCalled()
    expect(appToast.success).not.toHaveBeenCalled()
  })
})

// ── valid amount: qa#164 single-policy maintenance — edit PATCHes the SAME
// policy in place; only the first save POSTs a new one ────────────────────────

describe('GuardrailsPage — valid budget save', () => {
  it('编辑已有预算：PATCH 同一条策略（同一 id），不新增不删除', async () => {
    updateBudgetPolicy.mockImplementation(async (_id, policyId, body) => {
      // backend edits the row in place: SAME id, NUMERIC scale padding on echo
      detailNow = guardrailDetail([
        budgetPolicy({
          id: policyId,
          spend_limit_amount: `${body.spend_limit_amount}0000000000`,
          period_unit: body.period_unit ?? 'month',
        }),
      ])
      return detailNow
    })

    const input = await openBudgetTab()

    fireEvent.change(input, { target: { value: '123.45' } })
    fireEvent.click(screen.getByRole('button', { name: '保存预算' }))

    await waitFor(() => expect(updateBudgetPolicy).toHaveBeenCalledTimes(1))
    const [guardrailId, policyId, body] = updateBudgetPolicy.mock.calls[0]
    expect(guardrailId).toBe(GUARDRAIL_ID)
    expect(policyId).toBe(OLD_POLICY_ID)
    expect(body.spend_limit_amount).toBe('123.45')
    // 只发变更字段：周期没动就不发（计费 counter 窗口不重锚），也不得泄漏
    // create-only 字段（enabled / aggregation_scope / replace_budget_policy_id）
    expect(Object.keys(body)).toEqual(['spend_limit_amount'])

    // in-place maintenance: no create, no delete, no replace
    expect(addBudgetPolicy).not.toHaveBeenCalled()
    expect(deleteBudgetPolicy).not.toHaveBeenCalled()

    await waitFor(() => expect(appToast.success).toHaveBeenCalled())
    expect(appToast.error).not.toHaveBeenCalled()

    // onSuccess back-fills the input with the trimmed saved value, so what the
    // user sees is exactly what was stored
    await waitFor(() => expect(input.value).toBe('123.45'))
  })

  it('首次设置（无预算）：POST 新增唯一一条，不带 replace 字段', async () => {
    detailNow = guardrailDetail([])
    getGuardrail.mockReset().mockImplementation(async () => detailNow)
    addBudgetPolicy.mockImplementation(async (_id, body) => {
      detailNow = guardrailDetail([
        budgetPolicy({ id: 'bp-new', spend_limit_amount: `${body.spend_limit_amount}.000000000000` }),
      ])
      return detailNow
    })

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: GUARDRAIL_NAME }))
    fireEvent.click(await screen.findByRole('button', { name: '预算' }))
    const input = (await screen.findByRole('textbox', { name: '预算限额金额' })) as HTMLInputElement
    expect(input.value).toBe('')

    fireEvent.change(input, { target: { value: '88' } })
    fireEvent.click(screen.getByRole('button', { name: '保存预算' }))

    await waitFor(() => expect(addBudgetPolicy).toHaveBeenCalledTimes(1))
    const [guardrailId, body] = addBudgetPolicy.mock.calls[0]
    expect(guardrailId).toBe(GUARDRAIL_ID)
    expect(body.spend_limit_amount).toBe('88')
    expect(body.enabled).toBe(true)
    expect(body.replace_budget_policy_id).toBeUndefined()
    expect(updateBudgetPolicy).not.toHaveBeenCalled()

    // 落库回显去尾零
    await waitFor(() => expect(input.value).toBe('88'))
  })
})

describe('GuardrailsPage — 多条生效预算策略（脏数据）防线 qa#162', () => {
  it('预算 Tab 直接报错并隐藏编辑器，保存被禁止', async () => {
    detailNow = guardrailDetail([
      budgetPolicy({ id: 'bp-new', spend_limit_amount: '500.000000000000', effective_from: '2026-06-10T00:00:00Z' }),
      budgetPolicy({ id: 'bp-old', spend_limit_amount: '100.000000000000', effective_from: '2026-06-01T00:00:00Z' }),
    ])
    getGuardrail.mockReset().mockImplementation(async () => detailNow)

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: GUARDRAIL_NAME }))
    fireEvent.click(await screen.findByRole('button', { name: '预算' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('预算配置数据错误')
    // 编辑器与保存/清除控件一概不渲染——在脏数据上替换只会加深不一致
    expect(screen.queryByRole('textbox', { name: '预算限额金额' })).toBeNull()
    expect(screen.queryByRole('button', { name: '保存预算' })).toBeNull()
    expect(addBudgetPolicy).not.toHaveBeenCalled()
    expect(updateBudgetPolicy).not.toHaveBeenCalled()
    expect(deleteBudgetPolicy).not.toHaveBeenCalled()
  })

  it('单条生效 + 历史停用策略不触发报错，回填取生效那条', async () => {
    detailNow = guardrailDetail([
      budgetPolicy({ id: 'bp-live', spend_limit_amount: '500.000000000000', effective_from: '2026-06-10T00:00:00Z' }),
      budgetPolicy({ id: 'bp-dead', enabled: false, effective_to: '2026-06-09T00:00:00Z', spend_limit_amount: '100.000000000000' }),
    ])
    getGuardrail.mockReset().mockImplementation(async () => detailNow)

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: GUARDRAIL_NAME }))
    fireEvent.click(await screen.findByRole('button', { name: '预算' }))

    const input = (await screen.findByRole('textbox', { name: '预算限额金额' })) as HTMLInputElement
    await waitFor(() => expect(input.value).toBe('500'))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('GuardrailsPage — 详情加载失败（后端 409 预算配置数据错误）qa#162', () => {
  it('抽屉内渲染错误说明，表单与保存按钮一概不出', async () => {
    getGuardrail.mockReset().mockRejectedValue(
      new Error('预算配置数据错误：存在多条生效中的预算策略'),
    )

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: GUARDRAIL_NAME }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('预算配置数据错误')
    // 防串档：失败的详情上不允许出现可保存的表单（底部保存键 = t key）
    expect(screen.queryByRole('button', { name: 'guardrails.modal.saveEdit' })).toBeNull()
    expect(screen.queryByRole('button', { name: '预算' })).toBeNull()
  })
})
