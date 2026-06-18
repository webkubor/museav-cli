import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import type { CursorPage, TenantBrief } from '@/types'
import type { ReferralOverview } from '@/services/referral'
import type { ReferralCommissionRecord, ReferralInvitee } from '@/pages/referral/referral-data'

// reward-records is now a server-side cursor page; default = single empty page.
const emptyRewardPage: CursorPage<ReferralCommissionRecord> = {
  items: [],
  page_size: 15,
  has_more: false,
  next_cursor: null,
}

// invitees is now a server-side cursor page; default = single empty page.
const emptyInviteesPage: CursorPage<ReferralInvitee> = {
  items: [],
  page_size: 15,
  has_more: false,
  next_cursor: null,
}

// ── service mock: the page is a read+mutate view over @/services/referral ────
const getReferralOverview = vi.fn<(tenantId: string) => Promise<ReferralOverview>>()
const listReferralInvitees =
  vi.fn<
    (
      tenantId: string,
      params?: { cursor?: string; page_size?: number }
    ) => Promise<CursorPage<ReferralInvitee>>
  >().mockResolvedValue(emptyInviteesPage)
const listRewardRecords =
  vi.fn<
    (
      tenantId: string,
      params?: { cursor?: string; page_size?: number }
    ) => Promise<CursorPage<ReferralCommissionRecord>>
  >().mockResolvedValue(emptyRewardPage)
const listWithdrawals = vi.fn().mockResolvedValue([])
const transferRewardToBalance =
  vi.fn<(tenantId: string, body: { amount: string; idempotency_key: string }) => Promise<unknown>>()
const requestWithdrawal = vi.fn().mockResolvedValue({})

vi.mock('@/services/referral', () => ({
  getReferralOverview: (tenantId: string) => getReferralOverview(tenantId),
  listReferralInvitees: (tenantId: string, params?: { cursor?: string; page_size?: number }) =>
    listReferralInvitees(tenantId, params),
  listRewardRecords: (tenantId: string, params?: { cursor?: string; page_size?: number }) =>
    listRewardRecords(tenantId, params),
  listWithdrawals: (tenantId: string) => listWithdrawals(tenantId),
  transferRewardToBalance: (tenantId: string, body: { amount: string; idempotency_key: string }) =>
    transferRewardToBalance(tenantId, body),
  requestWithdrawal: (tenantId: string, body: unknown) => requestWithdrawal(tenantId, body),
}))

// The page consumes useTranslation ONLY for i18n.language (zh/en copy + region).
// Pin it to zh so we can target the Chinese labels deterministically.
// The page uses i18n.language for zh/en copy; the shared Pagination component
// uses t('common.pagination.*'). Pin language to zh and pass keys through so the
// pager renders without pulling the full i18n catalog.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && 'count' in opts ? `${key}:${String(opts.count)}` : key,
    i18n: { language: 'zh' },
  }),
}))

// appToast wraps sonner (DOM portals/timers) — silence it, we assert behavior
// (mutation calls, invalidation, modal close), not toast rendering.
vi.mock('@/lib/app-toast', () => ({
  appToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    hasPermission: () => true,
    permissions: [],
    menus: [],
    getMenuActions: () => ({}),
  }),
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
    todayCommission: '80',
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
  listReferralInvitees.mockReset().mockResolvedValue(emptyInviteesPage)
  listRewardRecords.mockReset().mockResolvedValue(emptyRewardPage)
  listWithdrawals.mockClear()
  transferRewardToBalance.mockReset()
  requestWithdrawal.mockClear()

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

// ── (a) active-tenant scoping — qa/ai-quality-platform#157 ───────────────────

describe('ReferralPage — active-tenant scoping (#157)', () => {
  it('queries the active tenant for the referral overview', async () => {
    renderPage()
    await waitFor(() => expect(getReferralOverview).toHaveBeenCalled())
    expect(getReferralOverview).toHaveBeenCalledWith(ORG_TENANT_ID)
    expect(getReferralOverview).not.toHaveBeenCalledWith(DEFAULT_TENANT_ID)
    // invitees + withdrawals queries are scoped identically
    expect(listReferralInvitees).toHaveBeenCalledWith(ORG_TENANT_ID, {
      cursor: undefined,
      page_size: 15,
    })
    expect(listWithdrawals).toHaveBeenCalledWith(ORG_TENANT_ID)
  })

  it('falls back to the default tenant when no active tenant exists', async () => {
    useAuthStore.setState({
      activeTenantId: null,
      tenants: [tenant(DEFAULT_TENANT_ID, true)],
    })
    renderPage()
    await waitFor(() => expect(getReferralOverview).toHaveBeenCalled())
    expect(getReferralOverview).toHaveBeenCalledWith(DEFAULT_TENANT_ID)
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
    expect(tenantId).toBe(ORG_TENANT_ID)
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

    // overview + balance views invalidated, scoped to the active tenant
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['referral', 'overview', ORG_TENANT_ID],
      })
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['balance', ORG_TENANT_ID] })

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
    // invite link is tenant-scoped via inviteCode and uses the current frontend origin.
    const expectedLink = `${window.location.origin}/signup?aff=MG-TEST`
    expect(screen.getAllByText(expectedLink).length).toBeGreaterThan(0)
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

// ── invitees pagination — server-side cursor flow ────────────────────────────

describe('ReferralPage — invitees cursor pagination', () => {
  // 23 invitees served by the backend over 2 cursor pages at page_size=15 (15 / 8).
  const INVITEES: ReferralInvitee[] = Array.from({ length: 23 }, (_, i) => ({
    name: `invitee-${i}`,
    email: `invitee-${i}@example.com`,
    registeredAt: `2026-06-${String(i + 1).padStart(2, '0')}`,
    totalSpend: '100',
    commission: '10',
    tierName: '成长伙伴',
    tierRate: 10,
  }))

  // Cursor-aware fake: first page (no cursor) → 0..14 has_more; cursor 'c1' → 15..22 last.
  function pageInvitees(cursor: string | undefined): CursorPage<ReferralInvitee> {
    if (!cursor) {
      return { items: INVITEES.slice(0, 15), page_size: 15, has_more: true, next_cursor: 'c1' }
    }
    return { items: INVITEES.slice(15), page_size: 15, has_more: false, next_cursor: null }
  }
  const cursorMock = (
    _tenantId: string,
    params?: { cursor?: string; page_size?: number }
  ) => Promise.resolve(pageInvitees(params?.cursor))

  // Invitees is the default tab; scope to its table via the unique 返佣窗口 header.
  async function openInviteesTab() {
    renderPage()
    await screen.findByText('推荐计划')
    const windowHeader = await screen.findByText('返佣窗口')
    return windowHeader.closest('table') as HTMLElement
  }

  it('renders only the first backend page with a working cursor pager', async () => {
    listReferralInvitees.mockImplementation(cursorMock)
    const table = await openInviteesTab()

    // page 1: first cursor request carries no cursor + page_size=15
    await waitFor(() => expect(within(table).getByText('invitee-0')).toBeInTheDocument())
    expect(listReferralInvitees).toHaveBeenCalledWith(ORG_TENANT_ID, {
      cursor: undefined,
      page_size: 15,
    })
    // 15 body rows + 1 header; the cursor page badge shows
    expect(within(table).getAllByRole('row')).toHaveLength(16)
    expect(screen.getByText('common.pagination.page')).toBeInTheDocument()
    expect(within(table).queryByText('invitee-15')).not.toBeInTheDocument()
    // next enabled (has_more), prev disabled on page 1
    expect(screen.getByRole('button', { name: 'common.pagination.next' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'common.pagination.prev' })).toBeDisabled()
  })

  it('pages forward via next_cursor to the last page and back', async () => {
    listReferralInvitees.mockImplementation(cursorMock)
    const table = await openInviteesTab()
    await waitFor(() => expect(within(table).getByText('invitee-0')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'common.pagination.next' }))
    // page 2 requests the next_cursor returned by page 1
    await waitFor(() =>
      expect(listReferralInvitees).toHaveBeenCalledWith(ORG_TENANT_ID, {
        cursor: 'c1',
        page_size: 15,
      })
    )
    await waitFor(() => expect(within(table).getByText('invitee-22')).toBeInTheDocument())
    // last page: 8 body rows + 1 header
    expect(within(table).getAllByRole('row')).toHaveLength(9)
    // next disabled on the last page (has_more=false); prev walks back
    expect(screen.getByRole('button', { name: 'common.pagination.next' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'common.pagination.prev' }))
    await waitFor(() => expect(within(table).getByText('invitee-0')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'common.pagination.prev' })).toBeDisabled()
  })

  it('omits the pager when the only page has no more results', async () => {
    listReferralInvitees.mockResolvedValue({
      items: INVITEES.slice(0, 8),
      page_size: 15,
      has_more: false,
      next_cursor: null,
    })
    const table = await openInviteesTab()
    await waitFor(() => expect(within(table).getByText('invitee-0')).toBeInTheDocument())
    // 8 body + header; single page with no more → no pager controls
    expect(within(table).getAllByRole('row')).toHaveLength(9)
    expect(
      screen.queryByRole('button', { name: 'common.pagination.next' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'common.pagination.prev' })
    ).not.toBeInTheDocument()
  })
})

// ── commission log pagination (#199) — server-side cursor flow ───────────────

describe('ReferralPage — commission log cursor pagination (#199)', () => {
  // 23 records served by the backend over 2 cursor pages at page_size=15 (15 / 8).
  const RECORDS: ReferralCommissionRecord[] = Array.from({ length: 23 }, (_, i) => ({
    date: `2026-06-${String(i + 1).padStart(2, '0')}`,
    source: `src-${i}`,
    spend: '100',
    rate: 10,
    amount: '10',
    tierName: '普通伙伴',
  }))

  // Cursor-aware fake: first page (no cursor) → 0..14 has_more; cursor 'c1' → 15..22 last.
  function pageRecords(cursor: string | undefined): CursorPage<ReferralCommissionRecord> {
    if (!cursor) {
      return { items: RECORDS.slice(0, 15), page_size: 15, has_more: true, next_cursor: 'c1' }
    }
    return { items: RECORDS.slice(15), page_size: 15, has_more: false, next_cursor: null }
  }
  const cursorMock = (
    _tenantId: string,
    params?: { cursor?: string; page_size?: number }
  ) => Promise.resolve(pageRecords(params?.cursor))

  // Switch from the default invitees tab to the commission-log tab and return
  // the commissions table element (scoped by the unique 档位/Tier header).
  async function openCommissionsTab() {
    renderPage()
    await screen.findByText('推荐计划')
    // Radix Tabs.Trigger activates on mouseDown/focus, not click.
    fireEvent.mouseDown(screen.getByRole('tab', { name: '返佣流水' }))
    const tierHeader = await screen.findByText('档位')
    return tierHeader.closest('table') as HTMLElement
  }

  it('renders only the first backend page with a working cursor pager', async () => {
    listRewardRecords.mockImplementation(cursorMock)
    const table = await openCommissionsTab()

    // page 1: first cursor request carries no cursor + page_size=15
    await waitFor(() => expect(within(table).getByText('src-0')).toBeInTheDocument())
    expect(listRewardRecords).toHaveBeenCalledWith(ORG_TENANT_ID, { cursor: undefined, page_size: 15 })
    // 15 body rows + 1 header; pager shows the cursor page badge
    expect(within(table).getAllByRole('row')).toHaveLength(16)
    expect(screen.getByText('common.pagination.page')).toBeInTheDocument()
    expect(within(table).queryByText('src-15')).not.toBeInTheDocument()
    // next enabled (has_more), prev disabled on page 1
    expect(screen.getByRole('button', { name: 'common.pagination.next' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'common.pagination.prev' })).toBeDisabled()
  })

  it('pages forward via next_cursor to the last page and back', async () => {
    listRewardRecords.mockImplementation(cursorMock)
    const table = await openCommissionsTab()
    await waitFor(() => expect(within(table).getByText('src-0')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'common.pagination.next' }))
    // page 2 requests the next_cursor returned by page 1
    await waitFor(() =>
      expect(listRewardRecords).toHaveBeenCalledWith(ORG_TENANT_ID, { cursor: 'c1', page_size: 15 })
    )
    await waitFor(() => expect(within(table).getByText('src-22')).toBeInTheDocument())
    // last page: 8 body rows + 1 header
    expect(within(table).getAllByRole('row')).toHaveLength(9)
    // next disabled on the last page (has_more=false); prev walks back
    expect(screen.getByRole('button', { name: 'common.pagination.next' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'common.pagination.prev' }))
    await waitFor(() => expect(within(table).getByText('src-0')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'common.pagination.prev' })).toBeDisabled()
  })

  it('omits the pager when the only page has no more results', async () => {
    listRewardRecords.mockResolvedValue({
      items: RECORDS.slice(0, 8),
      page_size: 15,
      has_more: false,
      next_cursor: null,
    })
    const table = await openCommissionsTab()
    await waitFor(() => expect(within(table).getByText('src-0')).toBeInTheDocument())
    // 8 body + header; single page with no more → no pager controls
    expect(within(table).getAllByRole('row')).toHaveLength(9)
    expect(
      screen.queryByRole('button', { name: 'common.pagination.next' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'common.pagination.prev' })
    ).not.toBeInTheDocument()
  })
})
