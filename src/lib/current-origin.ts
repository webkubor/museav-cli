/**
 * 读取当前页面真实 origin，用于拼接对外分享链接。
 *
 * getSiteOrigin：去掉 console. 子域，得到主站 origin。
 *   console.modelgo.com  → https://modelgo.com
 *   console.test.modelgo.com → https://test.modelgo.com
 *   localhost:5173       → http://localhost:5173（不变，保留端口）
 *
 * getCurrentOrigin：返回 window.location.origin 原值，含子域与端口。
 * getHostname：返回 window.location.hostname。
 * getTopLevelDomain：返回二级域（modelgo.com / localhost）。
 */

function safeLocation() {
  if (typeof window === 'undefined') return null
  return window.location
}

export function getCurrentOrigin(): string {
  return safeLocation()?.origin ?? ''
}

export function getHostname(): string {
  return safeLocation()?.hostname ?? ''
}

export function getTopLevelDomain(): string {
  const hostname = getHostname()
  if (!hostname) return ''
  const parts = hostname.split('.')
  return parts.length > 2 ? parts.slice(-2).join('.') : hostname
}

export function getSiteOrigin(): string {
  const loc = safeLocation()
  if (!loc) return ''
  const { protocol, hostname } = loc
  // localhost / IP：直接返回完整 origin（含端口）
  if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return loc.origin
  }
  // 去掉 console. 子域，拿到主站 origin
  const site = hostname.replace(/^console\./, '')
  return `${protocol}//${site}`
}
