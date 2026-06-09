import { post } from '@/lib/request'
import type { MenuSyncItem } from '@/config/menu-sync-data'

interface MenuSyncResult {
  upserted: number
  skipped: number
}

export function syncMenus(menus: MenuSyncItem[]) {
  return post<MenuSyncResult>('admin/menus/sync', { menus })
}
