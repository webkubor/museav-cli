import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import type {
  AddBudgetPolicyRequest,
  GuardrailBudgetPolicy,
  GuardrailDetail,
} from '@/interfaces/guardrails'

// ── service mocks: the page is a read+mutate view over @/services/guardrails ─
const listGuardrails = vi.fn<(workspaceId: string) => Promise<{ items: GuardrailDetail[] }>>()
const getGuardrail = vi.fn<(id: string) => Promise<GuardrailDetail>>()
const addBudgetPolicy = vi.fn<(id: string, body: AddBudgetPolicyRequest) => Promise<GuardrailDetail>>()
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
    expect(deleteBudgetPolicy).not.toHaveBeenCalled()
    expect(appToast.success).not.toHaveBeenCalled()
  })
})

// ── valid amount: ONE atomic replace request, no delete-then-add ──────────────

describe('GuardrailsPage — valid budget save', () => {
  it('sends ONE addBudgetPolicy with the typed amount and replace_budget_policy_id of the active policy', async () => {
    addBudgetPolicy.mockImplementation(async (_id, body) => {
      // backend atomically disables the old policy and creates the new one,
      // echoing the amount with NUMERIC scale padding
      detailNow = guardrailDetail([
        budgetPolicy({ id: OLD_POLICY_ID, enabled: false }),
        budgetPolicy({
          id: 'bp-2',
          spend_limit_amount: `${body.spend_limit_amount}0000000000`,
          period_unit: body.period_unit,
        }),
      ])
      return detailNow
    })

    const input = await openBudgetTab()

    fireEvent.change(input, { target: { value: '123.45' } })
    fireEvent.click(screen.getByRole('button', { name: '保存预算' }))

    await waitFor(() => expect(addBudgetPolicy).toHaveBeenCalledTimes(1))
    const [guardrailId, body] = addBudgetPolicy.mock.calls[0]
    expect(guardrailId).toBe(GUARDRAIL_ID)
    expect(body.spend_limit_amount).toBe('123.45')
    expect(body.replace_budget_policy_id).toBe(OLD_POLICY_ID)
    expect(body.aggregation_scope).toBe('guardrail_total')
    expect(body.enabled).toBe(true)

    // the old two-request flow (DELETE then POST) must be gone (qa#156)
    expect(deleteBudgetPolicy).not.toHaveBeenCalled()
    expect(addBudgetPolicy).toHaveBeenCalledTimes(1)

    await waitFor(() => expect(appToast.success).toHaveBeenCalled())
    expect(appToast.error).not.toHaveBeenCalled()

    // onSuccess back-fills the input with the trimmed saved value, so what the
    // user sees is exactly what was stored
    await waitFor(() => expect(input.value).toBe('123.45'))
  })
})
