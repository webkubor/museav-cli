/**
 * 时间运算/解析收口层（解析、构造、加减、转 ISO）。
 *
 * 为什么单独抽一层：原生 `new Date('2026-06-30')` 只能按浏览器本地时区或 UTC 解析，
 * 无法「在任意 IANA 时区下构造某一天的起止边界」。而本项目允许用户自定义显示时区
 * （见 `@/lib/timezone`），一旦用户的显示时区 ≠ 浏览器时区，手搓 Date 算出的边界
 * 就和用户屏幕上看到的日期对不上 —— 这正是 API Key 自定义过期时间曾经的 bug 根源。
 *
 * 业务层不要再直接 `new Date(...)` 做范围/边界运算，统一调这里的语义函数。
 * 纯展示格式化仍走 `@/lib/format-date`（它已基于 Intl + 用户时区，无需 dayjs）。
 */
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { resolveTimeZone } from '@/lib/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

export type TimeUnit = dayjs.ManipulateType

/** 当前生效的用户显示时区（IANA 名，如 `Asia/Shanghai`）。 */
export function userTimeZone(): string {
  return resolveTimeZone()
}

/**
 * 把日历日（`YYYY-MM-DD`）解析为「该时区当天 00:00:00.000」对应的 UTC ISO。
 * 例：`startOfLocalDayISO('2026-06-30', 'Asia/Shanghai')` → `2026-06-29T16:00:00.000Z`
 */
export function startOfLocalDayISO(date: string, tz: string = userTimeZone()): string {
  return dayjs.tz(date, tz).startOf('day').toISOString()
}

/**
 * 把日历日（`YYYY-MM-DD`）解析为「该时区当天 23:59:59.999」对应的 UTC ISO。
 * 例：`endOfLocalDayISO('2026-06-30', 'Asia/Shanghai')` → `2026-06-30T15:59:59.999Z`
 */
export function endOfLocalDayISO(date: string, tz: string = userTimeZone()): string {
  return dayjs.tz(date, tz).endOf('day').toISOString()
}

/** 当前时刻的 UTC ISO。 */
export function nowISO(): string {
  return dayjs().toISOString()
}

/**
 * 「现在 + amount 个 unit」的 UTC ISO（amount 可为负表示往前）。
 * 瞬时点偏移，不依赖时区。例：`addFromNowISO(7, 'day')`、`addFromNowISO(-30, 'day')`。
 */
export function addFromNowISO(amount: number, unit: TimeUnit): string {
  return dayjs().add(amount, unit).toISOString()
}
