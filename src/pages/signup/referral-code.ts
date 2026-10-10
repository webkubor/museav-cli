export function referralCodeFromSearchParams(searchParams: URLSearchParams) {
  const direct = searchParams.get('aff') ?? searchParams.get('ref')
  if (direct) return direct
  // qa#675：根路径 /?aff=X 命中 RequireAuth 会被折进 /login?redirect=%2F%3Faff%3DX，
  // 码只存在于 redirect 的内嵌 query 里——不解这一层，根路径推荐链接 100% 丢码。
  const redirect = searchParams.get('redirect')
  if (redirect) {
    try {
      const inner = new URL(redirect, 'https://placeholder.invalid').searchParams
      return inner.get('aff') ?? inner.get('ref') ?? ''
    } catch {
      return ''
    }
  }
  return ''
}

/**
 * 邀请码会话级持久化（需求方#714）：推荐链接 /signup?aff=X 在国内市场要经历
 * /signup → /login 的市场重定向，OAuth 登录还会离站回跳——只靠 URL query 撑不到
 * 注册请求发出的那一刻。首跳解析到码就落 sessionStorage，后续页面 URL 丢了也能取回；
 * 注册成功后清掉，避免下一个账号在同一标签页里被错误归因。
 */
const REFERRAL_CODE_SESSION_KEY = 'mg_referral_code'

/** 合法邀请码：字母数字与 -_，1–64 位。外部链接塞的超长 / 异形值一律当作没有（prd46#1242） */
const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const validReferralCode = (code: string | null | undefined) => (code && REFERRAL_CODE_PATTERN.test(code) ? code : '')

/** 解析邀请码：URL 命中即持久化并返回；否则回退 sessionStorage 里上次持久化的值。 */
export function resolveReferralCode(searchParams: URLSearchParams): string {
  const rawFromUrl = referralCodeFromSearchParams(searchParams)
  const fromUrl = validReferralCode(rawFromUrl)
  try {
    if (fromUrl) {
      sessionStorage.setItem(REFERRAL_CODE_SESSION_KEY, fromUrl)
      return fromUrl
    }
    // URL 带了码但格式无效：以本次链接为准，清掉旧缓存，不回退到上一个推荐人
    if (rawFromUrl) {
      sessionStorage.removeItem(REFERRAL_CODE_SESSION_KEY)
      return ''
    }
    return validReferralCode(sessionStorage.getItem(REFERRAL_CODE_SESSION_KEY))
  } catch {
    return fromUrl
  }
}

/** 注册成功后清除持久化的邀请码，防止串号归因。 */
export function clearPersistedReferralCode() {
  try {
    sessionStorage.removeItem(REFERRAL_CODE_SESSION_KEY)
  } catch {
    /* sessionStorage 不可用时本来就没存，忽略 */
  }
}
