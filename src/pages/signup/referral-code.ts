export function referralCodeFromSearchParams(searchParams: URLSearchParams) {
  return searchParams.get('aff') ?? searchParams.get('ref') ?? ''
}

/**
 * 邀请码会话级持久化（需求方#714）：推荐链接 /signup?aff=X 在国内市场要经历
 * /signup → /login 的市场重定向，OAuth 登录还会离站回跳——只靠 URL query 撑不到
 * 注册请求发出的那一刻。首跳解析到码就落 sessionStorage，后续页面 URL 丢了也能取回；
 * 注册成功后清掉，避免下一个账号在同一标签页里被错误归因。
 */
const REFERRAL_CODE_SESSION_KEY = 'mg_referral_code'

/** 解析邀请码：URL 命中即持久化并返回；否则回退 sessionStorage 里上次持久化的值。 */
export function resolveReferralCode(searchParams: URLSearchParams): string {
  const fromUrl = referralCodeFromSearchParams(searchParams)
  try {
    if (fromUrl) {
      sessionStorage.setItem(REFERRAL_CODE_SESSION_KEY, fromUrl)
      return fromUrl
    }
    return sessionStorage.getItem(REFERRAL_CODE_SESSION_KEY) ?? ''
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
