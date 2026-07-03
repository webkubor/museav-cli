import { useMemo } from 'react'
import { useAuthStore } from '@/store/auth'
import type { Permission } from '@/config/permissions'

/**
 * 菜单/操作权限 Hook。
 *
 * 唯一权威来源：GET /auth/session 下发的 permissions.granted —— 由
 * modelgo-permissions 基于 DB 权威矩阵（运营在 controller-web
 * 「运营/菜单权限管理」编辑，写入 ≤30s 生效）为当前激活 租户×工作区 解析。
 *
 * fail-closed（#344 / 设计 §3.4 G7）：granted 缺失（null——如切换组织后会话
 * 重拉的过渡窗口）时返回**空权限**，隐藏/禁用而非放行；不再有本地回退矩阵。
 * granted === []（空数组）同样是权威的「零权限」，如实呈现。Deny 优先。
 */
export function usePermissions() {
  const granted = useAuthStore((s) => s.permissions)
  const menus   = useAuthStore((s) => s.menus)

  const permissions = useMemo<Permission[]>(
    () => (granted !== null ? (granted as Permission[]) : []),
    [granted],
  )

  const hasPermission = (perm: Permission): boolean => permissions.includes(perm)

  /** 获取指定菜单的 actions 开关表，供页面组件判断按钮级权限 */
  const getMenuActions = (menuKey: string): Record<string, boolean> =>
    menus.find((m) => m.key === menuKey)?.actions ?? {}

  return { permissions, hasPermission, menus, getMenuActions }
}
