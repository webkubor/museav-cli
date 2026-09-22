/**
 * V1.0.7 小需求 #9（modelgo_prd#1095）：个人租户不展示「个人护栏」/「个人预算」。
 * 只锁这一条分支：createGuardrail 弹窗的「生效规则预览」在个人租户下应少一行，
 * 网格列数应跟着行数收缩（不留空档）；非个人租户不受影响。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/services/api-keys', () => ({
  createApiKey: vi.fn(),
  getEffectiveGuardrailPreview: vi.fn().mockResolvedValue({
    effective: { model_blacklist: [], ip_whitelist: [], budgets: [] },
    layers: [],
  }),
}))
vi.mock('@/services/workspaces', () => ({
  listWorkspaceMembers: vi.fn().mockResolvedValue({ items: [] }),
  listWorkspaces: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/services/guardrails', () => ({
  listGuardrails: vi.fn().mockResolvedValue({ items: [] }),
}))
vi.mock('@/hooks/use-platform-config', () => ({
  useCurrency: () => ({ currency: 'USD', symbol: '$' }),
}))
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    permissions: [],
    hasPermission: () => true,
    menus: [],
    getMenuActions: () => ({}),
  }),
}))
// constants.tsx 顶部引 @lobehub 图标 → fluent-emoji 目录导入在 vitest/node 下无法解析
// （存量环境问题，derive.expired.test.ts 等同样命中）；本用例不关心接入客户端图标，整模块 mock 掉。
vi.mock('./constants', () => ({
  getExpirationPresets: (t: (k: string) => string) => [
    { key: 'all', label: t('apiKeys.expiration.all') },
    { key: 'custom', label: t('apiKeys.expiration.custom') },
  ],
  resolveExpiryISO: () => null,
}))
vi.mock('@/hooks/use-tenant-role', () => ({
  useTenantRole: () => ({
    role: 'tenant_owner',
    isLoading: false,
    isEnterprise: true,
    tenant: undefined,
    canManage: true,
    ownedWorkspaceIds: [],
  }),
}))

import i18n, { loadLocaleNamespaces } from '@/i18n'

// 
i18n.changeLanguage('zh')
await loadLocaleNamespaces(['apiKeys'])

const { CreateKeyModal } = await import('./CreateKeyModal')
const { useAuthStore } = await import('@/store/auth')

function renderModal() {
  const qc = new QueryClient()
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <CreateKeyModal open workspaceId="ws-1" onClose={vi.fn()} onCreated={vi.fn()} />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('CreateKeyModal · 个人租户隐藏个人护栏/个人预算', () => {
  beforeEach(() => {
    useAuthStore.setState({
      activeTenantId: 't-1',
      account: { account_id: 'acc-1' } as never,
    })
  })
  afterEach(() => {
    useAuthStore.setState({ tenants: [] })
  })

  it('个人租户：生效规则预览不出现「个人护栏」，网格只有 2 列', async () => {
    useAuthStore.setState({ tenants: [{ tenant_id: 't-1', type: 'personal' }] as never })
    renderModal()
    fireEvent.click(await screen.findByText('高级设置'))

    await waitFor(() => expect(screen.getByText('生效规则预览')).toBeInTheDocument())
    const tile = screen.getByText('生效规则预览').closest('.mg-tile') as HTMLElement
    expect(within(tile).queryByText('个人护栏')).toBeNull()
    expect(within(tile).queryByText('个人预算')).toBeNull()
    expect(within(tile).getByText('全局护栏')).toBeInTheDocument()
    expect(within(tile).getByText('Key 护栏')).toBeInTheDocument()

    const grid = within(tile).getByText('全局护栏').closest('[class*="grid-cols"]')
    expect(grid?.className).toContain('grid-cols-2')
    expect(grid?.className).not.toContain('grid-cols-3')
  })

  it('企业租户：仍展示「个人护栏」/「个人预算」，网格 3 列', async () => {
    useAuthStore.setState({ tenants: [{ tenant_id: 't-1', type: 'enterprise' }] as never })
    renderModal()
    fireEvent.click(await screen.findByText('高级设置'))

    await waitFor(() => expect(screen.getByText('生效规则预览')).toBeInTheDocument())
    const tile = screen.getByText('生效规则预览').closest('.mg-tile') as HTMLElement
    expect(within(tile).getByText('个人护栏')).toBeInTheDocument()
    expect(within(tile).getByText('个人预算')).toBeInTheDocument()

    const grid = within(tile).getByText('全局护栏').closest('[class*="grid-cols"]')
    expect(grid?.className).toContain('grid-cols-3')
  })
})
