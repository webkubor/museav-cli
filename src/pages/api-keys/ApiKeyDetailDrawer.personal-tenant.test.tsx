/**
 * V1.0.7 小需求 #9（modelgo_prd#1095）：个人租户不展示「个人护栏」。
 * 只锁 Key 详情抽屉「安全护栏 → 生效规则预览」这一条分支：个人租户下少一格
 * 「个人护栏」卡片，网格列数跟着收缩；非个人租户不受影响。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ApiKeyItem } from '@/types'

vi.mock('@/services/api-keys', () => ({
  getApiKeyDetail: vi.fn().mockResolvedValue(undefined),
  getApiKeyAudit: vi.fn().mockResolvedValue({ items: [] }),
  getEffectiveGuardrails: vi.fn().mockResolvedValue({
    layers: [],
    effective: { budgets: [], ip_whitelist: [], model_blacklist: [] },
  }),
  revealApiKey: vi.fn(),
}))
vi.mock('@/services/guardrails', () => ({
  listGuardrails: vi.fn().mockResolvedValue({ items: [] }),
}))
// ./derive 引 ./constants，间接带出 @lobehub 图标（fluent-emoji 目录导入在 vitest/node 下解析失败，
// 存量环境问题，与 ApiKeyTable.test.tsx 同样命中），本用例不关心格式化细节，整模块 mock 掉。
vi.mock('./derive', () => ({
  deriveKeyType: (item: { key_type?: string; scope?: string }) => item.key_type ?? item.scope ?? 'personal',
  keyTypeLabel: (t: (k: string) => string, type: string) => t(`apiKeys.keyType.${type}`),
  responsibleOf: (item: { responsible_member?: unknown; owner?: unknown }) => item.responsible_member ?? item.owner,
  periodSpendOf: (item: { period_spend?: unknown; total_spend?: unknown }) => item.period_spend ?? item.total_spend,
  isExpiredKey: () => false,
  cap: (itemFlag: boolean | undefined, fallback: boolean) => itemFlag ?? fallback,
}))

import i18n, { loadLocaleNamespaces } from '@/i18n'

i18n.changeLanguage('zh')
await loadLocaleNamespaces(['apiKeys'])

const { ApiKeyDetailDrawer } = await import('./ApiKeyDetailDrawer')
const { useAuthStore } = await import('@/store/auth')

function item(): ApiKeyItem {
  return {
    api_key_id: 'k1',
    name: '测试 Key',
    status: 'active',
    expires_at: null,
    scope: 'personal',
    owner: { account_id: 'acc-1', display_name: '负责人' },
  } as unknown as ApiKeyItem
}

function renderDrawer() {
  const qc = new QueryClient()
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ApiKeyDetailDrawer
          open
          onClose={vi.fn()}
          workspaceId="ws-1"
          item={item()}
          canAction={() => true}
          canReveal
          onToggleStatus={vi.fn()}
          onRotate={vi.fn()}
          onCompleteRotation={vi.fn()}
          onRevoke={vi.fn()}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('ApiKeyDetailDrawer · 个人租户隐藏个人护栏', () => {
  afterEach(() => {
    useAuthStore.setState({ tenants: [] })
  })

  it('个人租户：生效规则预览不出现「个人护栏」，网格只有 2 列', async () => {
    useAuthStore.setState({ activeTenantId: 't-1', tenants: [{ tenant_id: 't-1', type: 'personal' }] as never })
    renderDrawer()

    await waitFor(() => expect(screen.getByText('生效规则预览')).toBeInTheDocument())
    const tile = screen.getByText('生效规则预览').closest('div')?.parentElement as HTMLElement
    expect(within(tile).queryByText('个人护栏')).toBeNull()
    expect(within(tile).getByText('全局护栏')).toBeInTheDocument()
    expect(within(tile).getByText('Key 护栏')).toBeInTheDocument()

    const grid = within(tile).getByText('全局护栏').closest('[class*="grid-cols"]')
    expect(grid?.className).toContain('grid-cols-2')
    expect(grid?.className).not.toContain('grid-cols-3')
  })

  it('企业租户：仍展示「个人护栏」，网格 3 列', async () => {
    useAuthStore.setState({ activeTenantId: 't-1', tenants: [{ tenant_id: 't-1', type: 'enterprise' }] as never })
    renderDrawer()

    await waitFor(() => expect(screen.getByText('生效规则预览')).toBeInTheDocument())
    const tile = screen.getByText('生效规则预览').closest('div')?.parentElement as HTMLElement
    expect(within(tile).getByText('个人护栏')).toBeInTheDocument()

    const grid = within(tile).getByText('全局护栏').closest('[class*="grid-cols"]')
    expect(grid?.className).toContain('grid-cols-3')
  })
})
