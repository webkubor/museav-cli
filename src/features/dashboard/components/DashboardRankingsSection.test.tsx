import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { RankingsResponse } from '@/services/overview'

// The section is a pure read view over getRankings(tenantId). Mock the service
// so we drive the four render branches (mapped models, hidden skills card,
// rendered skills card, both-empty) from data alone.
const getRankings = vi.fn<(tenantId: string, period?: '7d' | '30d') => Promise<RankingsResponse>>()
vi.mock('@/services/overview', () => ({
  getRankings: (tenantId: string, period?: '7d' | '30d') => getRankings(tenantId, period),
}))

import { useAuthStore } from '@/store/auth'
import { DashboardRankingsSection } from '@/features/dashboard/components/DashboardRankingsSection'

const ACTIVE_TENANT_ID = 'ten_rank'

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

function seedTenant(tenantId: string | null) {
  useAuthStore.setState({ activeTenantId: tenantId })
}

beforeEach(() => {
  getRankings.mockReset()
  seedTenant(ACTIVE_TENANT_ID)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('DashboardRankingsSection — models ranking', () => {
  it('maps each row: rank zero-padded to 2 digits, name/meta/score rendered, query keyed on activeTenantId', async () => {
    getRankings.mockResolvedValue({
      models: [
        { rank: '1', name: 'GPT-X', meta: '近30天 ¥12,000', score: '8,420' },
        { rank: '2', name: 'Claude-Y', meta: '近30天 ¥9,000', score: '6,310' },
        { rank: '10', name: 'Llama-Z', meta: '近30天 ¥1,000', score: '900' },
      ],
      skills: [],
    })

    render(<DashboardRankingsSection />, { wrapper: makeWrapper() })

    expect(await screen.findByText('GPT-X')).toBeInTheDocument()
    // padStart(2,'0'): '1' → '01', '10' → '10' (untouched)
    expect(screen.getByText('01')).toBeInTheDocument()
    expect(screen.getByText('02')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('Claude-Y')).toBeInTheDocument()
    expect(screen.getByText('近30天 ¥12,000')).toBeInTheDocument()
    expect(screen.getByText('8,420')).toBeInTheDocument()

    // the query is scoped to the active tenant
    expect(getRankings).toHaveBeenCalledTimes(1)
    expect(getRankings.mock.calls[0][0]).toBe(ACTIVE_TENANT_ID)
  })

  it('cycles tone across the four-color palette in order (emerald, cyan, violet, amber, emerald…)', async () => {
    getRankings.mockResolvedValue({
      models: [
        { rank: '1', name: 'M1', meta: 'a', score: '1' },
        { rank: '2', name: 'M2', meta: 'b', score: '2' },
        { rank: '3', name: 'M3', meta: 'c', score: '3' },
        { rank: '4', name: 'M4', meta: 'd', score: '4' },
        { rank: '5', name: 'M5', meta: 'e', score: '5' }, // wraps back to emerald
      ],
      skills: [],
    })

    const { container } = render(<DashboardRankingsSection />, { wrapper: makeWrapper() })
    await screen.findByText('M1')

    const rows = container.querySelectorAll('.dashboard-ranking-row')
    expect(rows).toHaveLength(5)
    const tones = Array.from(rows, (r) => r.getAttribute('data-tone'))
    expect(tones).toEqual(['emerald', 'cyan', 'violet', 'amber', 'emerald'])
  })
})

describe('DashboardRankingsSection — skills card visibility', () => {
  it('does NOT render the skills card when skills is empty (models present)', async () => {
    getRankings.mockResolvedValue({
      models: [{ rank: '1', name: 'GPT-X', meta: 'm', score: 's' }],
      skills: [],
    })

    render(<DashboardRankingsSection />, { wrapper: makeWrapper() })
    await screen.findByText('热门模型排行榜')

    expect(screen.queryByText('热门 Skills')).not.toBeInTheDocument()
    expect(screen.queryByText('开发者最常使用的工作流')).not.toBeInTheDocument()
  })

  it('renders the skills card when skills has rows', async () => {
    getRankings.mockResolvedValue({
      models: [{ rank: '1', name: 'GPT-X', meta: 'm', score: 's' }],
      skills: [{ rank: '1', name: 'translate-workflow', meta: 'used 99x', score: '99' }],
    })

    render(<DashboardRankingsSection />, { wrapper: makeWrapper() })

    expect(await screen.findByText('热门 Skills')).toBeInTheDocument()
    expect(screen.getByText('translate-workflow')).toBeInTheDocument()
  })
})

describe('DashboardRankingsSection — empty state', () => {
  it('shows the models empty row and hides the skills card when both are empty', async () => {
    getRankings.mockResolvedValue({ models: [], skills: [] })

    render(<DashboardRankingsSection />, { wrapper: makeWrapper() })

    expect(await screen.findByText('暂无数据')).toBeInTheDocument()
    expect(screen.getByText('近 30 天还没有模型调用记录')).toBeInTheDocument()
    // skills card stays hidden — the empty row only ever appears in the models card
    expect(screen.queryByText('热门 Skills')).not.toBeInTheDocument()
  })

  it('renders the empty state (not a crash) before data resolves / when tenant is absent', async () => {
    // No active tenant → query disabled → data stays undefined → models = []
    seedTenant(null)
    getRankings.mockResolvedValue({ models: [], skills: [] })

    render(<DashboardRankingsSection />, { wrapper: makeWrapper() })

    // section + models card render immediately with the empty row, query never fires
    expect(screen.getByText('热门模型排行榜')).toBeInTheDocument()
    expect(screen.getByText('暂无数据')).toBeInTheDocument()
    await waitFor(() => expect(getRankings).not.toHaveBeenCalled())
  })
})
