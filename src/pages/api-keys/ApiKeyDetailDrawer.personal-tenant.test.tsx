/**
 * V1.0.7 小需求 #9（modelgo_prd#1095）：个人租户不展示「个人护栏」。
 * 锁 Key 详情抽屉「安全护栏」里的两处：
 *  1.「生效规则预览」少一格「个人护栏」卡片,网格列数跟着收缩;
 *  2.「预算闸门」滤掉 per_member 档(需求图在创建弹窗里明确圈掉了「个人预算」,
 *     抽屉是同一语义的另一处渲染)——这一档是后端数据驱动的,用例必须喂进真实
 *     budgets 才测得到,空 budgets 下整段不渲染、测不出任何东西。
 * 非个人租户两处都不受影响。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ApiKeyItem } from '@/types'

// 预算闸门要按用例喂不同数据,mock 提到 hoisted 里以便逐例覆盖返回值。
const { getEffectiveGuardrailsMock } = vi.hoisted(() => ({ getEffectiveGuardrailsMock: vi.fn() }))

vi.mock('@/services/api-keys', () => ({
  getApiKeyDetail: vi.fn().mockResolvedValue(undefined),
  getApiKeyAudit: vi.fn().mockResolvedValue({ items: [] }),
  getEffectiveGuardrails: getEffectiveGuardrailsMock,
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

const EMPTY_EFFECTIVE = { layers: [], effective: { budgets: [], ip_whitelist: [], model_blacklist: [] } }

/** 一档生效预算(字段名照 ApiKeyDetailDrawer 实际读的那几个)。 */
function budget(aggregationScope: string) {
  return {
    aggregation_scope: aggregationScope,
    spend_limit_amount: '100',
    currency: 'CNY',
    period_unit: 'month',
    period_length: 1,
    source_guardrail_id: 'g-1',
  }
}

function effectiveWithBudgets(scopes: string[]) {
  return { layers: [], effective: { budgets: scopes.map(budget), ip_whitelist: [], model_blacklist: [] } }
}

beforeEach(() => {
  getEffectiveGuardrailsMock.mockReset()
  getEffectiveGuardrailsMock.mockResolvedValue(EMPTY_EFFECTIVE)
})

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

describe('ApiKeyDetailDrawer · 个人租户隐藏预算闸门里的「个人预算」档', () => {
  afterEach(() => {
    useAuthStore.setState({ activeTenantId: null, tenants: [] })
  })

  it('个人租户：后端回了 per_member 档也不展示,其余档照常展示', async () => {
    getEffectiveGuardrailsMock.mockResolvedValue(effectiveWithBudgets(['guardrail_total', 'per_member', 'per_api_key']))
    useAuthStore.setState({ activeTenantId: 't-1', tenants: [{ tenant_id: 't-1', type: 'personal' }] as never })
    renderDrawer()

    await waitFor(() => expect(screen.getByText('预算闸门')).toBeInTheDocument())
    expect(screen.getByText('工作空间总预算')).toBeInTheDocument()
    expect(screen.getByText('Key 预算')).toBeInTheDocument()
    expect(screen.queryByText('个人预算')).toBeNull()
  })

  it('企业租户：同一份数据仍展示「个人预算」档', async () => {
    getEffectiveGuardrailsMock.mockResolvedValue(effectiveWithBudgets(['guardrail_total', 'per_member', 'per_api_key']))
    useAuthStore.setState({ activeTenantId: 't-1', tenants: [{ tenant_id: 't-1', type: 'enterprise' }] as never })
    renderDrawer()

    await waitFor(() => expect(screen.getByText('预算闸门')).toBeInTheDocument())
    expect(screen.getByText('个人预算')).toBeInTheDocument()
  })

  it('个人租户：只有 per_member 一档时整个「预算闸门」区块不渲染(不留空标题)', async () => {
    getEffectiveGuardrailsMock.mockResolvedValue(effectiveWithBudgets(['per_member']))
    useAuthStore.setState({ activeTenantId: 't-1', tenants: [{ tenant_id: 't-1', type: 'personal' }] as never })
    renderDrawer()

    await waitFor(() => expect(screen.getByText('生效规则预览')).toBeInTheDocument())
    expect(screen.queryByText('预算闸门')).toBeNull()
    expect(screen.queryByText('个人预算')).toBeNull()
  })
})
