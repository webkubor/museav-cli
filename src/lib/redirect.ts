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

export function getRedirectTarget(fallback = '/dashboard'): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('redirect') || fallback
}
