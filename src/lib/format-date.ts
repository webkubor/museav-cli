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
  const zh = currentLocale().startsWith('zh')
  const diffSec = Math.floor((Date.now() - then) / 1000)
  if (diffSec < 60) return zh ? '刚刚' : 'just now'
  const min = Math.floor(diffSec / 60)
  if (min < 60) return zh ? `${min} 分钟前` : `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return zh ? `${hr} 小时前` : `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day <= 30) return zh ? `${day} 天前` : `${day}d ago`
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

/** "2024/1/1" — 纯日期，无时间 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(currentLocale(), dateOptions({}))
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
