import i18n from 'i18next'
import { resolveTimeZone } from '@/lib/timezone'

function currentLocale(): string {
  return i18n.language || navigator.language || 'en'
}

function dateOptions<T extends Intl.DateTimeFormatOptions>(options: T): T & { timeZone: string } {
  return {
    ...options,
    timeZone: resolveTimeZone(),
  }
}

/** 相对时间："刚刚 / X 分钟前 / X 小时前 / X 天前"，超 30 天回退到绝对日期。空值返回 '—'。 */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return '—'
  const diffSec = Math.floor((Date.now() - then) / 1000)
  if (diffSec < 60) return i18n.t('relativeTime.justNow', { ns: 'common' })
  const min = Math.floor(diffSec / 60)
  if (min < 60) return i18n.t('relativeTime.minutesAgo', { ns: 'common', count: min })
  const hr = Math.floor(min / 60)
  if (hr < 24) return i18n.t('relativeTime.hoursAgo', { ns: 'common', count: hr })
  const day = Math.floor(hr / 24)
  if (day <= 30) return i18n.t('relativeTime.daysAgo', { ns: 'common', count: day })
  return formatDate(iso)
}

/** "Jan 1, 12:00 AM" — 账单、列表场景 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(currentLocale(), dateOptions({
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }))
}

/** "Jan 1, 12:00:00 AM" — 需要秒级精度的场景（日志列表） */
export function formatDateTimeWithSeconds(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(currentLocale(), dateOptions({
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }))
}

/** "Jan 1, 2024" — 纯日期，无时间。显式给 year/month/day，避免 en 环境下退化成
 * 有歧义的数字格式 M/D/YYYY（8/5/2026 分不清是 8 月 5 日还是 5 月 8 日，2026-08-05 踩过）。 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(currentLocale(), dateOptions({
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }))
}

/** "12:00:00 AM" — 纯时间 */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString(currentLocale(), dateOptions({}))
}

/** "12:00 AM" — 紧凑纯时间 */
export function formatShortTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString(currentLocale(), dateOptions({
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }))
}

/** "1/1" — 图表 X 轴 tick */
export function formatChartDate(iso: string): string {
  return new Date(iso).toLocaleDateString(currentLocale(), dateOptions({ month: 'numeric', day: 'numeric' }))
}

/** "Jan 1" — 图表 tooltip 日期 */
export function formatChartTooltipDate(iso: string): string {
  return new Date(iso).toLocaleDateString(currentLocale(), dateOptions({ month: 'short', day: 'numeric' }))
}

/** "1.2s" / "350ms" — 接口耗时 */
export function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}
