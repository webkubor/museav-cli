/**
 * 用户偏好（§四）
 * 路由：/settings/preferences
 * API：GET|PATCH /account/preferences
 */
import { get, patch } from '@/lib/request'
import type { Preferences, UpdatePreferencesRequest } from '@/types'

/** 读取当前用户偏好 */
export function getPreferences() {
  return get<Preferences>('account/preferences')
}

/** 更新偏好（JSON Merge Patch，仅传需要修改的字段） */
export function updatePreferences(body: UpdatePreferencesRequest) {
  return patch<Preferences>('account/preferences', body)
}
