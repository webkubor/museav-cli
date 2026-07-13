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
 *
 * 顶层契约字段（#423）：view_mode/source/result/error_code/is_space_owner 是服务端 IngestEvent
 * 直接落库的顶层列，不是业务 props——一律走每个函数的第三个参数 `top`，禁止塞进 data。
 */
import { track, pageView } from '@model-go/track'
import type { TrackEventOptions } from '@model-go/track'
import type { Permission } from '@/config/permissions'

type TrackData = Record<string, string | number | boolean>

/** 顶层契约字段，调用侧按需传；page/route 由 SDK 自动带，这里不重复暴露 */
export type TrackTopFields = Pick<TrackEventOptions, 'view_mode' | 'source' | 'result' | 'error_code' | 'is_space_owner'>

/** 通用事件（自定义 key，用于无 permission_id 对应的动作/曝光） */
export function trackEvent(event: string, data?: TrackData, top?: TrackTopFields): void {
  try {
    track(event, data, top)
  } catch {
    /* 埋点不阻断业务 */
  }
}

/** 动作埋点：event key = 权限体系的 permission_id（PERMS.*），与按钮/菜单权限同源 */
export function trackAction(permission: Permission, data?: TrackData, top?: TrackTopFields): void {
  try {
    track(permission, data, top)
  } catch {
    /* 埋点不阻断业务 */
  }
}

/**
 * 可测性 hook：把埋点 event key 落成 DOM 属性 `data-track`，供自动化/QA 稳定定位。
 * 与埋点单一真源（key 即 permission_id / `xxx:yyy` 约定），不额外维护 test-only id。
 * 用法：`<Button {...trackable('api_keys:create')} onClick={...}>`；自动化按 `[data-track="api_keys:create"]` 定位。
 */
export function trackable(event: string): { 'data-track': string } {
  return { 'data-track': event }
}

/** 页面浏览埋点：page = 菜单 menu_key */
export function trackPageView(menuKey: string, data?: TrackData, top?: TrackTopFields): void {
  try {
    pageView(menuKey, typeof location !== 'undefined' ? location.pathname : '', data, top)
  } catch {
    /* 埋点不阻断业务 */
  }
}
