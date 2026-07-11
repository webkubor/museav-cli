import { describe, expect, it } from 'vitest'
import {
  PERMISSION_CATALOG_DEFINITIONS,
  PERMISSION_CATALOG_MENUS,
  PERMISSION_SYNC_PAYLOAD,
  permissionCatalogMeta,
  validatePermissionCatalog,
} from './permission-catalog'
import { LEGACY_PERMISSION_IDS, PERMISSION_DEFINITIONS } from './permissions'
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

  it('keeps every synced menu view permission aligned with its route guard', () => {
    const routePermissions = new Map(CONSOLE_ROUTES.map((route) => [route.key, route.permission]))
    expect(new Set(routePermissions.keys())).toEqual(new Set(PERMISSION_CATALOG_MENUS.map((menu) => menu.key)))
    for (const menu of PERMISSION_CATALOG_MENUS) {
      expect(routePermissions.get(menu.key)).toBe(menu.view_permission)
    }
  })

  it('does not re-publish legacy backend IDs', () => {
    const active = new Set<string>(PERMISSION_CATALOG_DEFINITIONS.map((item) => item.permission_id))
    for (const legacyId of LEGACY_PERMISSION_IDS) expect(active.has(legacyId)).toBe(false)
    expect(permissionCatalogMeta.legacy_permission_ids).toBe(LEGACY_PERMISSION_IDS)
  })
})
