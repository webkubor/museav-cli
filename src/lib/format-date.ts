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

/** 是否已过期（含空值兜底为 false）；外置成纯函数供组件调用，避免在渲染体内直接调 Date.now() 触发 react-hooks/purity。 */
export function isPast(iso: string | null | undefined): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return !Number.isNaN(t) && t < Date.now()
}

/** 相对时间："刚刚 / X 分钟前 / X 小时前 / X 天前 / X 周前 / X 个月前"，超 12 个月回退到绝对日期。空值返回 '—'。 */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return '—'
  const diffSec = Math.floor((Date.now() - then) / 1000)
  if (diffSec < 60) return i18n.t('common.relativeTime.justNow', { ns: 'common' })
  const min = Math.floor(diffSec / 60)
  if (min < 60) return i18n.t('common.relativeTime.minutesAgo', { ns: 'common', count: min })
  const hr = Math.floor(min / 60)
  if (hr < 24) return i18n.t('common.relativeTime.hoursAgo', { ns: 'common', count: hr })
  const day = Math.floor(hr / 24)
  if (day < 7) return i18n.t('common.relativeTime.daysAgo', { ns: 'common', count: day })
  const week = Math.floor(day / 7)
  if (week < 5) return i18n.t('common.relativeTime.weeksAgo', { ns: 'common', count: week })
  const month = Math.floor(day / 30)
  if (month < 12) return i18n.t('common.relativeTime.monthsAgo', { ns: 'common', count: month })
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

/** "2026/08/12 14:30" — 需求方#571：年份必显的数字格式（API Keys 列表）。
 * 固定 YYYY/MM/DD HH:mm 字序，不随 locale 变（en 下数字序 M/D/YYYY 有歧义，同 formatDate 注释的坑）。 */
export function formatDateTimeYMD(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const parts = new Intl.DateTimeFormat('en-US', dateOptions({
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })).formatToParts(d)
  const get = (type: Intl.DateTimeFormatPart['type']) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}/${get('month')}/${get('day')} ${get('hour')}:${get('minute')}`
}

/** "09-24 16:06" — 工单「补充 · MM-DD HH:mm」（PRD §7.11 定的字序）。
 * 同 formatDateTimeYMD 固定字序、按用户显示时区，不随 locale 变成 9/24 或 Sep 24。 */
export function formatMonthDayTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const parts = new Intl.DateTimeFormat('en-US', dateOptions({
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })).formatToParts(d)
  const get = (type: Intl.DateTimeFormatPart['type']) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
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

/**
 * "1.2s" / "350ms" — 接口耗时。
 *
 * 毫秒分支必须取整：单条日志的 duration_ms 是整数，但**聚合值是浮点**
 * （如 /model-logs/summary 的 avg_ttft_ms = 323.90376406674426），直接模板拼接会把
 * 整个浮点吐到页面上。2026-08-19 线上就这么露出来过：调用日志 Summary 的「首 Token」
 * 显示成 `323.90376406674426ms`，而同行的 2.0s 因为走 toFixed(1) 分支看着正常。
 * use-usage-page.tsx 早先也踩过，当时是在调用处包 Math.round —— 补在调用侧治不住，
 * 每个新调用方都得记着包一次，所以收到这里。
 */
export function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
}
