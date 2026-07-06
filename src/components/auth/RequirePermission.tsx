/**
 * 路由级权限守卫。与菜单同源（nav.ts / console-routes 的 permission），
 * 堵住「菜单隐藏但直接敲 URL 仍可进」的访问控制缺口。
 *
 * fail-closed 但避免过渡窗误伤：
 *   - granted === null（会话加载中 / 切组织重拉的过渡窗）→ 放行子内容，不重定向，
 *     否则会把合法用户从当前页踢走（usePermissions 此时对一切返回 false）。
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

  if (granted === null) return <>{children}</>
  if (!hasPermission(perm)) return <ForbiddenPage />
  return <>{children}</>
}
