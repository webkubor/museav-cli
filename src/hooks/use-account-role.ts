/**
 * 账户层权限 Hook
 *
 * 作用范围：账户本身的身份状态，与工作区/组织无关
 *   - 是否已登录
 *   - 当前是否处于个人账户模式（无企业租户）
 *   - 当前是否处于企业账户模式
 *
 * 注：此层不区分 owner/admin/member，
 *     组织内细粒度权限请使用 useTenantRole / useWorkspaceRole。
 */
import { useAuthStore } from '@/store/auth'

export function useAccountRole() {
  const account         = useAuthStore((s) => s.account)
  const activeTenantId  = useAuthStore((s) => s.activeTenantId)
  const tenants         = useAuthStore((s) => s.tenants)

  const activeTenant = tenants.find((t) => t.tenant_id === activeTenantId)

  const isLoggedIn       = !!account
  /** 处于个人账户模式（无激活企业租户）*/
  const isPersonalMode   = !activeTenantId || activeTenant?.type === 'personal'
  /** 处于企业账户模式 */
  const isEnterpriseMode = !!activeTenantId && activeTenant?.type === 'enterprise'

  return {
    account,
    isLoggedIn,
    isPersonalMode,
    isEnterpriseMode,
    activeTenantId,
    activeTenant,
  }
}
