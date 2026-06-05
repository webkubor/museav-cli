import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import type { TenantBrief } from '@/types'
import type { ReferralOverview } from '@/services/referral'

// ── service mock: the page is a read+mutate view over @/services/referral ────
const getReferralOverview = vi.fn<(tenantId: string) => Promise<ReferralOverview>>()
const listReferralInvitees = vi.fn().mockResolvedValue([])
const listWithdrawals = vi.fn().mockResolvedValue([])
const transferRewardToBalance =
  vi.fn<(tenantId: string, body: { amount: string; idempotency_key: string }) => Promise<unknown>>()
const requestWithdrawal = vi.fn().mockResolvedValue({})

vi.mock('@/services/referral', () => ({
  getReferralOverview: (tenantId: string) => getReferralOverview(tenantId),
  listReferralInvitees: (tenantId: string) => listReferralInvitees(tenantId),
  listWithdrawals: (tenantId: string) => listWithdrawals(tenantId),
  transferRewardToBalance: (tenantId: string, body: { amount: string; idempotency_key: string }) =>
    transferRewardToBalance(tenantId, body),
  requestWithdrawal: (tenantId: string, body: unknown) => requestWithdrawal(tenantId, body),
}))

// The page consumes useTranslation ONLY for i18n.language (zh/en copy + region).
// Pin it to zh so we can target the Chinese labels deterministically.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'zh' } }),
}))

// appToast wraps sonner (DOM portals/timers) — silence it, we assert behavior
// (mutation calls, invalidation, modal close), not toast rendering.
vi.mock('@/lib/app-toast', () => ({
  appToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

import { useAuthStore } from '@/store/auth'
import ReferralPage from '@/pages/referral/index'

const DEFAULT_TENANT_ID = 't-default'
const ORG_TENANT_ID = 't-org'

function tenant(id: string, isDefault: boolean): TenantBrief {
  return { tenant_id: id, name: id, slug: id, type: 'enterprise', is_default: isDefault }
}

const OVERVIEW: ReferralOverview = {
  stats: {
    totalCommission: '5900',
    monthCommission: '980',
    activeInvited: 3,
    invitedTotal: 5,
    rewardBalance: '1420', // ≥ MIN_AMOUNT (100) so transfer/withdraw are enabled
  },
  tier: {
    name: '核心伙伴',
    rate: 13,
    cumulativeSpend: '59000',
    nextThreshold: '200000',
    nextTierName: '战略伙伴',
    nextRate: 15,
  },
  inviteLink: 'https://console.modelgo.com/signup?aff=MG-TEST',
  inviteCode: 'MG-TEST',
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
  const utils = render(<ReferralPage />, { wrapper: Wrapper })
  return { ...utils, queryClient, invalidateSpy }
}

beforeEach(() => {
  getReferralOverview.mockReset().mockResolvedValue(OVERVIEW)
  listReferralInvitees.mockClear()
  listWithdrawals.mockClear()
  transferRewardToBalance.mockReset()
  requestWithdrawal.mockClear()

  // active org is the NON-default org — the page must still scope to the default.
  useAuthStore.setState({
    activeTenantId: ORG_TENANT_ID,
    tenants: [tenant(DEFAULT_TENANT_ID, true), tenant(ORG_TENANT_ID, false)],
  })

  // deterministic, observable idempotency keys
  let n = 0
  vi.spyOn(crypto, 'randomUUID').mockImplementation(
    () => `00000000-0000-4000-8000-00000000000${++n}` as `${string}-${string}-${string}-${string}-${string}`
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── (a) default-tenant scoping — qa/ai-quality-platform#96 ───────────────────

describe('ReferralPage — default-tenant scoping (#96)', () => {
  it('queries the DEFAULT tenant, not the active org, for the referral overview', async () => {
    renderPage()
    await waitFor(() => expect(getReferralOverview).toHaveBeenCalled())
    expect(getReferralOverview).toHaveBeenCalledWith(DEFAULT_TENANT_ID)
    expect(getReferralOverview).not.toHaveBeenCalledWith(ORG_TENANT_ID)
    // invitees + withdrawals queries are scoped identically
    expect(listReferralInvitees).toHaveBeenCalledWith(DEFAULT_TENANT_ID)
    expect(listWithdrawals).toHaveBeenCalledWith(DEFAULT_TENANT_ID)
  })

  it('falls back to the active tenant when no default tenant exists', async () => {
    useAuthStore.setState({
      activeTenantId: ORG_TENANT_ID,
      tenants: [tenant(ORG_TENANT_ID, false)],
    })
    renderPage()
    await waitFor(() => expect(getReferralOverview).toHaveBeenCalled())
    expect(getReferralOverview).toHaveBeenCalledWith(ORG_TENANT_ID)
  })
})

// ── (b) stable idempotency key across retries, fresh on reopen ───────────────

// Render the page, then open the transfer modal. The reward-balance KPI button
// is disabled (rewardBalance <= 0) until the overview query settles, so wait for
// the enabled state before clicking. Returns the confirm button + the page's
// invalidateQueries spy.
async function openTransferModal() {
  const utils = renderPage()
  await screen.findByText('推荐计划')
  const open = await screen.findByRole('button', { name: '转入主余额' })
  await waitFor(() => expect(open).not.toBeDisabled())
  fireEvent.click(open)
  // modal footer confirm button proves the modal is open
  const confirm = await screen.findByRole('button', { name: '确认转入' })
  return { confirm, ...utils }
}

describe('ReferralPage — transfer idempotency key lifecycle', () => {

  it('reuses the SAME idempotency_key when a failed transfer is retried', async () => {
    transferRewardToBalance.mockRejectedValueOnce(new Error('boom'))
    transferRewardToBalance.mockResolvedValueOnce({ reward_balance: '0', main_balance: '1420' })

    const { confirm } = await openTransferModal()

    fireEvent.click(confirm)
    await waitFor(() => expect(transferRewardToBalance).toHaveBeenCalledTimes(1))
    const firstKey = transferRewardToBalance.mock.calls[0][1].idempotency_key
    expect(firstKey).toBeTruthy()

    // retry the same confirm action after the failure — must NOT mint a new key
    fireEvent.click(confirm)
    await waitFor(() => expect(transferRewardToBalance).toHaveBeenCalledTimes(2))
    const secondKey = transferRewardToBalance.mock.calls[1][1].idempotency_key
    expect(secondKey).toBe(firstKey)
  })

  it('mints a NEW idempotency_key after closing and reopening the modal', async () => {
    transferRewardToBalance.mockRejectedValue(new Error('boom'))

    const { confirm: confirm1 } = await openTransferModal()
    fireEvent.click(confirm1)
    await waitFor(() => expect(transferRewardToBalance).toHaveBeenCalledTimes(1))
    const firstKey = transferRewardToBalance.mock.calls[0][1].idempotency_key

    // close the modal (onClose) — Radix exposes a Close button labelled "Close"
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '确认转入' })).not.toBeInTheDocument()
    )

    // reopen → new randomUUID() → different key
    fireEvent.click(screen.getByRole('button', { name: '转入主余额' }))
    const confirm2 = await screen.findByRole('button', { name: '确认转入' })
    fireEvent.click(confirm2)
    await waitFor(() => expect(transferRewardToBalance).toHaveBeenCalledTimes(2))
    const secondKey = transferRewardToBalance.mock.calls[1][1].idempotency_key
    expect(secondKey).not.toBe(firstKey)
  })

  it('sends a non-empty amount and key matching the consumable reward balance', async () => {
    transferRewardToBalance.mockResolvedValue({ reward_balance: '0', main_balance: '2840' })
    const { confirm } = await openTransferModal()
    fireEvent.click(confirm)
    await waitFor(() => expect(transferRewardToBalance).toHaveBeenCalledTimes(1))
    const [tenantId, body] = transferRewardToBalance.mock.calls[0]
    expect(tenantId).toBe(DEFAULT_TENANT_ID)
    expect(body.amount).toBe('1420') // prefilled to full reward balance
    expect(body.idempotency_key).not.toBe('')
  })
})

// ── (c) success → invalidate queries + close modal ───────────────────────────

describe('ReferralPage — transfer success side effects', () => {
  it('invalidates the money views and closes the modal on success', async () => {
    transferRewardToBalance.mockResolvedValue({ reward_balance: '0', main_balance: '2840' })

    const { confirm, invalidateSpy } = await openTransferModal()

    invalidateSpy.mockClear() // ignore mount-time cache churn
    fireEvent.click(confirm)

    await waitFor(() => expect(transferRewardToBalance).toHaveBeenCalledTimes(1))

    // overview + balance views invalidated, scoped to the default tenant
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['referral', 'overview', DEFAULT_TENANT_ID],
      })
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['balance', DEFAULT_TENANT_ID] })

    // modal closes
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '确认转入' })).not.toBeInTheDocument()
    )
  })
})

// ── render smoke: data lands in the view ─────────────────────────────────────

describe('ReferralPage — render', () => {
  it('renders KPI + invite info from the overview response', async () => {
    renderPage()
    expect(await screen.findByText('推荐计划')).toBeInTheDocument()
    // reward balance KPI shows the formatted ¥ amount
    expect(await screen.findByText('¥1,420')).toBeInTheDocument()
    // invite code from the response
    expect(screen.getByDisplayValue('https://console.modelgo.com/signup?aff=MG-TEST')).toBeInTheDocument()
  })

  it('shows the empty state in the invitees table when there are no invitees', async () => {
    renderPage()
    await screen.findByText('推荐计划')
    // default tab is invitees; service returned [] → empty row
    const empties = await screen.findAllByText('暂无记录')
    expect(empties.length).toBeGreaterThan(0)
    // exactly one cell carries it within the active table body
    expect(within(empties[0].closest('table') as HTMLElement).getByText('暂无记录')).toBeInTheDocument()
  })
})
