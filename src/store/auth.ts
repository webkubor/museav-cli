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
    })
  },

  addTenant: (tenant) => set((s) => ({ tenants: [...s.tenants, tenant] })),
  setActiveWorkspaceId: (workspaceId) => set({ activeWorkspaceId: workspaceId }),

  clearAuth: () => {
    localStorage.removeItem(storageKeys.activeTenantId())
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

  hasPermission: (permission) => get().permissions.includes(permission),
}))
