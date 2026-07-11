/**
 * 路由级权限守卫。与菜单同源（nav.ts / console-routes 的 permission），
 * 堵住「菜单隐藏但直接敲 URL 仍可进」的访问控制缺口。
 *
 * fail-closed：
 *   - granted === null（会话加载中 / 切组织重拉的过渡窗）→ 只显示加载态，绝不先渲染受保护页面。
 *   - granted 为权威数组且不含该权限 → 渲染 403（ForbiddenPage）。
 * 真正的数据权威闸仍在后端 API；此守卫只挡前端页面入口。
 */
import type { ReactNode } from 'react'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/use-permissions'
import type { Permission } from '@/config/permissions'
import ForbiddenPage from '@/pages/forbidden'

export function RequirePermission({ perm, children }: { perm: Permission; children: ReactNode }) {
  const granted = useAuthStore((s) => s.permissions)
  const { hasPermission } = usePermissions()

  if (granted === null) {
    return (
      <div className="flex min-h-48 items-center justify-center" role="status" aria-label="权限加载中">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-mg-border border-t-brand-base" />
      </div>
    )
  }
  if (!hasPermission(perm)) return <ForbiddenPage />
  return <>{children}</>
}
