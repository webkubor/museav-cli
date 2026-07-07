/**
 * 租户/工作区角色 Hook 测试
 * 路由：全局布局、总览、用量、日志等依赖角色判断的页面
 * API：GET /tenants、GET /workspaces
 */
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { TenantBrief, TenantItem, WorkspaceItem } from '@/types'

const listTenants = vi.fn()
const listWorkspaces = vi.fn()

vi.mock('@/services/tenants', () => ({
  listTenants: () => listTenants(),
}))

vi.mock('@/services/workspaces', () => ({
  listWorkspaces: () => listWorkspaces(),
}))

import { useAuthStore } from '@/store/auth'
import { useTenantRole } from './use-tenant-role'
import { useWorkspaceRole } from './use-workspace-role'

const ACTIVE_TENANT_ID = 'ten_1'
const ACTIVE_WORKSPACE_ID = 'ws_1'

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

function tenant(role: TenantItem['role']): TenantItem {
  return {
    tenant_id: ACTIVE_TENANT_ID,
    name: 'ModelGo',
    slug: 'modelgo',
    type: 'enterprise',
    role,
    is_default: true,
    max_workspaces: 5,
    current_workspace_count: 1,
    balance: null,
  }
}

function workspace(myRole: WorkspaceItem['my_role']): WorkspaceItem {
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
    spend_7d: { amount: '0', currency: 'CNY' },
    created_at: '2026-07-06T00:00:00Z',
    my_role: myRole,
  }
}

function storeTenant(): TenantBrief {
  return {
    tenant_id: ACTIVE_TENANT_ID,
    name: 'ModelGo',
    slug: 'modelgo',
    type: 'enterprise',
    is_default: true,
  }
}

beforeEach(() => {
  listTenants.mockReset()
  listWorkspaces.mockReset()
  listWorkspaces.mockResolvedValue({ items: [] })
  useAuthStore.setState({
    account: { account_id: 'acc_1', display_name: 'Alice', email: 'alice@modelgo.com', avatar_url: null },
    activeTenantId: ACTIVE_TENANT_ID,
    activeWorkspaceId: ACTIVE_WORKSPACE_ID,
    tenants: [storeTenant()],
    permissions: [],
    menus: [],
    isAuthenticated: true,
    isLoading: false,
  })
})

describe('useTenantRole', () => {
  it('fails closed while tenant role is unknown', async () => {
    listTenants.mockResolvedValue({ items: [] })

    const { result } = renderHook(() => useTenantRole(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.role).toBeUndefined()
    expect(result.current.canManage).toBe(false)
  })

  it('allows tenant owner/admin to manage the tenant', async () => {
    listTenants.mockResolvedValue({ items: [tenant('tenant_admin')] })

    const { result } = renderHook(() => useTenantRole(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.role).toBe('tenant_admin'))
    expect(result.current.canManage).toBe(true)
    expect(result.current.isSpaceOwner).toBe(false)
  })

  it('marks a tenant_member as space owner when they own a workspace (#391)', async () => {
    listTenants.mockResolvedValue({ items: [tenant('tenant_member')] })
    listWorkspaces.mockResolvedValue({ items: [workspace('ws_owner')] })

    const { result } = renderHook(() => useTenantRole(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSpaceOwner).toBe(true))
    expect(result.current.ownedWorkspaceIds).toEqual([ACTIVE_WORKSPACE_ID])
    expect(result.current.canManage).toBe(false)
  })

  it('does not mark a plain tenant_member without owned workspaces as space owner', async () => {
    listTenants.mockResolvedValue({ items: [tenant('tenant_member')] })
    listWorkspaces.mockResolvedValue({ items: [workspace('ws_member')] })

    const { result } = renderHook(() => useTenantRole(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.role).toBe('tenant_member'))
    expect(result.current.isSpaceOwner).toBe(false)
    expect(result.current.ownedWorkspaceIds).toEqual([])
  })
})

describe('useWorkspaceRole', () => {
  it('fails closed while workspace role is unknown', async () => {
    listWorkspaces.mockResolvedValue({ items: [] })

    const { result } = renderHook(() => useWorkspaceRole(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.role).toBeUndefined()
    expect(result.current.canManage).toBe(false)
  })

  it('allows workspace owner/admin to manage the workspace', async () => {
    listWorkspaces.mockResolvedValue({ items: [workspace('ws_owner')] })

    const { result } = renderHook(() => useWorkspaceRole(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.role).toBe('ws_owner'))
    expect(result.current.canManage).toBe(true)
  })
})
