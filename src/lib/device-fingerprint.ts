import FingerprintJS from '@fingerprintjs/fingerprintjs'
import { storageKeys } from '@/lib/storage'

export function getDeviceId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(storageKeys.deviceId())
}

export async function initDeviceFingerprint(): Promise<void> {
  if (getDeviceId()) return
  const fp = await FingerprintJS.load()
  const { visitorId } = await fp.get()
  localStorage.setItem(storageKeys.deviceId(), visitorId)
}
