import { create } from 'zustand'
import type { AccountBrief, TenantBrief } from '@/types'

interface AuthState {
  account: AccountBrief | null
  activeTenantId: string | null
  activeWorkspaceId: string | null
  tenants: TenantBrief[]
  isAuthenticated: boolean
  isLoading: boolean
}

interface AuthActions {
  setAuth: (
    account: AccountBrief,
    activeTenantId: string,
    tenants: TenantBrief[],
    activeWorkspaceId?: string
  ) => void
  addTenant: (tenant: TenantBrief) => void
  setActiveWorkspaceId: (workspaceId: string) => void
  clearAuth: () => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState & AuthActions>((set) => ({
  account: null,
  activeTenantId: null,
  activeWorkspaceId: null,
  tenants: [],
  isAuthenticated: false,
  isLoading: true,

  setAuth: (account, activeTenantId, tenants, activeWorkspaceId) => {
    if (activeTenantId) {
      localStorage.setItem('modelgo_active_tenant_id', activeTenantId)
    }
    set({
      account,
      activeTenantId,
      activeWorkspaceId: activeWorkspaceId ?? null,
      tenants,
      isAuthenticated: true,
      isLoading: false,
    })
  },

  addTenant: (tenant) => set((s) => ({ tenants: [...s.tenants, tenant] })),
  setActiveWorkspaceId: (workspaceId) => set({ activeWorkspaceId: workspaceId }),

  clearAuth: () => {
    localStorage.removeItem('modelgo_active_tenant_id')
    set({
      account: null,
      activeTenantId: null,
      activeWorkspaceId: null,
      tenants: [],
      isAuthenticated: false,
      isLoading: false,
    })
  },

  setLoading: (isLoading) => set({ isLoading }),
}))
