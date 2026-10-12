/**
 * 广告来源透传到注册请求（投放归因，飞书《投放埋点需求》5.3 / #1228 P0）。
 *
 * 官网落地时把 gclid / utm_* / campaign_id / ad_group_id 挂在跳转链接上带过来，
 * 控制台在这里读出来，随邮箱/手机号登录（即注册）请求上送，由后端与新用户绑定落库。
 *
 * 口径：只上送 last-click（URL 上的无前缀参数）。first-touch（ft_ 前缀）后端契约尚未包含，暂不上送。
 * 与推荐码一样做会话级持久化：URL 命中即落 sessionStorage，之后页面 URL 丢了也能取回；
 * 注册成功后清掉。持久化记录 24 小时后失效，限制失败残留被同一浏览器的后续注册复用的时间窗口。
 *
 * channel_id / matchtype / device / network（Google Ads 跟踪模板带的，prd46#1271）一并持久化，
 * 但**只给埋点用**（GTM dataLayer 的 sign_up）：后端 #1228 契约没有这 4 个字段，
 * `resolveAdSource` 不返回它们，注册请求体与改动前一致；埋点侧用 `resolveAdAttribution`。
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

/** 只进埋点、不上送注册接口的来源字段。 */
export const AD_TRACKING_ONLY_KEYS = ['channel_id', 'matchtype', 'device', 'network'] as const

const AD_ATTRIBUTION_KEYS = [...AD_SOURCE_KEYS, ...AD_TRACKING_ONLY_KEYS] as const

export type AdSourceFields = Partial<Record<(typeof AD_SOURCE_KEYS)[number], string>>
export type AdAttributionFields = Partial<Record<(typeof AD_ATTRIBUTION_KEYS)[number], string>>

const AD_SOURCE_SESSION_KEY = 'mg_ad_source'
const MAX_VALUE_LENGTH = 200
const MAX_AGE_MS = 24 * 60 * 60 * 1000
const PLACEHOLDER_ORIGIN = 'https://placeholder.invalid'

function pickFromSearchParams(searchParams: URLSearchParams, keys: readonly string[]): Record<string, string> {
  const picked: Record<string, string> = {}
  for (const key of keys) {
    const value = searchParams.get(key)
    if (value) picked[key] = value.slice(0, MAX_VALUE_LENGTH)
  }
  return picked
}

/** 从 query 里挑出上送注册接口的广告来源字段，空值与未知键丢弃，值截断到 200 字符。 */
export function adSourceFromSearchParams(searchParams: URLSearchParams): AdSourceFields {
  return pickFromSearchParams(searchParams, AD_SOURCE_KEYS)
}

/** 逐项校验：只保留白名单键、非空字符串、长度受限的值。 */
function sanitizeAttribution(raw: unknown): AdAttributionFields | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const clean: AdAttributionFields = {}
  for (const key of AD_ATTRIBUTION_KEYS) {
    const value = (raw as Record<string, unknown>)[key]
    if (typeof value === 'string' && value) clean[key] = value.slice(0, MAX_VALUE_LENGTH)
  }
  return Object.keys(clean).length > 0 ? clean : undefined
}

/** 只取上送注册接口的那部分；一个都没有返回 undefined。 */
function toAdSource(fields: AdAttributionFields | undefined): AdSourceFields | undefined {
  if (!fields) return undefined
  const picked: AdSourceFields = {}
  for (const key of AD_SOURCE_KEYS) {
    if (fields[key]) picked[key] = fields[key]
  }
  return Object.keys(picked).length > 0 ? picked : undefined
}

/** 只解析站内相对路径的 redirect（以单个 / 开头），外域或协议相对地址一律忽略。 */
function attributionFromRedirect(searchParams: URLSearchParams): AdAttributionFields {
  const redirect = searchParams.get('redirect')
  if (!redirect || !redirect.startsWith('/') || redirect.startsWith('//') || redirect.includes('\\')) return {}
  try {
    const url = new URL(redirect, PLACEHOLDER_ORIGIN)
    if (url.origin !== PLACEHOLDER_ORIGIN) return {}
    return pickFromSearchParams(url.searchParams, AD_ATTRIBUTION_KEYS)
  } catch {
    return {}
  }
}

/** 只读持久化记录（未过期才用），不写入。 */
export function readPersistedAdAttribution(now = Date.now()): AdAttributionFields | undefined {
  try {
    const raw = sessionStorage.getItem(AD_SOURCE_SESSION_KEY)
    if (!raw) return undefined
    const record = JSON.parse(raw) as { fields?: unknown; captured_at?: unknown }
    if (typeof record.captured_at !== 'number' || now - record.captured_at >= MAX_AGE_MS) {
      sessionStorage.removeItem(AD_SOURCE_SESSION_KEY)
      return undefined
    }
    return sanitizeAttribution(record.fields)
  } catch {
    return undefined
  }
}

/**
 * 解析完整广告来源（含只进埋点的字段）：URL 命中即持久化并返回；否则回退 sessionStorage（未过期才用）；
 * 都没有返回 undefined。与推荐码一样解开站内 redirect 内嵌 query（未登录访问 / 时参数会被折进 /login?redirect=…）。
 */
export function resolveAdAttribution(searchParams: URLSearchParams, now = Date.now()): AdAttributionFields | undefined {
  let fromUrl: AdAttributionFields = pickFromSearchParams(searchParams, AD_ATTRIBUTION_KEYS)
  if (Object.keys(fromUrl).length === 0) fromUrl = attributionFromRedirect(searchParams)
  if (Object.keys(fromUrl).length === 0) return readPersistedAdAttribution(now)
  try {
    sessionStorage.setItem(AD_SOURCE_SESSION_KEY, JSON.stringify({ fields: fromUrl, captured_at: now }))
  } catch {
    /* sessionStorage 不可用：本次仍以 URL 值为准 */
  }
  return fromUrl
}

/** 解析上送注册接口的广告来源（不含只进埋点的字段），规则同 `resolveAdAttribution`。 */
export function resolveAdSource(searchParams: URLSearchParams, now = Date.now()): AdSourceFields | undefined {
  return toAdSource(resolveAdAttribution(searchParams, now))
}

/**
 * 启动时把当前落地页的广告来源落一次持久化（prd46#1271 补 OAuth 归因）。
 *
 * 背景：`resolveAdSource` / `resolveAdAttribution` 原本只在邮箱验证码提交那一刻才调，
 * 于是 sessionStorage 在「点 Google 登录之前」是空的 —— OAuth 要整页跳去厂商再 302 回来，
 * 回跳 URL 只带 `is_new_account`，不带任何来源参数，所以 OAuth 新注册的 `sign_up`
 * 既没有 `gclid` 也没有 `campaign_id`，后端那边同样存不到（OAuth 链路上送不了
 * ad_source，厂商授权请求里没有这些参数）。改成每次进控制台先落一次：邮箱/验证码提交
 * 仍按原逻辑解析当前 URL，OAuth 回跳则能从 sessionStorage 取回本 tab 早先落下的来源。
 *
 * 只在 URL / redirect 命中来源参数时才写（见 `resolveAdAttribution`），没命中就只读不写，
 * 所以既不会覆盖已有记录，也不会把无来源的访问写进去。
 */
export function persistAdAttributionOnBoot(): void {
  if (typeof window === 'undefined') return
  try {
    resolveAdAttribution(new URLSearchParams(window.location.search))
  } catch {
    /* 埋点不阻断启动 */
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
