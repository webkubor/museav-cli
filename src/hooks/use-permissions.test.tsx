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

// renderHook returns synchronously, but the react-query fetch that drives the
// fallback role resolution resolves on a microtask. waitFor polls the hook
// result until the fallback roles have landed.
async function waitForResult<T>(
  read: () => T,
  predicate: (value: T) => boolean,
  rerender: () => void
): Promise<T> {
  const deadline = Date.now() + 2000
  while (Date.now() <= deadline) {
    rerender()
    const value = read()
    if (predicate(value)) return value
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('timed out waiting for permissions to settle')
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
    expect(result.current.hasPermission('api_keys:revoke')).toBe(false)
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

describe('usePermissions — FALLBACK via real roles (granted === null)', () => {
  it('member role (enterprise, tenant_member + ws_member) grants the member-level set', async () => {
    listTenants.mockResolvedValue({ items: [tenantItem('tenant_member')] })
    listWorkspaces.mockResolvedValue({ items: [workspaceItem('ws_member')] })
    // permissions: null = backend issued no granted object → matrix fallback.
    seedAuth({ permissions: null, tenantType: 'enterprise' })

    const { Wrapper } = makeWrapper()
    const { result, rerender } = renderHook(() => usePermissions(), { wrapper: Wrapper })

    const value = await waitForResult(
      () => result.current,
      (v) => v.hasPermission('api_keys:view'),
      rerender
    )

    // member-level grants
    expect(value.hasPermission('dashboard:view')).toBe(true) // BASE
    expect(value.hasPermission('org.settings:edit')).toBe(false) // tenant_member has no org manage
    expect(value.hasPermission('api_keys:view')).toBe(true) // ws_member
    expect(value.hasPermission('api_keys:create')).toBe(true) // ws_member
    // owner-only — proves the hardcoded-owner default is dead
    expect(value.hasPermission('org.settings:edit')).toBe(false)
    expect(value.hasPermission('api_keys:revoke')).toBe(false) // ws_owner/admin only
    expect(value.hasPermission('billing:view')).toBe(false) // tenant owner/admin only
  })

  it('owner role (enterprise, tenant_owner + ws_owner) grants the owner-level set', async () => {
    listTenants.mockResolvedValue({ items: [tenantItem('tenant_owner')] })
    listWorkspaces.mockResolvedValue({ items: [workspaceItem('ws_owner')] })
    seedAuth({ permissions: null, tenantType: 'enterprise' })

    const { Wrapper } = makeWrapper()
    const { result, rerender } = renderHook(() => usePermissions(), { wrapper: Wrapper })

    const value = await waitForResult(
      () => result.current,
      (v) => v.hasPermission('org.settings:edit'),
      rerender
    )

    expect(value.hasPermission('org.settings:edit')).toBe(true) // ORG_MANAGE
    expect(value.hasPermission('org.members:manage')).toBe(true)
    expect(value.hasPermission('billing:view')).toBe(true) // BILLING_GLOBAL
    expect(value.hasPermission('api_keys:revoke')).toBe(true) // ws_owner
  })
})

describe('usePermissions — role-change reactivity (WEB-03 acceptance)', () => {
  it('switching the resolved tenant/workspace role from member to owner flips menu visibility', async () => {
    // First mount: member roles → no org.settings:edit.
    listTenants.mockResolvedValue({ items: [tenantItem('tenant_member')] })
    listWorkspaces.mockResolvedValue({ items: [workspaceItem('ws_member')] })
    seedAuth({ permissions: null, tenantType: 'enterprise' })

    const first = makeWrapper()
    const memberRender = renderHook(() => usePermissions(), { wrapper: first.Wrapper })

    const memberValue = await waitForResult(
      () => memberRender.result.current,
      (v) => v.hasPermission('api_keys:view'),
      memberRender.rerender
    )
    expect(memberValue.hasPermission('org.settings:edit')).toBe(false)
    expect(memberValue.hasPermission('api_keys:revoke')).toBe(false)
    memberRender.unmount()

    // Role changes upstream: re-point the mocks and remount with a fresh
    // QueryClient (clean cache) — simulates the post role-change session.
    listTenants.mockResolvedValue({ items: [tenantItem('tenant_owner')] })
    listWorkspaces.mockResolvedValue({ items: [workspaceItem('ws_owner')] })

    const second = makeWrapper()
    const ownerRender = renderHook(() => usePermissions(), { wrapper: second.Wrapper })

    const ownerValue = await waitForResult(
      () => ownerRender.result.current,
      (v) => v.hasPermission('org.settings:edit'),
      ownerRender.rerender
    )
    expect(ownerValue.hasPermission('org.settings:edit')).toBe(true)
    expect(ownerValue.hasPermission('api_keys:revoke')).toBe(true)
    ownerRender.unmount()
  })
})
