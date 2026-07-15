/**
 * 路由级租户类型守卫。与菜单同源（console-routes 的 enterpriseOnly），
 * 堵住「个人租户菜单已隐藏但直接敲 URL 仍可进」的缺口（PRD 企业&空间管理：个人租户不展示企业管理）。
 *
 * 权限码按角色下发（个人租户 owner 同样持有 ORG_VIEW），表达不了租户类型，
 * 故此维度独立成守卫，与 RequirePermission 叠加使用。
 *
 * fail-closed：租户列表未就绪（会话加载中 / 切组织过渡窗）→ 只显示加载态；
 * 个人租户 → 403（与 RequirePermission 的无权限表现一致）。
 */
import type { ReactNode } from 'react'
import { useAuthStore } from '@/store/auth'
import ForbiddenPage from '@/pages/forbidden'

export function RequireEnterpriseTenant({ children }: { children: ReactNode }) {
  const tenants = useAuthStore((s) => s.tenants)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const activeTenant = tenants.find((t) => t.tenant_id === activeTenantId)

  if (!activeTenant) {
    return (
      <div className="flex min-h-48 items-center justify-center" role="status" aria-label="租户加载中">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-mg-border border-t-brand-base" />
      </div>
    )
  }
  if (activeTenant.type === 'personal') return <ForbiddenPage />
  return <>{children}</>
}
