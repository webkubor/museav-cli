import { create } from 'zustand'
import type { AccountBrief, TenantBrief } from '@/types'
import { storageKeys } from '@/lib/storage'

interface AuthState {
  account: AccountBrief | null
  activeTenantId: string | null
  activeWorkspaceId: string | null
  tenants: TenantBrief[]
  /** 会话下发的 granted 权限集；null = 后端未下发（触发本地矩阵回退），[] = 明确零权限 */
  permissions: string[] | null
  isAuthenticated: boolean
  isLoading: boolean
}

interface AuthActions {
  setAuth: (
    account: AccountBrief,
    activeTenantId: string,
    tenants: TenantBrief[],
    activeWorkspaceId?: string,
    permissions?: string[] | null
  ) => void
  addTenant: (tenant: TenantBrief) => void
  setActiveWorkspaceId: (workspaceId: string) => void
  clearAuth: () => void
  setLoading: (loading: boolean) => void
  /** 会话刷新（如切换组织后重拉 /auth/session）时单独更新 granted 权限集 */
  setPermissions: (permissions: string[] | null) => void
  hasPermission: (permission: string) => boolean
}

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  account: null,
  activeTenantId: null,
  activeWorkspaceId: null,
  tenants: [],
  permissions: null,
  isAuthenticated: false,
  isLoading: true,

  setAuth: (account, activeTenantId, tenants, activeWorkspaceId, permissions = null) => {
    if (activeTenantId) {
      localStorage.setItem(storageKeys.activeTenantId(), activeTenantId)
    } else {
      localStorage.removeItem(storageKeys.activeTenantId())
    }
    if (activeWorkspaceId) {
      localStorage.setItem(storageKeys.activeWorkspaceId(), activeWorkspaceId)
    }
    set({
      account,
      activeTenantId: activeTenantId || null,
      activeWorkspaceId: activeWorkspaceId || null,
      tenants,
      permissions,
      isAuthenticated: true,
      isLoading: false,
    })
  },

  addTenant: (tenant) => set((s) => ({ tenants: [...s.tenants, tenant] })),
  setPermissions: (permissions) => set({ permissions }),
  setActiveWorkspaceId: (workspaceId) => {
    if (workspaceId) {
      localStorage.setItem(storageKeys.activeWorkspaceId(), workspaceId)
    } else {
      localStorage.removeItem(storageKeys.activeWorkspaceId())
    }
    set({ activeWorkspaceId: workspaceId })
  },

  clearAuth: () => {
    localStorage.removeItem(storageKeys.activeTenantId())
    localStorage.removeItem(storageKeys.activeWorkspaceId())
    localStorage.removeItem(storageKeys.csHistory())
    localStorage.removeItem(storageKeys.csConversationId())
    document.cookie = 'modelgo_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
    set({
      account: null,
      activeTenantId: null,
      activeWorkspaceId: null,
      tenants: [],
      permissions: [],
      isAuthenticated: false,
      isLoading: false,
    })
  },

  setLoading: (isLoading) => set({ isLoading }),

  hasPermission: (permission) => get().permissions?.includes(permission) ?? false,
}))
