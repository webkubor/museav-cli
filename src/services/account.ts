/**
 * 账号管理（§三）
 * 路由：/account/profile、/account/settings
 * API：GET|PATCH /account/profile、PUT /account/avatar、POST|DELETE /account/connect/:provider、POST /account/password、POST /account/delete-request
 */
import { del, get, patch, post, upload } from '@/lib/request'
import type { AvatarResponse, OAuthAuthorizeResponse, OAuthProvider } from '@/interfaces/account'
import type {
  AccountProfile,
  ChangePasswordRequest,
  DeleteAccountRequest,
  DeleteAccountResult,
  UpdateProfileRequest,
} from '@/types'

/** 获取当前账号的个人资料 */
export function getProfile() {
  return get<AccountProfile>('account/profile')
}

/** 更新个人资料（当前仅允许修改 display_name） */
export function updateProfile(body: UpdateProfileRequest) {
  return patch<AccountProfile>('account/profile', body)
}

/**
 * 绑定手机号（国内环境唯一性校验）。先经 /auth/sms-code/send 发码，再用手机号 + 验证码绑定。
 * 契约：POST /account/phone/bind { phone, code }（Swagger account.BindPhoneRequest）。
 */
export function bindPhone(phone: string, code: string) {
  return post<AccountProfile | null>('account/phone/bind', { phone, code })
}

/**
 * 上传头像。
 * 文件限制：≤ 2 MiB，仅支持 PNG / JPG / WebP。
 */
export function uploadAvatar(file: File): Promise<AvatarResponse> {
  const formData = new FormData()
  formData.append('file', file)
  return upload<AvatarResponse>('put', 'account/avatar', formData)
}

/** 发起 OAuth 关联起步，返回厂商授权 URL */
export function connectOAuth(
  provider: OAuthProvider,
  redirect: string
): Promise<OAuthAuthorizeResponse> {
  return post<OAuthAuthorizeResponse>(`account/connect/${provider}`, { redirect })
}

/** 断开 OAuth 关联（至少保留 1 种登录方式，否则 42201） */
export function disconnectOAuth(provider: OAuthProvider) {
  return del<null>(`account/connect/${provider}`)
}

/** 修改密码 */
export function changePassword(body: ChangePasswordRequest) {
  return post<null>('account/password', body)
}

/** 申请删除账户（7 天宽限期） */
export function deleteAccount(body: DeleteAccountRequest) {
  return post<DeleteAccountResult>('account/delete-request', body)
}
