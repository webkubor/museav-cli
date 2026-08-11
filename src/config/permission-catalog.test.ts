import { describe, expect, it } from 'vitest'
import {
  PERMISSION_CATALOG_DEFINITIONS,
  PERMISSION_CATALOG_MENUS,
  PERMISSION_SYNC_PAYLOAD,
  permissionCatalogMeta,
  validatePermissionCatalog,
} from './permission-catalog'
import { LEGACY_PERMISSION_IDS, PERMISSION_DEFINITIONS, type Permission } from './permissions'
import { CONSOLE_ROUTES } from './console-routes'

describe('permission catalog', () => {
  it('passes naming, reference and duplication validation', () => {
    expect(validatePermissionCatalog()).toEqual([])
  })

  it('exports every active Permission ID exactly once as metadata', () => {
    const ids = PERMISSION_CATALOG_DEFINITIONS.map((item) => item.permission_id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(ids)).toEqual(new Set(Object.values(PERMISSION_DEFINITIONS).map((item) => item.id)))
  })

  it('keeps role bindings out of the frontend sync payload', () => {
    expect(PERMISSION_SYNC_PAYLOAD).not.toHaveProperty('roles')
    expect(PERMISSION_SYNC_PAYLOAD).not.toHaveProperty('role_bindings')
    expect(PERMISSION_SYNC_PAYLOAD.menus).toBe(PERMISSION_CATALOG_MENUS)
  })

  it('keeps every route guard aligned with a synced menu view permission', () => {
    // 单向：每条独立路由必须在权限目录里有对应菜单（角色矩阵可管理）。反向不必成立——
    // 有些菜单（如 observability「日志与转发」）已并入其他页面的 Tab，不再是独立路由，
    // 但角色矩阵仍需要单独授权/展示该权限组（见 permission-catalog.ts key: 'observability'）。
    const menuPermissions = new Map<string, Permission>(
      PERMISSION_CATALOG_MENUS.map((menu) => [menu.key, menu.view_permission]),
    )
    for (const route of CONSOLE_ROUTES) {
      if (!route.permission) continue
      expect(menuPermissions.get(route.key)).toBe(route.permission)
    }
  })

  it('does not re-publish legacy backend IDs', () => {
    const active = new Set<string>(PERMISSION_CATALOG_DEFINITIONS.map((item) => item.permission_id))
    for (const legacyId of LEGACY_PERMISSION_IDS) expect(active.has(legacyId)).toBe(false)
    expect(permissionCatalogMeta.legacy_permission_ids).toBe(LEGACY_PERMISSION_IDS)
  })
})
