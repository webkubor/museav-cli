import { create } from 'zustand'
import type { AccountBrief, TenantBrief } from '@/types'
import { storageKeys } from '@/lib/storage'

interface AuthState {
  account: AccountBrief | null
  activeTenantId: string | null
  activeWorkspaceId: string | null
  tenants: TenantBrief[]
  permissions: string[]
  isAuthenticated: boolean
  isLoading: boolean
  loggedOut: boolean
}

interface AuthActions {
  setAuth: (
    account: AccountBrief,
    activeTenantId: string,
    tenants: TenantBrief[],
    activeWorkspaceId?: string,
    permissions?: string[]
  ) => void
  addTenant: (tenant: TenantBrief) => void
  setActiveWorkspaceId: (workspaceId: string) => void
  clearAuth: () => void
  setLoading: (loading: boolean) => void
  hasPermission: (permission: string) => boolean
}

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  account: null,
  activeTenantId: null,
  activeWorkspaceId: null,
  tenants: [],
  permissions: [],
  isAuthenticated: false,
  isLoading: true,
  loggedOut: false,

  setAuth: (account, activeTenantId, tenants, activeWorkspaceId, permissions = []) => {
    if (activeTenantId) {
      localStorage.setItem(storageKeys.activeTenantId(), activeTenantId)
    } else {
      localStorage.removeItem(storageKeys.activeTenantId())
    }
    set({
      account,
      activeTenantId: activeTenantId || null,
      activeWorkspaceId: activeWorkspaceId || null,
      tenants,
      permissions,
      isAuthenticated: true,
      isLoading: false,
      loggedOut: false,
    })
    sessionStorage.removeItem('mg:logged_out')
  },

  addTenant: (tenant) => set((s) => ({ tenants: [...s.tenants, tenant] })),
  setActiveWorkspaceId: (workspaceId) => set({ activeWorkspaceId: workspaceId }),

  clearAuth: () => {
    localStorage.removeItem(storageKeys.activeTenantId())
    localStorage.removeItem(storageKeys.csHistory())
    localStorage.removeItem(storageKeys.csConversationId())
    // 清除非 httpOnly 的 CSRF cookie
    document.cookie = 'modelgo_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
    // 标记已退出，防止刷新后 SessionLoader 凭残留 cookie 自动恢复
    sessionStorage.setItem('mg:logged_out', '1')
    set({
      account: null,
      activeTenantId: null,
      activeWorkspaceId: null,
      tenants: [],
      permissions: [],
      isAuthenticated: false,
      isLoading: false,
      loggedOut: true,
    })
  },

  setLoading: (isLoading) => set({ isLoading }),

  hasPermission: (permission) => get().permissions.includes(permission),
}))
