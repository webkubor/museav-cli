import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '@/store/auth'
import type { AccountBrief, TenantBrief } from '@/types'

const account: AccountBrief = {
  account_id: 'acc_1',
  display_name: 'Alice',
  email: 'alice@modelgo.com',
  avatar_url: null,
}

const tenant: TenantBrief = {
  tenant_id: 'ten_1',
  name: 'Acme',
  slug: 'acme',
  type: 'enterprise',
  is_default: true,
}

// Reset to the store's documented initial shape between cases so localStorage
// side effects from one test can't leak into the next. Initial permissions is
// null (the "backend has not issued a granted set" sentinel), NOT [].
function resetStore() {
  useAuthStore.setState({
    account: null,
    activeTenantId: null,
    activeWorkspaceId: null,
    tenants: [],
    permissions: null,
    isAuthenticated: false,
    isLoading: true,
  })
}

describe('useAuthStore', () => {
  beforeEach(() => {
    localStorage.clear()
    resetStore()
  })

  it('setAuth defaults permissions to null (fallback sentinel) when omitted', () => {
    useAuthStore.getState().setAuth(account, 'ten_1', [tenant], 'ws_1')

    const s = useAuthStore.getState()
    // null, NOT [] — absent granted object must trigger the local-matrix
    // fallback in usePermissions, never be mistaken for an authoritative empty set.
    expect(s.permissions).toBeNull()
    expect(s.isAuthenticated).toBe(true)
    expect(s.isLoading).toBe(false)
    expect(s.activeTenantId).toBe('ten_1')
    expect(s.activeWorkspaceId).toBe('ws_1')
  })

  it('hasPermission returns false against the null sentinel (no throw on optional chain)', () => {
    // Default state has permissions: null; hasPermission must short-circuit to
    // false rather than crashing on `null.includes`.
    expect(useAuthStore.getState().permissions).toBeNull()
    expect(useAuthStore.getState().hasPermission('dashboard:view')).toBe(false)
  })

  it('setAuth threads explicit granted permissions through to the store', () => {
    useAuthStore.getState().setAuth(account, 'ten_1', [tenant], 'ws_1', ['dashboard:view'])
    expect(useAuthStore.getState().permissions).toEqual(['dashboard:view'])
  })

  it('setAuth accepts an explicit empty granted set (authoritative zero permissions)', () => {
    useAuthStore.getState().setAuth(account, 'ten_1', [tenant], 'ws_1', [])

    const s = useAuthStore.getState()
    // [] is distinct from null: it is the authoritative "ops cleared the role"
    // signal, not the fallback trigger.
    expect(s.permissions).toEqual([])
    expect(s.permissions).not.toBeNull()
    expect(s.hasPermission('dashboard:view')).toBe(false)
  })

  it('setPermissions replaces the granted set and hasPermission reflects it', () => {
    useAuthStore.getState().setPermissions(['logs:view', 'api_keys:view'])

    const s = useAuthStore.getState()
    expect(s.permissions).toEqual(['logs:view', 'api_keys:view'])
    expect(s.hasPermission('logs:view')).toBe(true)
    expect(s.hasPermission('api_keys:view')).toBe(true)
    expect(s.hasPermission('org.settings:edit')).toBe(false)
  })

  it('setPermissions(null) and setPermissions([]) are distinct states', () => {
    // null = fallback trigger; [] = authoritative zero. Both yield
    // hasPermission === false, but the stored value must differ so
    // usePermissions can branch on it.
    useAuthStore.getState().setPermissions(null)
    expect(useAuthStore.getState().permissions).toBeNull()
    expect(useAuthStore.getState().hasPermission('dashboard:view')).toBe(false)

    useAuthStore.getState().setPermissions([])
    expect(useAuthStore.getState().permissions).toEqual([])
    expect(useAuthStore.getState().permissions).not.toBeNull()
    expect(useAuthStore.getState().hasPermission('dashboard:view')).toBe(false)
  })

  it('clearAuth resets to the unauthenticated baseline', () => {
    useAuthStore.getState().setAuth(account, 'ten_1', [tenant], 'ws_1', ['dashboard:view'])
    useAuthStore.getState().clearAuth()

    const s = useAuthStore.getState()
    expect(s.account).toBeNull()
    expect(s.activeTenantId).toBeNull()
    expect(s.activeWorkspaceId).toBeNull()
    expect(s.tenants).toEqual([])
    // 未登录基线与 store 初始值一致为 null（“未知”），区别于 [] 的“已知为空”
    expect(s.permissions).toBeNull()
    expect(s.isAuthenticated).toBe(false)
    expect(s.isLoading).toBe(false)
    expect(s.hasPermission('dashboard:view')).toBe(false)
  })
})
