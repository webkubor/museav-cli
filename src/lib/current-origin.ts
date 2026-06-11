function safeLocation() {
  if (typeof window === 'undefined') return null
  return window.location
}

/** http://localhost:5173 或 https://console.modelgo.com */
export function getCurrentOrigin(): string {
  return safeLocation()?.origin ?? ''
}

/** localhost 或 console.modelgo.com */
export function getHostname(): string {
  return safeLocation()?.hostname ?? ''
}

/** localhost 或 modelgo.com（去掉子域） */
export function getTopLevelDomain(): string {
  const hostname = getHostname()
  if (!hostname) return ''
  const parts = hostname.split('.')
  return parts.length > 2 ? parts.slice(-2).join('.') : hostname
}
