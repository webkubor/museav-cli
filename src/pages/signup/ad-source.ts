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

/**
 * 只进埋点、不上送注册接口的字段：
 * - channel_id / matchtype / device / network：Google Ads 跟踪模板带的来源维度（prd46#1271）；
 * - reg_click_ts：官网点击跳往控制台的时刻（ms 时间戳字符串），与注册成功时刻 reg_success_ts 配对，用于闭环验证。
 */
export const AD_TRACKING_ONLY_KEYS = ['channel_id', 'matchtype', 'device', 'network', 'reg_click_ts'] as const

const AD_ATTRIBUTION_KEYS = [...AD_SOURCE_KEYS, ...AD_TRACKING_ONLY_KEYS] as const

export type AdSourceFields = Partial<Record<(typeof AD_SOURCE_KEYS)[number], string>>
export type AdAttributionFields = Partial<Record<(typeof AD_ATTRIBUTION_KEYS)[number], string>>

const AD_SOURCE_SESSION_KEY = 'mg_ad_source'
const MAX_VALUE_LENGTH = 200
const MAX_AGE_MS = 24 * 60 * 60 * 1000
const PLACEHOLDER_ORIGIN = 'https://placeholder.invalid'

/** Google 广告点击 ID：能把一次点击串回广告的三个键，任一存在即视为「本次 URL 带了点击」。 */
const CLICK_ID_KEYS = ['gclid', 'gbraid', 'wbraid'] as const

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

/** 读持久化记录（未过期才用），不写入；过期即清掉。返回字段与其原始捕获时间。 */
function readPersistedRecord(now: number): { fields: AdAttributionFields; capturedAt: number } | undefined {
  try {
    const raw = sessionStorage.getItem(AD_SOURCE_SESSION_KEY)
    if (!raw) return undefined
    const record = JSON.parse(raw) as { fields?: unknown; captured_at?: unknown }
    const capturedAt = record.captured_at
    if (typeof capturedAt !== 'number' || now - capturedAt >= MAX_AGE_MS) {
      sessionStorage.removeItem(AD_SOURCE_SESSION_KEY)
      return undefined
    }
    const fields = sanitizeAttribution(record.fields)
    return fields ? { fields, capturedAt } : undefined
  } catch {
    return undefined
  }
}

/** 只读持久化记录的字段（未过期才用），不写入。 */
export function readPersistedAdAttribution(now = Date.now()): AdAttributionFields | undefined {
  return readPersistedRecord(now)?.fields
}

/**
 * 解析完整广告来源（含只进埋点的字段）：URL 命中即持久化并返回；否则回退 sessionStorage（未过期才用）；
 * 都没有返回 undefined。与推荐码一样解开站内 redirect 内嵌 query（未登录访问 / 时参数会被折进 /login?redirect=…）。
 *
 * 点击 ID 粘性：URL 只带 utm_* 等非点击参数时，沿用未过期记录里的 gclid / gbraid / wbraid。否则站内再进一次
 * 带 utm 的链接就会把 Google 点击 ID 冲掉，注册时对不上广告。其余字段仍以本次 URL 为准（last-touch）；
 * 本次只要带了任一点击 ID，就整体以新值为准。沿用时**不续期**：captured_at 保留原值，24h 窗口从真正点击那一刻起算，
 * 否则每次带 utm 的访问都会把点击 ID 再续 24h，等于无限期保留。
 */
export function resolveAdAttribution(searchParams: URLSearchParams, now = Date.now()): AdAttributionFields | undefined {
  let fromUrl: AdAttributionFields = pickFromSearchParams(searchParams, AD_ATTRIBUTION_KEYS)
  if (Object.keys(fromUrl).length === 0) fromUrl = attributionFromRedirect(searchParams)
  if (Object.keys(fromUrl).length === 0) return readPersistedAdAttribution(now)

  let capturedAt = now
  if (!CLICK_ID_KEYS.some((key) => fromUrl[key])) {
    const stored = readPersistedRecord(now)
    if (stored) {
      for (const key of CLICK_ID_KEYS) {
        const value = stored.fields[key]
        if (value) {
          fromUrl[key] = value
          capturedAt = stored.capturedAt
        }
      }
    }
  }
  try {
    sessionStorage.setItem(AD_SOURCE_SESSION_KEY, JSON.stringify({ fields: fromUrl, captured_at: capturedAt }))
  } catch {
    /* sessionStorage 不可用：本次仍以 URL 值为准 */
  }
  return fromUrl
}

/**
 * 应用启动时捕获广告来源（`main.tsx` 调一次，必须早于 `captureNewAccountFlag`，后者的 OAuth 快照读的是这份记录）。
 *
 * 落地页（如 `/models?gclid=…`）不一定经过登录页；若只在登录页才持久化，用户浏览完再点头部「登录」进 `/login`
 * （不带参数）时来源就丢了。这里只做 `resolveAdAttribution` 的持久化副作用，不返回值；异常一律吞掉，不阻断启动。
 */
export function captureAdAttributionAtBoot(now = Date.now()): void {
  if (typeof window === 'undefined') return
  try {
    resolveAdAttribution(new URLSearchParams(window.location.search), now)
  } catch {
    /* 捕获失败就算了：埋点不能影响启动 */
  }
}

/** 解析上送注册接口的广告来源（不含只进埋点的字段），规则同 `resolveAdAttribution`。 */
export function resolveAdSource(searchParams: URLSearchParams, now = Date.now()): AdSourceFields | undefined {
  return toAdSource(resolveAdAttribution(searchParams, now))
}

/** 注册成功后清除持久化的广告来源，防止串号归因。 */
export function clearPersistedAdSource() {
  try {
    sessionStorage.removeItem(AD_SOURCE_SESSION_KEY)
  } catch {
    /* sessionStorage 不可用时本来就没存，忽略 */
  }
}
