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

/**
 * datetime-local 输入值（`YYYY-MM-DDTHH:mm`，无时区）按用户显示时区解释 → UTC ISO。
 * 空/非法 → ''。用户屏幕上按显示时区读时间，输入也按同一时区解释，避免「填 12:00 却存成浏览器时区 12:00」。
 */
export function localInputToISO(v: string, tz: string = userTimeZone()): string {
  if (!v) return ''
  const d = dayjs.tz(v, tz)
  return d.isValid() ? d.toISOString() : ''
}

/** UTC ISO → 用户显示时区的 datetime-local 值（`YYYY-MM-DDTHH:mm`）；空/非法 → ''。 */
export function isoToLocalInput(iso: string | null | undefined, tz: string = userTimeZone()): string {
  if (!iso) return ''
  const d = dayjs.utc(iso).tz(tz)
  return d.isValid() ? d.format('YYYY-MM-DDTHH:mm') : ''
}

/** 「现在」所在月 + offset 个月的月初 00:00，按用户显示时区取边界 → UTC ISO。 */
export function startOfMonthISO(offset: number, tz: string = userTimeZone()): string {
  return dayjs().tz(tz).add(offset, 'month').startOf('month').toISOString()
}

/** 同上取月末 23:59:59.999 → UTC ISO。 */
export function endOfMonthISO(offset: number, tz: string = userTimeZone()): string {
  return dayjs().tz(tz).add(offset, 'month').endOf('month').toISOString()
}

/** 用户显示时区里的「今天」日历日（`YYYY-MM-DD`），供 date input 默认值/下限。 */
export function todayInputDate(tz: string = userTimeZone()): string {
  return dayjs().tz(tz).format('YYYY-MM-DD')
}
