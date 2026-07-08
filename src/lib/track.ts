/**
 * 埋点上报（统一走 @model-go/track SDK）
 *
 * 委托给 SDK：批量上报 + 公共属性自动注入 + 脱敏白名单 + sendBeacon 兜底。
 * SDK 内部对未 init / 上报失败静默处理，绝不抛错阻断业务；这里再包一层 try/catch 兜底。
 *
 * event key 复用「菜单权限体系」的 key，单一真源、零漂移：
 * - 动作类（按钮）：用 `trackAction(PERMS.*)`，event key = `permission_id`（如 api_keys:create），
 *   与按钮的权限 gate 同一个常量。
 * - 页面浏览：用 `trackPageView(menuKey)`，page = 菜单 `menu_key`。
 * - 无权限对应的自定义事件：用 `trackEvent(key)`（key 建议沿用 `xxx:yyy` 冒号约定）。
 *
 * 约束：禁止上报 API Key / 密码 / Prompt / 邮箱 / 手机号等明文（SDK 脱敏白名单也会拦），props 只传枚举或标量。
 */
import { track, pageView } from '@model-go/track'
import type { Permission } from '@/config/permissions'

type TrackData = Record<string, string | number | boolean>

/** 通用事件（自定义 key，用于无 permission_id 对应的动作/曝光） */
export function trackEvent(event: string, data?: TrackData): void {
  try {
    track(event, data)
  } catch {
    /* 埋点不阻断业务 */
  }
}

/** 动作埋点：event key = 权限体系的 permission_id（PERMS.*），与按钮/菜单权限同源 */
export function trackAction(permission: Permission, data?: TrackData): void {
  try {
    track(permission, data)
  } catch {
    /* 埋点不阻断业务 */
  }
}

/** 页面浏览埋点：page = 菜单 menu_key */
export function trackPageView(menuKey: string, data?: TrackData): void {
  try {
    pageView(menuKey, typeof location !== 'undefined' ? location.pathname : '', data)
  } catch {
    /* 埋点不阻断业务 */
  }
}
