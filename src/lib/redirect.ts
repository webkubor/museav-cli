/**
 * 统一 redirect 跳转工具
 *
 * 写：toLoginWithRedirect('/device?user_code=ABCD') → '/login?redirect=%2Fdevice%3Fuser_code%3DABCD'
 * 读：getRedirectTarget() → '/device?user_code=ABCD' （登录页读回跳地址）
 */

export function toLoginWithRedirect(returnTo?: string): string {
  const target = returnTo ?? (window.location.pathname + window.location.search)
  return `/login?redirect=${encodeURIComponent(target)}`
}

const AUTH_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password', '/auth/callback']

function isSafeRedirect(path: string): boolean {
  if (!path.startsWith('/')) return false
  if (path.startsWith('//')) return false
  try {
    const url = new URL(path, window.location.origin)
    if (url.origin !== window.location.origin) return false
    if (AUTH_PATHS.some((p) => url.pathname === p || url.pathname.startsWith(p + '/'))) return false
    return true
  } catch {
    return false
  }
}

export function getRedirectTarget(fallback = '/dashboard'): string {
  const params = new URLSearchParams(window.location.search)
  const redirect = params.get('redirect')
  if (!redirect || !isSafeRedirect(redirect)) return fallback
  return redirect
}
