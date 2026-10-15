/**
 * 第一方匿名访客 ID（统一访客 ID，主键）。
 *
 * - 首次访问生成 UUID，写入第一方 cookie `mg_vid`（1 年，Path=/）。
 * - 名单内外一律写入：这不属于 Google 标签的同意门控（Google 标签仍只在同意后加载）。
 * - 同一浏览器内稳定，不依赖指纹算法。
 * - 跨域（官网 → 控制台）靠链接参数 `mg_vid` 透传，见 lib/visitor-passthrough.ts。
 */
export const VISITOR_COOKIE = 'mg_vid'
export const VISITOR_PARAM = 'mg_vid'
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function isVisitorId(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

function readCookie(name: string): string | null {
  const prefix = `${name}=`
  for (const part of document.cookie.split(';')) {
    const item = part.trim()
    if (item.startsWith(prefix)) return item.slice(prefix.length)
  }
  return null
}

/** 当前浏览器已有的访客 ID；没有或格式不对返回 null。 */
export function readVisitorId(): string | null {
  try {
    const value = readCookie(VISITOR_COOKIE)
    return isVisitorId(value) ? value : null
  } catch {
    return null
  }
}

/** v4 UUID。非安全上下文没有 randomUUID，退回 getRandomValues。 */
function createVisitorUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** 取访客 ID，没有则生成并写 cookie。写入失败（隐私模式等）返回本次内存里的值。 */
export function getOrCreateVisitorId(): string {
  const existing = readVisitorId()
  if (existing) return existing
  const id = createVisitorUuid()
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${VISITOR_COOKIE}=${id}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`
  } catch {
    /* cookie 不可用：本次页面内仍用这个 ID */
  }
  return id
}

/** 来自官网链接参数的访客 ID：仅在本域没有 cookie 时采纳（控制台侧用）。 */
export function adoptVisitorIdFromUrl(search: string): string | null {
  const value = new URLSearchParams(search).get(VISITOR_PARAM)
  if (!isVisitorId(value)) return null
  if (!readVisitorId()) {
    try {
      const secure = window.location.protocol === 'https:' ? '; Secure' : ''
      document.cookie = `${VISITOR_COOKIE}=${value}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`
    } catch {
      /* 忽略 */
    }
  }
  return value
}
