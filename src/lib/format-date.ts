import i18n from 'i18next'

function currentLocale(): string {
  return i18n.language || navigator.language || 'en'
}

/** "Jan 1, 12:00 AM" — 账单、列表场景 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(currentLocale(), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** "Jan 1, 12:00:00 AM" — 需要秒级精度的场景（日志列表） */
export function formatDateTimeWithSeconds(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(currentLocale(), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/** "2024/1/1" — 纯日期，无时间 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(currentLocale())
}

/** "12:00:00 AM" — 纯时间 */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString(currentLocale())
}

/** "1/1" — 图表 X 轴 tick */
export function formatChartDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** "Jan 1" — 图表 tooltip 日期 */
export function formatChartTooltipDate(iso: string): string {
  return new Date(iso).toLocaleDateString(currentLocale(), { month: 'short', day: 'numeric' })
}

/** "1.2s" / "350ms" — 接口耗时 */
export function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}
