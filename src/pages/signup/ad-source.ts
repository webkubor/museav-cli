/**
 * 广告来源透传到注册请求（投放归因，飞书《投放埋点需求》5.3 / #1228 P0）。
 *
 * 官网落地时把 gclid / utm_* / campaign_id / ad_group_id 挂在跳转链接上带过来，
 * 控制台在这里读出来，随邮箱/手机号登录（即注册）请求上送，由后端与新用户绑定落库。
 *
 * 口径：只上送 last-click（URL 上的无前缀参数）。first-touch（ft_ 前缀）后端契约尚未包含，暂不上送。
 * 与推荐码一样做会话级持久化：URL 命中即落 sessionStorage，之后页面 URL 丢了也能取回；
 * 注册成功后清掉。持久化记录 24 小时后失效，限制失败残留被同一浏览器的后续注册复用的时间窗口。
 */

export const AD_SOURCE_KEYS = [
  'gclid',
  'gbraid',
  'wbraid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'campaign_id',
  'ad_group_id',
] as const

export type AdSourceFields = Partial<Record<(typeof AD_SOURCE_KEYS)[number], string>>

const AD_SOURCE_SESSION_KEY = 'mg_ad_source'
const MAX_VALUE_LENGTH = 200
const MAX_AGE_MS = 24 * 60 * 60 * 1000

/** 从 query 里挑出广告来源字段，空值与未知键丢弃，值截断到 200 字符。 */
export function adSourceFromSearchParams(searchParams: URLSearchParams): AdSourceFields {
  const picked: AdSourceFields = {}
  for (const key of AD_SOURCE_KEYS) {
    const value = searchParams.get(key)
    if (value) picked[key] = value.slice(0, MAX_VALUE_LENGTH)
  }
  return picked
}

/** 逐项校验：只保留白名单键、非空字符串、长度受限的值。 */
function sanitizeAdSource(raw: unknown): AdSourceFields | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const clean: AdSourceFields = {}
  for (const key of AD_SOURCE_KEYS) {
    const value = (raw as Record<string, unknown>)[key]
    if (typeof value === 'string' && value) clean[key] = value.slice(0, MAX_VALUE_LENGTH)
  }
  return Object.keys(clean).length > 0 ? clean : undefined
}

/** 只解析站内相对路径的 redirect（以单个 / 开头），外域或协议相对地址一律忽略。 */
function adSourceFromRedirect(searchParams: URLSearchParams): AdSourceFields {
  const redirect = searchParams.get('redirect')
  if (!redirect || !redirect.startsWith('/') || redirect.startsWith('//')) return {}
  try {
    return adSourceFromSearchParams(new URL(redirect, 'https://placeholder.invalid').searchParams)
  } catch {
    return {}
  }
}

/**
 * 解析广告来源：URL 命中即持久化并返回；否则回退 sessionStorage（未过期才用）；都没有返回 undefined。
 * 与推荐码一样解开站内 redirect 内嵌 query（未登录访问 / 时参数会被折进 /login?redirect=…）。
 */
export function resolveAdSource(searchParams: URLSearchParams, now = Date.now()): AdSourceFields | undefined {
  let fromUrl = adSourceFromSearchParams(searchParams)
  if (Object.keys(fromUrl).length === 0) fromUrl = adSourceFromRedirect(searchParams)
  try {
    if (Object.keys(fromUrl).length > 0) {
      sessionStorage.setItem(AD_SOURCE_SESSION_KEY, JSON.stringify({ fields: fromUrl, captured_at: now }))
      return fromUrl
    }
    const raw = sessionStorage.getItem(AD_SOURCE_SESSION_KEY)
    if (!raw) return undefined
    const record = JSON.parse(raw) as { fields?: unknown; captured_at?: unknown }
    if (typeof record.captured_at !== 'number' || now - record.captured_at >= MAX_AGE_MS) {
      sessionStorage.removeItem(AD_SOURCE_SESSION_KEY)
      return undefined
    }
    return sanitizeAdSource(record.fields)
  } catch {
    return Object.keys(fromUrl).length > 0 ? fromUrl : undefined
  }
}

/** 注册成功后清除持久化的广告来源，防止串号归因。 */
export function clearPersistedAdSource() {
  try {
    sessionStorage.removeItem(AD_SOURCE_SESSION_KEY)
  } catch {
    /* sessionStorage 不可用时本来就没存，忽略 */
  }
}
