import { storageKeys } from '@/lib/storage'

export const BROWSER_TIME_ZONE = 'browser'

export type TimeZonePreference = typeof BROWSER_TIME_ZONE | string

export const COMMON_TIME_ZONES = [
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'UTC',
  'Europe/London',
  'Europe/Berlin',
  'America/Los_Angeles',
  'America/New_York',
] as const

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format(new Date())
    return true
  } catch {
    return false
  }
}

export function getBrowserTimeZone(): string {
  if (typeof Intl === 'undefined') return 'UTC'
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return timeZone && isValidTimeZone(timeZone) ? timeZone : 'UTC'
}

function normalizePreference(value: string | null): TimeZonePreference {
  if (!value || value === BROWSER_TIME_ZONE) return BROWSER_TIME_ZONE
  return isValidTimeZone(value) ? value : BROWSER_TIME_ZONE
}

export function getSavedTimeZone(): TimeZonePreference {
  if (typeof window === 'undefined') return BROWSER_TIME_ZONE
  return normalizePreference(localStorage.getItem(storageKeys.timeZone()))
}

export function getUserTimeZone(userId: string): TimeZonePreference {
  if (typeof window === 'undefined') return BROWSER_TIME_ZONE
  const userValue = normalizePreference(localStorage.getItem(storageKeys.timeZoneByUser(userId)))
  if (userValue !== BROWSER_TIME_ZONE) return userValue
  return getSavedTimeZone()
}

export function saveTimeZone(timeZone: TimeZonePreference, userId?: string | null) {
  if (typeof window === 'undefined') return
  const value = normalizePreference(timeZone)
  if (userId) localStorage.setItem(storageKeys.timeZoneByUser(userId), value)
  localStorage.setItem(storageKeys.timeZone(), value)
}

export function resolveTimeZone(timeZone: TimeZonePreference = getSavedTimeZone()): string {
  if (timeZone === BROWSER_TIME_ZONE) return getBrowserTimeZone()
  return isValidTimeZone(timeZone) ? timeZone : getBrowserTimeZone()
}

export function formatTimeZoneOffset(timeZone: string, locale: string): string {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone,
    timeZoneName: 'shortOffset',
  }).formatToParts(new Date())
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? timeZone
}
