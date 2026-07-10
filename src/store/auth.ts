import { create } from 'zustand'
import type { AccountBrief, TenantBrief, SessionMenu } from '@/types'
import { storageKeys } from '@/lib/storage'
import type { Permission } from '@/config/permissions'

interface AuthState {
  account: AccountBrief | null
  activeTenantId: string | null
  activeWorkspaceId: string | null
  tenants: TenantBrief[]
  /** 会话下发的 granted 权限集；null = 尚未加载，[] = 后端明确返回零权限 */
  permissions: string[] | null
  /** 会话下发的菜单列表，含每个菜单的 actions 开关 */
  menus: SessionMenu[]
  isAuthenticated: boolean
  isLoading: boolean
}

interface AuthActions {
  setAuth: (
    account: AccountBrief,
    activeTenantId: string,
    tenants: TenantBrief[],
    activeWorkspaceId?: string,
    permissions?: string[] | null,
    menus?: SessionMenu[]
  ) => void
  addTenant: (tenant: TenantBrief) => void
  setActiveWorkspaceId: (workspaceId: string) => void
  clearAuth: () => void
  setLoading: (loading: boolean) => void
  /** 会话刷新（如切换组织后重拉 /auth/session）时单独更新 granted 权限集 */
  setPermissions: (permissions: string[] | null) => void
  /** 会话刷新时单独更新菜单列表 */
  setMenus: (menus: SessionMenu[]) => void
  hasPermission: (permission: Permission) => boolean
  /** 获取指定菜单的 actions 开关表；key 不存在时返回 {} */
  getMenuActions: (menuKey: string) => Record<string, boolean>
}

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  account: null,
  activeTenantId: null,
  activeWorkspaceId: null,
  tenants: [],
  permissions: null,
  menus: [],
  isAuthenticated: false,
  isLoading: true,

  setAuth: (account, activeTenantId, tenants, activeWorkspaceId, permissions = null, menus = []) => {
    if (activeTenantId) {
      localStorage.setItem(storageKeys.activeTenantId(), activeTenantId)
    } else {
      localStorage.removeItem(storageKeys.activeTenantId())
    }
    if (activeTenantId && activeWorkspaceId) {
      localStorage.setItem(storageKeys.activeWorkspaceId(activeTenantId), activeWorkspaceId)
    }
    set({
      account,
      activeTenantId: activeTenantId || null,
      activeWorkspaceId: activeWorkspaceId || null,
      tenants,
      permissions,
      menus,
      isAuthenticated: true,
      isLoading: false,
    })
  },

  addTenant: (tenant) => set((s) => ({ tenants: [...s.tenants, tenant] })),
  setPermissions: (permissions) => set({ permissions }),
  setMenus: (menus) => set({ menus }),
  setActiveWorkspaceId: (workspaceId) => {
    // 持久化到「当前活跃租户」的专属 key；无活跃租户则只改内存态不落库。
    const tenantId = get().activeTenantId
    if (tenantId) {
      if (workspaceId) {
        localStorage.setItem(storageKeys.activeWorkspaceId(tenantId), workspaceId)
      } else {
        localStorage.removeItem(storageKeys.activeWorkspaceId(tenantId))
      }
    }
    set({ activeWorkspaceId: workspaceId })
  },

  clearAuth: () => {
    localStorage.removeItem(storageKeys.activeTenantId())
    // 清掉已知租户的 per-tenant 工作空间选择（key 现按租户隔离，逐个删）。
    const { tenants, activeTenantId } = get()
    const tenantIds = new Set(
      [...tenants.map((tt) => tt.tenant_id), activeTenantId].filter(Boolean) as string[],
    )
    tenantIds.forEach((tid) => localStorage.removeItem(storageKeys.activeWorkspaceId(tid)))
    localStorage.removeItem(storageKeys.csHistory())
    localStorage.removeItem(storageKeys.csConversationId())
    // CSRF cookie lifecycle belongs to the server (Set-Cookie). A host-only
    // `path=/` delete cannot reliably clear a `Domain=.modelgo.com` same-name
    // cookie during the parent-domain migration, and matchCSRFCookie tolerates
    // a stale+fresh pair on purpose — purging it here re-arms the prior
    // /login↔/dashboard shadowing incident. Clearing in-memory state suffices.
    set({
      account: null,
      activeTenantId: null,
      activeWorkspaceId: null,
      tenants: [],
      permissions: null,
      menus: [],
      isAuthenticated: false,
      isLoading: false,
    })
  },

  setLoading: (isLoading) => set({ isLoading }),

  hasPermission: (permission) => get().permissions?.includes(permission) ?? false,

  getMenuActions: (menuKey) => get().menus.find((m) => m.key === menuKey)?.actions ?? {},
}))
