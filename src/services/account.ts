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
 * 绑定邮箱到当前账号（qa#397）。先经 /auth/email-code/send 发码，再用邮箱 + 验证码绑定。
 * 契约：POST /account/email/bind { email, code }（Swagger account.BindEmailRequest）。
 */
export function bindEmail(email: string, code: string) {
  return post<AccountProfile | null>('account/email/bind', { email, code })
}

/**
 * 换绑手机号 / 邮箱（shared/modelgo_prd#837，三步：验身 → 验新凭证 → 完成）。
 *
 * ⚠️ 后端契约未定（#837 卡 @duanlingxiao，note 15519 已列四问），下面两个端点是前端按原型
 * 流程给出的**提案**，后端落地前打到 test 返回 40401，UI 层把 40401 映射成「换绑服务暂未开放」。
 * 提案要点（尽量不让后端维护跨步骤状态）：
 *   POST /account/phone/rebind { phone, code, current_channel, current_code }
 *   POST /account/email/rebind { email, code, current_channel, current_code }
 *   - current_channel：第一步验身用的当前凭证，'phone' | 'email'（有手机号优先手机号）；
 *     current_code：发到该凭证的验证码。两码同请求提交，后端一次性校验，无需 ticket。
 *   - 发码复用现有 /auth/sms-code/send、/auth/email-code/send。
 *   - 新号/邮箱已被占用、换绑频率超限 → 各自独立业务码 + 中文 msg，前端直接透出 msg。
 * 响应沿用 bind 接口口径：返回更新后的 AccountProfile，或 null（前端自行 invalidate）。
 */
export type RebindCurrentChannel = 'phone' | 'email'

export interface RebindCredential {
  current_channel: RebindCurrentChannel
  current_code: string
}

export function rebindPhone(phone: string, code: string, credential: RebindCredential) {
  return post<AccountProfile | null>('account/phone/rebind', { phone, code, ...credential })
}

export function rebindEmail(email: string, code: string, credential: RebindCredential) {
  return post<AccountProfile | null>('account/email/rebind', { email, code, ...credential })
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
