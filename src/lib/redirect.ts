/**
 * 统一 redirect 跳转工具
 *
 * 写：toLoginWithRedirect('/device?user_code=ABCD') → '/login?redirect=%2Fdevice%3Fuser_code%3DABCD'
 * 读：getRedirectTarget() → '/device?user_code=ABCD' （登录页读回跳地址）
 *
 * 模型登录意图（qa#551，PRD《首页重构 PRD：模型广场页面》§11）：
 * 「去体验」「发起模型对比」命中未登录时，除了保存返回 URL，还需保存 model_id /
 * model_category / experience_type / compare_with / detail_source 等结构化上下文，
 * 供登录成功后重新校验模型状态。用 sessionStorage（非 URL query）承载并带 30 分钟
 * 有效期——PRD 明确要求「设置有效期并禁止任意路由注入」，塞进 query 会被当作可任意
 * 拼接的路由参数，sessionStorage 只由本文件写入/读出，杜绝了这个面。
 */

const LOGIN_INTENT_KEY = 'modelgo_login_intent'
const LOGIN_INTENT_TTL_MS = 30 * 60 * 1000 // 30 分钟，PRD §11「设置有效期」

export type ModelExperienceType = 'try' | 'compare'

export interface ModelLoginIntent {
  /** 「去体验」场景的目标模型 id */
  model_id?: string
  /** 模型一级类别（与 model-experience-data.tsx 的 resolveModelCategory 口径一致） */
  model_category?: string
  /** 本次登录意图对应的体验类型 */
  experience_type?: ModelExperienceType
  /** 对比场景下已选中的模型 id 列表 */
  compare_with?: string[]
  /** 触发来源页面，用于降级判断/排查 */
  detail_source?: 'catalog' | 'detail' | 'experience'
}

interface StoredLoginIntent extends ModelLoginIntent {
  expires_at: number
}

export function toLoginWithRedirect(returnTo?: string, intent?: ModelLoginIntent): string {
  const target = returnTo ?? (window.location.pathname + window.location.search)
  if (intent && typeof window !== 'undefined') {
    try {
      const payload: StoredLoginIntent = { ...intent, expires_at: Date.now() + LOGIN_INTENT_TTL_MS }
      window.sessionStorage.setItem(LOGIN_INTENT_KEY, JSON.stringify(payload))
    } catch {
      // sessionStorage 不可用（隐私模式等）时静默跳过，不影响基本的登录回跳
    }
  }
  return `/login?redirect=${encodeURIComponent(target)}`
}

/**
 * 一次性读取并清除模型登录意图；不存在/已损坏/超过有效期均返回 null。
 * 只读本文件自己写入的结构化对象，不解析任意路由 query。
 */
export function consumeModelLoginIntent(): ModelLoginIntent | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(LOGIN_INTENT_KEY)
    window.sessionStorage.removeItem(LOGIN_INTENT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredLoginIntent
    if (!parsed || typeof parsed.expires_at !== 'number' || Date.now() > parsed.expires_at) return null
    const intent: Partial<StoredLoginIntent> = { ...parsed }
    delete intent.expires_at
    return intent
  } catch {
    return null
  }
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
