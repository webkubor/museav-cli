/**
 * 认证与会话（§二）
 * 路由：/login、/register、/logout
 * API：POST /auth/register、POST /auth/login、POST /auth/logout、GET /auth/session、GET /auth/oauth/:provider/authorize、POST /account/active-tenant
 */
import { apiBaseUrl, get, post } from '@/lib/request'
import type { AuthMailTTLResponse } from '@/interfaces/auth'
import type {
  CheckLoginEmailResult,
  LoginRequest,
  LoginResult,
  RegisterRequest,
  RegisterResult,
  SessionResult,
  SwitchTenantRequest,
} from '@/types'

/** 发送注册邮箱验证码（5 分钟有效；邮箱已注册返回 40901） */
export function sendEmailCode(email: string) {
  return post<AuthMailTTLResponse>('auth/email-code/send', { email })
}

/** 邮箱密码注册（注册即登录，自动下发 session cookie） */
export function register(body: RegisterRequest) {
  return post<RegisterResult>('auth/register', body)
}

/** 登录前邮箱校验（两步登录第一步） */
export function checkLoginEmail(email: string) {
  return post<CheckLoginEmailResult>('auth/email/check', { email })
}

/** 邮箱密码登录 */
export function login(body: LoginRequest) {
  return post<LoginResult>('auth/login', body)
}

/** 登出（清除 session cookie） */
export function logout() {
  return post<null>('auth/logout', {})
}

/** 获取当前会话信息（未登录返回 40101） */
export function getSession() {
  return get<SessionResult>('auth/session')
}

/**
 * 构造 OAuth 登录起步 URL（Google / GitHub / WeChat）。
 * 前端直接跳转即可，无需 fetch 调用，后端 302 到厂商授权页。
 *
 * @param provider  - 'google' | 'github' | 'wechat'
 * @param redirect  - 授权成功后回跳路径，默认 '/'
 */
export type OAuthProvider = 'google' | 'github' | 'wechat'

export function oauthAuthorizeUrl(
  provider: OAuthProvider,
  redirect = '/'
): string {
  return `${apiBaseUrl()}/api/v1/auth/oauth/${provider}/authorize?redirect=${encodeURIComponent(redirect)}`
}

/** 切换活跃 Tenant（前端需同步更新 X-Tenant-Id 和 localStorage） */
export function switchTenant(body: SwitchTenantRequest) {
  return post<null>('account/active-tenant', body)
}

/** 发送密码重置邮件 */
export function forgotPassword(email: string) {
  const resetUrl = `${window.location.origin}/reset-password`
  return post<AuthMailTTLResponse>('auth/password/forgot', { email, reset_url: resetUrl })
}

/** 使用重置 token 设置新密码 */
export function resetPassword(token: string, password: string) {
  return post<null>('auth/password/reset', { token, password })
}

/** 独立验证邮箱验证码（用于敏感操作二次确认，如换绑邮箱） */
export function verifyEmailCode(email: string, code: string) {
  return post<null>('auth/email-code/verify', { email, code })
}

// ─── Device（CLI）授权 ────────────────────────────────────────

export interface DeviceAuthorizeRequest {
  client_name?: string
  scope?: string
}

export interface DeviceAuthorizeResult {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

export interface DeviceTokenResult {
  token: string
  token_type: string
}

export type DeviceRequestStatus = 'pending' | 'approved' | 'denied' | 'consumed' | 'expired'

export interface DeviceGetRequestResult {
  status: DeviceRequestStatus
  client_name?: string
  scope?: string
  expires_at?: string
}

/** CLI 设备码登录初始化，返回 device_code 和展示给用户的 user_code */
export function deviceAuthorize(body: DeviceAuthorizeRequest = {}) {
  return post<DeviceAuthorizeResult>('auth/device/authorize', body)
}

/** 浏览器登录态查询 user_code 当前授权状态；授权页加载时预检，非 pending 直接展示结果而不显示确认按钮 */
export function getDeviceRequest(user_code: string) {
  return get<DeviceGetRequestResult>('auth/device/request', { user_code })
}

/** 当前登录用户批准 CLI 登录并绑定到指定租户（需携带 CSRF Token） */
export function deviceApprove(user_code: string, tenant_id: string) {
  return post<null>('auth/device/approve', { user_code, tenant_id })
}

/** CLI 轮询获取登录凭证，审批完成后返回 token（不设置 cookie） */
export function deviceToken(device_code: string) {
  return post<DeviceTokenResult>('auth/device/token', { device_code })
}
