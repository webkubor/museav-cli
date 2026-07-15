import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { TenantBrief, TenantItem, WorkspaceItem } from '@/types'

// ── Mock the two REST services that feed the FALLBACK role resolution. ──────
// use-tenant-role calls listTenants(); use-workspace-role calls listWorkspaces().
// Each must return the { items } envelope the hooks unwrap via `.items ?? []`.
const listTenants = vi.fn()
const listWorkspaces = vi.fn()

vi.mock('@/services/tenants', () => ({
  listTenants: () => listTenants(),
}))
vi.mock('@/services/workspaces', () => ({
  listWorkspaces: () => listWorkspaces(),
}))

import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/use-permissions'

const ACTIVE_TENANT_ID = 'ten_1'
const ACTIVE_WORKSPACE_ID = 'ws_1'

// Store-level tenant carries `type` — use-permissions reads activeTenant.type
// from the auth store (not from listTenants) to pick the matrix branch.
function storeTenant(type: TenantBrief['type']): TenantBrief {
  return {
    tenant_id: ACTIVE_TENANT_ID,
    name: 'Acme',
    slug: 'acme',
    type,
    is_default: true,
  }
}

// listTenants item carries the authoritative-fallback `role`.
function tenantItem(role: TenantItem['role'], type: TenantItem['type'] = 'enterprise'): TenantItem {
  return {
    tenant_id: ACTIVE_TENANT_ID,
    name: 'Acme',
    slug: 'acme',
    type,
    role,
    is_default: true,
    max_workspaces: 5,
    current_workspace_count: 1,
    balance: null,
  }
}

// listWorkspaces item carries the fallback `my_role`.
function workspaceItem(myRole: WorkspaceItem['my_role']): WorkspaceItem {
  return {
    workspace_id: ACTIVE_WORKSPACE_ID,
    tenant_id: ACTIVE_TENANT_ID,
    name: 'Default',
    slug: 'default',
    kind: 'team',
    is_default: true,
    description: '',
    owner: { account_id: 'acc_1', display_name: 'Alice' },
    member_count: 1,
    api_key_count: 0,
    spend_7d: { amount: '0', currency: 'USD' },
    created_at: '2026-06-02T00:00:00Z',
    my_role: myRole,
  }
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { Wrapper, queryClient }
}

function seedAuth(opts: {
  permissions: string[] | null
  tenantType: TenantBrief['type']
}) {
  useAuthStore.setState({
    account: { account_id: 'acc_1', display_name: 'Alice', email: 'a@modelgo.com', avatar_url: null },
    activeTenantId: ACTIVE_TENANT_ID,
    activeWorkspaceId: ACTIVE_WORKSPACE_ID,
    tenants: [storeTenant(opts.tenantType)],
    permissions: opts.permissions,
    isAuthenticated: true,
    isLoading: false,
  })
}

beforeEach(() => {
  localStorage.clear()
  listTenants.mockReset()
  listWorkspaces.mockReset()
  useAuthStore.setState({
    account: null,
    activeTenantId: null,
    activeWorkspaceId: null,
    tenants: [],
    permissions: null,
    isAuthenticated: false,
    isLoading: true,
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('usePermissions — AUTHORITATIVE source (session.permissions.granted)', () => {
  it('returns the granted set verbatim and never consults the local matrix', () => {
    // owner-level roles in the fallback path, but granted is non-null → ignored.
    listTenants.mockResolvedValue({ items: [tenantItem('tenant_owner')] })
    listWorkspaces.mockResolvedValue({ items: [workspaceItem('ws_owner')] })
    seedAuth({ permissions: ['dashboard:view', 'api_keys:view'], tenantType: 'enterprise' })

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => usePermissions(), { wrapper: Wrapper })

    expect(result.current.permissions).toEqual(['dashboard:view', 'api_keys:view'])
    expect(result.current.hasPermission('dashboard:view')).toBe(true)
    expect(result.current.hasPermission('api_keys:view')).toBe(true)
    // org.settings:edit is owner-only in the matrix; proves matrix NOT consulted.
    expect(result.current.hasPermission('org.settings:edit')).toBe(false)
  })

  // WEB-03 ACCEPTANCE-CRITICAL: granted === [] is the authoritative
  // "ops cleared this role's bindings" signal. It must NOT fall back to the
  // local matrix even when the real tenant/workspace roles are OWNER. fail-open
  // is forbidden: an empty granted set means ZERO permissions, full stop.
  it('honors an authoritative empty granted set ([]) — zero permissions, no fallback even with OWNER roles', async () => {
    // Strongest possible fallback signal: enterprise + tenant_owner + ws_owner.
    // If the matrix were (incorrectly) consulted, dashboard:view (in BASE for
    // every role) would be granted. It must NOT be.
    listTenants.mockResolvedValue({ items: [tenantItem('tenant_owner')] })
    listWorkspaces.mockResolvedValue({ items: [workspaceItem('ws_owner')] })
    seedAuth({ permissions: [], tenantType: 'enterprise' })

    const { Wrapper } = makeWrapper()
    const { result, rerender } = renderHook(() => usePermissions(), { wrapper: Wrapper })

    // Let the (mocked) role queries resolve; a buggy fallback would populate
    // permissions on that microtask. Give it the chance, then assert it didn't.
    await new Promise((r) => setTimeout(r, 50))
    rerender()

    expect(result.current.permissions).toEqual([])
    // dashboard:view is in BASE — granted to every fallback role including
    // owner. Authoritative [] must still deny it. This is the fail-open guard.
    expect(result.current.hasPermission('dashboard:view')).toBe(false)
    // and everything owner would otherwise unlock stays denied too.
    expect(result.current.hasPermission('org.settings:edit')).toBe(false)
    expect(result.current.hasPermission('api_keys:view')).toBe(false)
    expect(result.current.hasPermission('api_keys.personal:revoke')).toBe(false)
    expect(result.current.hasPermission('billing:view')).toBe(false)
  })

  it('granted takes precedence even when fallback roles are owner', async () => {
    listTenants.mockResolvedValue({ items: [tenantItem('tenant_owner')] })
    listWorkspaces.mockResolvedValue({ items: [workspaceItem('ws_owner')] })
    seedAuth({ permissions: ['logs:view'], tenantType: 'enterprise' })

    const { Wrapper } = makeWrapper()
    const { result, rerender } = renderHook(() => usePermissions(), { wrapper: Wrapper })

    // Even after the role queries resolve, granted stays authoritative.
    await new Promise((r) => setTimeout(r, 50))
    rerender()

    expect(result.current.permissions).toEqual(['logs:view'])
    expect(result.current.hasPermission('logs:view')).toBe(true)
    expect(result.current.hasPermission('org.settings:edit')).toBe(false)
  })
})

describe('usePermissions — FAIL-CLOSED (granted === null, #344)', () => {
  // #344 / 设计 §3.4 G7：本地回退矩阵下线。granted 缺失(null) 时返回零权限，
  // 隐藏/禁用而非放行——即使真实角色是 owner 也不放行（fail-open 禁止）。
  it('granted === null yields zero permissions even with OWNER roles upstream', () => {
    // 最强的旧兜底信号：enterprise + tenant_owner + ws_owner。若还有回退矩阵，
    // 这些会被授予；fail-closed 下必须一律拒绝。
    listTenants.mockResolvedValue({ items: [tenantItem('tenant_owner')] })
    listWorkspaces.mockResolvedValue({ items: [workspaceItem('ws_owner')] })
    seedAuth({ permissions: null, tenantType: 'enterprise' })

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => usePermissions(), { wrapper: Wrapper })

    // 零权限：连 BASE 的 dashboard:view 也不放行（这是 fail-open 守卫）
    expect(result.current.permissions).toEqual([])
    expect(result.current.hasPermission('dashboard:view')).toBe(false)
    expect(result.current.hasPermission('org.settings:edit')).toBe(false)
    expect(result.current.hasPermission('api_keys:view')).toBe(false)
    expect(result.current.hasPermission('api_keys.personal:revoke')).toBe(false)
  })
})

describe('usePermissions — granted reactivity', () => {
  it('reflects granted changes verbatim (null → set), no role fallback involved', () => {
    seedAuth({ permissions: null, tenantType: 'enterprise' })
    const { Wrapper } = makeWrapper()
    const { result, rerender } = renderHook(() => usePermissions(), { wrapper: Wrapper })

    // fail-closed at null
    expect(result.current.permissions).toEqual([])

    // 后端下发 granted 后如实反映
    useAuthStore.setState({ permissions: ['logs:view', 'api_keys:view'] })
    rerender()
    expect(result.current.hasPermission('logs:view')).toBe(true)
    expect(result.current.hasPermission('api_keys:view')).toBe(true)
    expect(result.current.hasPermission('org.settings:edit')).toBe(false)
  })
})
